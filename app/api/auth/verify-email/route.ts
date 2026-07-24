import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { users } from "@/db/schema";
import { consumeAuthToken } from "@/lib/authTokens";
import { checkRateLimit, clientIpFrom, rateLimitMessage } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rate = await checkRateLimit(`verify-email:${clientIpFrom(request)}`, {
    max: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "인증 링크가 올바르지 않아요." }, { status: 400 });
  }

  const consumed = await consumeAuthToken("email_verify", token);
  if (!consumed) {
    return NextResponse.json(
      { error: "인증 링크가 만료되었거나 이미 사용됐어요. 다시 요청해주세요." },
      { status: 400 },
    );
  }

  const database = await getReadyDb();
  await database
    .update(users)
    .set({ emailVerifiedAt: new Date().toISOString() })
    .where(eq(users.id, consumed.userId));

  return NextResponse.json({ ok: true });
}
