import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { users } from "@/db/schema";
import {
  createReauthToken,
  getSessionUser,
  hasPassword,
  reauthCookieOptions,
  REAUTH_COOKIE_NAME,
  verifyPassword,
} from "@/lib/auth";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Google 계정 연결처럼 민감한 작업 전에, 로그인된 사용자가 방금 비밀번호를
// 다시 입력했다는 사실을 5분짜리 별도 쿠키(pdm_reauth)로 증명한다.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const rate = await checkRateLimit(`reauth:${user.id}`, { max: 10, windowMs: 15 * 60 * 1000 });
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
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row || !hasPassword(row.passwordHash)) {
    return NextResponse.json(
      { error: "이 계정은 비밀번호가 설정되어 있지 않아요." },
      { status: 400 },
    );
  }

  const password = body.password ?? "";
  if (!password || !(await verifyPassword(password, row.passwordHash))) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않아요." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(REAUTH_COOKIE_NAME, createReauthToken(user.id), reauthCookieOptions());
  return response;
}
