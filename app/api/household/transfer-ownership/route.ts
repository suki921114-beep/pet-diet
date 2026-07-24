import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { householdMembers, users } from "@/db/schema";
import { hasPassword, REAUTH_COOKIE_NAME, verifyPassword, verifyReauthToken } from "@/lib/auth";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";
import { requireHouseholdOwner, requireSessionUser } from "../_lib";

export const dynamic = "force-dynamic";

// 소유권 이전은 민감한 작업이라 "방금 다시 인증했다"는 증거를 요구한다:
// 비밀번호가 있는 계정은 비밀번호를, 없는(Google 전용) 계정은 직전에
// /api/auth/google/start?mode=reauth 왕복으로 얻은 pdm_reauth 쿠키를 본다.
// 단순히 이메일을 다시 입력하는 건 재인증으로 치지 않는다.
export async function POST(request: Request) {
  const { user, response } = await requireSessionUser();
  if (!user) return response;

  const access = await requireHouseholdOwner(user.id);
  if (!access.ok) return access.response;
  const { household, membership } = access;

  const rate = await checkRateLimit(`transfer-ownership:${user.id}`, { max: 10, windowMs: 15 * 60 * 1000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  let body: { targetUserId?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const targetUserId = body.targetUserId?.trim();
  if (!targetUserId || targetUserId === membership.userId) {
    return NextResponse.json({ error: "이전할 대상을 선택해주세요." }, { status: 400 });
  }

  const database = await getReadyDb();
  const [row] = await database
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "계정을 찾을 수 없어요." }, { status: 404 });
  }

  if (hasPassword(row.passwordHash)) {
    const password = body.password ?? "";
    if (!password || !(await verifyPassword(password, row.passwordHash))) {
      return NextResponse.json({ error: "비밀번호가 올바르지 않아요." }, { status: 401 });
    }
  } else {
    const store = await cookies();
    const reauthCookie = store.get(REAUTH_COOKIE_NAME)?.value;
    if (!reauthCookie || !verifyReauthToken(reauthCookie, user.id)) {
      return NextResponse.json(
        { error: "본인 확인이 필요해요. Google로 다시 인증한 뒤 시도해주세요." },
        { status: 401 },
      );
    }
  }

  const [target] = await database
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, household.id), eq(householdMembers.userId, targetUserId)))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "같은 가족의 구성원이 아니에요." }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "이미 관리자예요." }, { status: 400 });
  }

  try {
    await database.transaction(async (tx) => {
      // WHERE에 이전 역할을 명시해 동시 요청에도 owner가 0명/2명이 되지
      // 않게 한다 — 둘 중 하나라도 예상한 행 수(1)와 다르면 트랜잭션 전체를
      // 롤백한다(다른 요청이 이미 상태를 바꿔놓은 것이므로).
      const demote = await tx
        .update(householdMembers)
        .set({ role: "member" })
        .where(and(eq(householdMembers.id, membership.id), eq(householdMembers.role, "owner")));
      if (demote.rowsAffected !== 1) throw new Error("owner-state-changed");

      const promote = await tx
        .update(householdMembers)
        .set({ role: "owner" })
        .where(and(eq(householdMembers.id, target.id), eq(householdMembers.role, "member")));
      if (promote.rowsAffected !== 1) throw new Error("target-state-changed");
    });
  } catch (error) {
    console.error("[household] 소유권 이전 실패", error);
    return NextResponse.json(
      { error: "소유권 이전에 실패했어요. 새로고침 후 다시 시도해주세요." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
