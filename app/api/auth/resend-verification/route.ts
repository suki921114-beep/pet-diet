import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { createAuthToken } from "@/lib/authTokens";
import { sendVerificationEmail } from "@/lib/email";
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
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
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

  const token = await createAuthToken("email_verify", user.id, user.email);
  const result = await sendVerificationEmail(user.email, token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
