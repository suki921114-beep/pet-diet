import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { householdInvitations, householdMembers, users } from "@/db/schema";
import { hashToken } from "@/lib/auth";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";
import { getMembershipByUserId, requireSessionUser } from "../../_lib";

export const dynamic = "force-dynamic";

// 초대 수락. 로그인은 requireSessionUser가 이미 확인한다 — 로그아웃 상태로
// 이 라우트를 직접 호출하면 401을 돌려주고, 실제 로그인/회원가입 유도는
// 클라이언트(초대 수락 페이지)가 안전한 내부 경로로 처리한다.
export async function POST(request: Request) {
  const { user, response } = await requireSessionUser();
  if (!user) return response;

  const rate = await checkRateLimit(`invite-accept:${user.id}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요.", code: "invalid" }, { status: 400 });
  }
  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "초대 링크가 올바르지 않아요.", code: "not_found" }, { status: 400 });
  }

  const database = await getReadyDb();
  const tokenHash = hashToken(token);
  const [invitation] = await database
    .select()
    .from(householdInvitations)
    .where(eq(householdInvitations.tokenHash, tokenHash))
    .limit(1);
  if (!invitation) {
    return NextResponse.json(
      { error: "초대를 찾을 수 없거나 유효하지 않아요.", code: "not_found" },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  if (invitation.cancelledAt) {
    return NextResponse.json({ error: "취소된 초대예요.", code: "cancelled" }, { status: 410 });
  }
  if (invitation.acceptedAt) {
    return NextResponse.json({ error: "이미 사용된 초대예요.", code: "used" }, { status: 410 });
  }
  if (!invitation.sentAt) {
    return NextResponse.json(
      { error: "아직 발송되지 않은 초대예요. 잠시 후 다시 시도해주세요.", code: "not_sent" },
      { status: 409 },
    );
  }
  if (invitation.expiresAt <= now) {
    return NextResponse.json({ error: "만료된 초대예요.", code: "expired" }, { status: 410 });
  }

  const [userRow] = await database
    .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!userRow) {
    return NextResponse.json({ error: "계정을 찾을 수 없어요.", code: "not_found" }, { status: 404 });
  }
  if (!userRow.emailVerifiedAt) {
    return NextResponse.json(
      { error: "이메일 인증을 먼저 완료해주세요.", code: "unverified_email" },
      { status: 403 },
    );
  }

  const normalizedUserEmail = userRow.email.trim().toLowerCase();
  if (normalizedUserEmail !== invitation.email) {
    // 초대한 사람에게는 "가입 여부"나 "다른 계정 존재 여부" 같은 정보를
    // 노출하지 않는다 — 수락하는 사람에게만 원인을 알려준다.
    return NextResponse.json(
      { error: "로그인한 계정의 이메일이 초대받은 이메일과 달라요.", code: "email_mismatch" },
      { status: 403 },
    );
  }

  const existingMembership = await getMembershipByUserId(user.id);
  if (existingMembership) {
    if (existingMembership.household.id === invitation.householdId) {
      return NextResponse.json({ ok: true, alreadyMember: true });
    }
    return NextResponse.json(
      {
        error: "이미 다른 가족에 속해 있어요. 먼저 기존 가족에서 나간 뒤 다시 시도해주세요.",
        code: "already_in_other_household",
      },
      { status: 409 },
    );
  }

  try {
    await database.transaction(async (tx) => {
      // acceptedAt이 아직 null일 때만 값을 채운다 — 동시에 같은 토큰으로
      // 두 번 수락 요청이 와도 정확히 하나만 이 조건을 통과한다.
      const claim = await tx
        .update(householdInvitations)
        .set({ acceptedAt: now })
        .where(
          and(
            eq(householdInvitations.id, invitation.id),
            isNull(householdInvitations.acceptedAt),
            isNull(householdInvitations.cancelledAt),
          ),
        );
      if (claim.rowsAffected !== 1) throw new Error("invitation-already-claimed");

      await tx.insert(householdMembers).values({
        id: randomUUID(),
        householdId: invitation.householdId,
        userEmail: normalizedUserEmail,
        displayName: user.displayName,
        role: "member",
        userId: user.id,
      });
    });
  } catch (error) {
    console.error("[household] 초대 수락 실패", error);
    return NextResponse.json(
      { error: "초대를 처리하지 못했어요. 새로고침 후 다시 시도해주세요.", code: "conflict" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
