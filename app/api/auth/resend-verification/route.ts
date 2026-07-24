import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { createAuthToken, invalidateAuthToken } from "@/lib/authTokens";
import { isEmailServiceConfigured, sendVerificationEmail } from "@/lib/email";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const rate = await checkRateLimit(`resend-verification:${user.id}`, {
    max: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(), code: "RATE_LIMITED" }, { status: 429 });
  }

  const database = await getReadyDb();
  const [row] = await database
    .select({ emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (row?.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  // 발송 가능 여부를 먼저 확인해서, 어차피 실패할 게 뻔한 발송을 위해
  // 토큰을 만들고 속도 제한 카운트를 소모하지 않는다. 값(API 키/발신
  // 주소) 자체는 클라이언트에 노출하지 않고, 명확한 오류 코드만 준다.
  if (!isEmailServiceConfigured()) {
    return NextResponse.json(
      { error: "현재 인증 메일을 보낼 수 없습니다. 관리자 설정이 필요합니다.", code: "EMAIL_SERVICE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const token = await createAuthToken("email_verify", user.id, user.email);
  const result = await sendVerificationEmail(user.email, token);
  if (!result.ok) {
    // 아무도 받지 못한 채로 "사용 가능한" 인증 링크가 남지 않도록 즉시 폐기한다.
    await invalidateAuthToken(token);
    return NextResponse.json(
      { error: "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해주세요.", code: "SEND_FAILED" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
