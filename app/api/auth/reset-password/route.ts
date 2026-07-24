import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  hashPassword,
  revokeAllSessionsForUser,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { consumeAuthToken } from "@/lib/authTokens";
import { checkRateLimit, clientIpFrom, rateLimitMessage } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rate = await checkRateLimit(`reset-password:${clientIpFrom(request)}`, {
    max: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  let body: { token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const token = body.token?.trim();
  const password = body.password ?? "";
  if (!token) {
    return NextResponse.json({ error: "재설정 링크가 올바르지 않아요." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "비밀번호는 8자 이상이어야 해요." }, { status: 400 });
  }

  const consumed = await consumeAuthToken("password_reset", token);
  if (!consumed) {
    return NextResponse.json(
      { error: "재설정 링크가 만료되었거나 이미 사용됐어요. 다시 요청해주세요." },
      { status: 400 },
    );
  }

  const database = await getReadyDb();
  const [user] = await database.select().from(users).where(eq(users.id, consumed.userId)).limit(1);
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "계정을 찾을 수 없어요." }, { status: 404 });
  }

  const passwordHash = await hashPassword(password);
  await database.update(users).set({ passwordHash }).where(eq(users.id, user.id));

  // 다른 기기에 남아있던 로그인을 포함해 모든 세션을 폐기하고, 방금 이
  // 재설정을 완료한 이 기기에는 새 세션을 새로 발급한다.
  await revokeAllSessionsForUser(user.id);
  const rawSessionToken = await createSession(user.id);

  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, displayName: user.displayName },
  });
  response.cookies.set(SESSION_COOKIE_NAME, rawSessionToken, sessionCookieOptions());
  return response;
}
