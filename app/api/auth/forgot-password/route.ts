import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { users } from "@/db/schema";
import { hasPassword } from "@/lib/auth";
import { createAuthToken } from "@/lib/authTokens";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, clientIpFrom, rateLimitMessage } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// 이메일이 실제로 가입돼 있는지 여부를 응답 차이로 노출하지 않는다 — 항상
// 같은 성공 메시지를 돌려주고, 실제 메일 발송은 가입된 계정에만 이뤄진다.
const GENERIC_OK = {
  ok: true,
  message: "해당 이메일로 가입된 계정이 있다면, 비밀번호 재설정 링크를 보냈어요.",
};

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "올바른 이메일을 입력해주세요." }, { status: 400 });
  }

  const ipRate = await checkRateLimit(`forgot-password-ip:${clientIpFrom(request)}`, {
    max: 10,
    windowMs: 60 * 60 * 1000,
  });
  const emailRate = await checkRateLimit(`forgot-password-email:${email}`, {
    max: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!ipRate.allowed || !emailRate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  const database = await getReadyDb();
  const [user] = await database.select().from(users).where(eq(users.email, email)).limit(1);

  // 존재하지 않는 이메일, 탈퇴한 계정, Google 전용(비밀번호 없음) 계정에는
  // 메일을 보내지 않는다. 다만 응답은 항상 동일한 메시지를 돌려준다.
  if (user && !user.deletedAt && hasPassword(user.passwordHash)) {
    const token = await createAuthToken("password_reset", user.id, user.email);
    await sendPasswordResetEmail(user.email, token);
  }

  return NextResponse.json(GENERIC_OK);
}
