import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { authAccounts, users } from "@/db/schema";
import {
  createSession,
  getSessionUser,
  hashPassword,
  hasPassword,
  revokeAllSessionsForUser,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from "@/lib/auth";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// 로그인 상태에서 비밀번호를 바꾸거나(기존 비밀번호가 있는 계정), Google
// 전용 계정이 처음으로 비밀번호를 설정할 때(기존 비밀번호 없음) 둘 다 이
// 라우트가 처리한다.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const rate = await checkRateLimit(`change-password:${user.id}`, { max: 10, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const newPassword = body.newPassword ?? "";
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "새 비밀번호는 8자 이상이어야 해요." }, { status: 400 });
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

  const alreadyHasPassword = hasPassword(row.passwordHash);
  if (alreadyHasPassword) {
    const currentPassword = body.currentPassword ?? "";
    if (!currentPassword || !(await verifyPassword(currentPassword, row.passwordHash))) {
      return NextResponse.json({ error: "현재 비밀번호가 올바르지 않아요." }, { status: 401 });
    }
  }

  const passwordHash = await hashPassword(newPassword);
  await database.update(users).set({ passwordHash }).where(eq(users.id, user.id));

  if (!alreadyHasPassword) {
    const [existingPasswordAccount] = await database
      .select({ id: authAccounts.id })
      .from(authAccounts)
      .where(and(eq(authAccounts.userId, user.id), eq(authAccounts.provider, "password")))
      .limit(1);
    if (!existingPasswordAccount) {
      await database.insert(authAccounts).values({ id: randomUUID(), userId: user.id, provider: "password" });
    }
  }

  // 모든 세션을 폐기한 뒤, 방금 이 작업을 수행한 현재 기기에는 새 세션을
  // 발급한다(= 다른 기기 로그인은 모두 끊기지만 이 화면에서는 로그아웃되지 않음).
  await revokeAllSessionsForUser(user.id);
  const rawSessionToken = await createSession(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, rawSessionToken, sessionCookieOptions());
  return response;
}
