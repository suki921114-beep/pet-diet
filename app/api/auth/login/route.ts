import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { users } from "@/db/schema";
import { createSession, sessionCookieOptions, SESSION_COOKIE_NAME, verifyPassword } from "@/lib/auth";
import { checkRateLimit, clientIpFrom, rateLimitMessage } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rate = await checkRateLimit(`login:${clientIpFrom(request)}`, {
    max: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "이메일과 비밀번호를 입력해주세요." }, { status: 400 });
  }

  const database = await getReadyDb();
  const [user] = await database.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.deletedAt || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않아요." }, { status: 401 });
  }

  const rawSessionToken = await createSession(user.id);
  const response = NextResponse.json({
    user: { id: user.id, email: user.email, displayName: user.displayName },
  });
  response.cookies.set(SESSION_COOKIE_NAME, rawSessionToken, sessionCookieOptions());
  return response;
}
