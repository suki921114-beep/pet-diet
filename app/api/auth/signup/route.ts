import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { authAccounts, users } from "@/db/schema";
import { createSession, hashPassword, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";
import { createAuthToken } from "@/lib/authTokens";
import { sendVerificationEmail } from "@/lib/email";
import { checkRateLimit, clientIpFrom, rateLimitMessage } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rate = await checkRateLimit(`signup:${clientIpFrom(request)}`, {
    max: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  let body: { email?: string; password?: string; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const displayName = body.displayName?.trim() || null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "올바른 이메일을 입력해주세요." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "비밀번호는 8자 이상이어야 해요." }, { status: 400 });
  }

  const database = await getReadyDb();
  const [existing] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: "이미 가입된 이메일이에요." }, { status: 409 });
  }

  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  await database.insert(users).values({ id, email, passwordHash, displayName });
  await database.insert(authAccounts).values({ id: randomUUID(), userId: id, provider: "password" });

  // 인증 메일 발송은 회원가입 성공 여부와 무관하다. 발송에 실패해도(예: 이메일
  // 서비스 미설정) 계정은 그대로 만들어지고, 클라이언트에 그 사실만 알려준다.
  const verifyToken = await createAuthToken("email_verify", id, email);
  const emailResult = await sendVerificationEmail(email, verifyToken);

  const rawSessionToken = await createSession(id);
  const response = NextResponse.json({
    user: { id, email, displayName },
    emailVerificationSent: emailResult.ok,
  });
  response.cookies.set(SESSION_COOKIE_NAME, rawSessionToken, sessionCookieOptions());
  return response;
}
