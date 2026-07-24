import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { authAccounts, users } from "@/db/schema";
import {
  getSessionUser,
  hasPassword,
  revokeAllSessionsForUser,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from "@/lib/auth";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";
import { leaveHouseholdIfMember } from "../../household/_lib";

export const dynamic = "force-dynamic";

// 계정 탈퇴: 소프트 삭제(deletedAt) + 이메일 익명화. 행 자체는 지우지 않는다
// (동의 이력 등 감사 기록은 남기고, deletedAt이 있으면 로그인/세션 검증에서
// 항상 거부되도록 이미 다른 곳(getSessionUser, 로그인, 재설정)에 반영돼있다).
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const rate = await checkRateLimit(`delete-account:${user.id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  let body: { password?: string; confirmEmail?: string };
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

  // 비밀번호가 있는 계정은 비밀번호로, 비밀번호가 없는(Google 전용) 계정은
  // 본인 이메일을 직접 입력하는 것으로 "실수로 누른 게 아님"을 확인한다.
  if (hasPassword(row.passwordHash)) {
    const password = body.password ?? "";
    if (!password || !(await verifyPassword(password, row.passwordHash))) {
      return NextResponse.json({ error: "비밀번호가 올바르지 않아요." }, { status: 401 });
    }
  } else {
    const confirmEmail = body.confirmEmail?.trim().toLowerCase() ?? "";
    if (!confirmEmail || confirmEmail !== row.email.toLowerCase()) {
      return NextResponse.json({ error: "이메일이 일치하지 않아요." }, { status: 401 });
    }
  }

  // 가족에 속해 있었다면 먼저 "나가기"와 동일한 방식으로 정리한다(가족
  // 권한/소유권 로직은 이번 단계에서 바꾸지 않고, 기존 나가기 로직을 그대로
  // 재사용한다). 이메일을 바꾸기 전에 해야 household_members가 올바른
  // user_email로 정리된다.
  await leaveHouseholdIfMember(row.email);

  // 이메일을 익명화해서 나중에 같은 이메일로 재가입할 수 있게 한다.
  const tombstoneEmail = `deleted-${randomUUID()}@deleted.local`;
  await database
    .update(users)
    .set({
      email: tombstoneEmail,
      passwordHash: "",
      displayName: null,
      deletedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));

  // 로그인 수단을 지운다 — 특히 Google의 (provider, provider_subject) 유니크
  // 인덱스를 비워둬야, 나중에 같은 Google 계정으로 다시 가입할 때 막히지 않는다.
  await database.delete(authAccounts).where(eq(authAccounts.userId, user.id));

  await revokeAllSessionsForUser(user.id);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
