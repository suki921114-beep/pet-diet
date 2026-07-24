import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getReadyDb } from "@/db";
import { authTokens } from "@/db/schema";
import { hashToken, randomToken } from "@/lib/auth";

export type AuthTokenPurpose = "email_verify" | "password_reset";

const TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  email_verify: 1000 * 60 * 60 * 24, // 24시간
  password_reset: 1000 * 60 * 30, // 30분
};

// 이메일로 보낼 원본 토큰을 만들고, DB에는 해시만 남긴다. 같은 목적(purpose)의
// 이전 미사용 토큰이 있어도 그냥 새로 하나 더 만든다(재전송 시 이전 링크는
// 자연스럽게 소멸 시각까지는 유효하지만, 어차피 각 토큰은 1회용이라 먼저
// 쓰인 것부터 소모되고 나머지는 만료로 정리된다).
export async function createAuthToken(
  purpose: AuthTokenPurpose,
  userId: string,
  email: string,
): Promise<string> {
  const database = await getReadyDb();
  const rawToken = randomToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS[purpose]).toISOString();
  await database.insert(authTokens).values({
    id: randomUUID(),
    purpose,
    tokenHash: hashToken(rawToken),
    userId,
    email,
    expiresAt,
  });
  return rawToken;
}

// 토큰을 소비한다: 목적이 맞고, 만료되지 않았고, 아직 쓰이지 않은 토큰만
// 유효하다고 인정하고, 그 자리에서 즉시 사용 처리(1회용)한다.
export async function consumeAuthToken(
  purpose: AuthTokenPurpose,
  rawToken: string,
): Promise<{ userId: string; email: string } | null> {
  const database = await getReadyDb();
  const tokenHash = hashToken(rawToken);
  const [row] = await database
    .select()
    .from(authTokens)
    .where(
      and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)),
    )
    .limit(1);
  if (!row) return null;
  if (row.expiresAt <= new Date().toISOString()) return null;

  await database
    .update(authTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(authTokens.id, row.id));

  return { userId: row.userId, email: row.email };
}
