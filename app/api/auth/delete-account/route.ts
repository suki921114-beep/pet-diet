import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { authAccounts, authSessions, authTokens, households, householdInvitations, householdMembers, users } from "@/db/schema";
import {
  getSessionUser,
  hasPassword,
  REAUTH_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  verifyPassword,
  verifyReauthToken,
} from "@/lib/auth";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";
import { getMembershipByUserId } from "../../household/_lib";

export const dynamic = "force-dynamic";

// 계정 탈퇴. 세 가지로 갈린다:
// 1) 가족에 속해있지 않거나 일반 member → 멤버십만(있다면) 지우고 계정 익명화
// 2) 다른 구성원이 남은 owner → 차단(먼저 소유권 이전 필요)
// 3) 혼자 남은 owner → 가족 공간(households.data 포함)까지 한 트랜잭션으로 삭제
// 모든 DB 변경은 하나의 트랜잭션 안에서 일어나서, 중간에 실패해도 "계정만
// 지워지고 가족은 남는다" 같은 어중간한 상태가 생기지 않는다.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const rate = await checkRateLimit(`delete-account:${user.id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const database = await getReadyDb();
  const [row] = await database
    .select({ passwordHash: users.passwordHash, email: users.email })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "계정을 찾을 수 없어요." }, { status: 404 });
  }

  // 재인증: 비밀번호가 있으면 비밀번호로, Google 전용 계정은 이메일 재입력
  // (비밀정보가 아니라 충분하지 않음) 대신 방금 완료한 Google 재인증
  // (pdm_reauth 쿠키)으로 확인한다.
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
        { error: "본인 확인이 필요해요. Google로 다시 인증한 뒤 탈퇴를 진행해주세요." },
        { status: 401 },
      );
    }
  }

  const membership = await getMembershipByUserId(user.id);
  if (membership && membership.membership.role === "owner") {
    const otherMembers = await database
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(eq(householdMembers.householdId, membership.household.id));
    if (otherMembers.length > 1) {
      return NextResponse.json(
        {
          error:
            "다른 구성원이 남아있는 동안에는 관리자 계정을 탈퇴할 수 없어요. 먼저 다른 구성원에게 소유권을 이전해주세요.",
        },
        { status: 409 },
      );
    }
  }

  const tombstoneEmail = `deleted-${randomUUID()}@deleted.local`;
  const now = new Date().toISOString();

  try {
    await database.transaction(async (tx) => {
      // 이 UPDATE 하나가 "이 탈퇴 요청이 실제로 처리할 차례를 얻었는지"를
      // 결정한다 — deletedAt이 이미 채워져 있다면(동시에 들어온 다른 탈퇴
      // 요청이 먼저 커밋됨) 0건이 되어 즉시 롤백한다.
      const claimed = await tx
        .update(users)
        .set({ email: tombstoneEmail, passwordHash: "", displayName: null, deletedAt: now })
        .where(and(eq(users.id, user.id), isNull(users.deletedAt)));
      if (claimed.rowsAffected !== 1) throw new Error("already-deleted");

      if (membership) {
        // pre-check와 트랜잭션 시작 사이에 다른 요청이 끼어들었을 수 있으니,
        // 락을 잡은 뒤의 최신 상태를 다시 한번 확인한다.
        const currentMembers = await tx
          .select()
          .from(householdMembers)
          .where(eq(householdMembers.householdId, membership.household.id));
        const self = currentMembers.find((m) => m.id === membership.membership.id);
        if (self) {
          if (self.role === "owner") {
            if (currentMembers.length > 1) throw new Error("other-members-joined");
            await tx
              .delete(householdInvitations)
              .where(eq(householdInvitations.householdId, membership.household.id));
            await tx.delete(householdMembers).where(eq(householdMembers.id, self.id));
            await tx.delete(households).where(eq(households.id, membership.household.id));
          } else {
            await tx.delete(householdMembers).where(eq(householdMembers.id, self.id));
          }
        }
      }

      await tx.delete(authAccounts).where(eq(authAccounts.userId, user.id));
      await tx.delete(authTokens).where(eq(authTokens.userId, user.id));
      await tx
        .update(authSessions)
        .set({ revokedAt: now })
        .where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt)));
    });
  } catch (error) {
    console.error("[account] 탈퇴 처리 실패", error);
    const message = error instanceof Error ? error.message : "";
    if (message === "other-members-joined") {
      return NextResponse.json(
        {
          error:
            "처리하는 동안 다른 구성원이 들어와서 탈퇴를 완료하지 못했어요. 다시 시도해주세요.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "이미 처리된 요청이거나 탈퇴를 완료하지 못했어요. 새로고침 후 다시 시도해주세요." },
      { status: 409 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  response.cookies.set(REAUTH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
