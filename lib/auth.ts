import { createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { getReadyDb } from "@/db";
import { authSessions, users } from "@/db/schema";

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE_NAME = "pdm_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30일

// 민감한 작업(예: 계정에 Google 로그인 연결) 전에 비밀번호로 다시 확인했다는
// 증표를 짧게만 들고 있는 쿠키. 세션 쿠키와 별개다.
export const REAUTH_COOKIE_NAME = "pdm_reauth";
const REAUTH_MAX_AGE_SECONDS = 60 * 5; // 5분

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

// stored가 빈 문자열이면(=Google 전용 계정처럼 비밀번호가 없는 사용자)
// 어떤 입력으로도 통과하지 않는다. hasPassword()와 항상 같은 결론을 내야 한다.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

// users.password_hash 컬럼은 NOT NULL 제약을 유지한 채(운영 중인 SQLite
// 테이블을 위험하게 재구축하지 않기 위해), "비밀번호 없음"을 빈 문자열로
// 표현한다. Google 전용 계정이 여기 해당한다.
export function hasPassword(passwordHash: string): boolean {
  return passwordHash.trim().length > 0;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    // 로컬 개발 편의용 기본값. 배포 환경(Vercel)에서는 반드시
    // AUTH_SECRET 환경변수를 직접 설정해야 한다.
    return "local-dev-insecure-secret-do-not-use-in-production";
  }
  throw new Error("AUTH_SECRET 환경변수가 없어요. Vercel 프로젝트 설정에 추가해주세요.");
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function timingSafeSignatureMatch(value: string, signature: string): boolean {
  const expected = sign(value);
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length) return false;
  return timingSafeEqual(provided, expectedBuffer);
}

// OAuth 핸드셰이크 쿠키(state/nonce/PKCE code_verifier 등) 같은, 짧게 사는
// 서명된 값을 만들고 검증하는 범용 헬퍼. lib/googleOAuth.ts에서 재사용한다.
export function signPayload(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyPayload<T = Record<string, unknown>>(token: string): T | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if (!timingSafeSignatureMatch(encoded, signature)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

// 이메일 인증·비밀번호 재설정 토큰에 쓰는 무작위 원본 토큰 생성 + 해시.
// 원본 토큰은 이메일 링크에만 담기고, DB에는 해시만 남는다(로그에도 남기지 않음).
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function sessionCookieOptions(maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function reauthCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: REAUTH_MAX_AGE_SECONDS,
  };
}

// 세션 생성: 쿠키에는 이 함수가 반환하는 무작위 원본 토큰만 넣는다.
// DB(auth_sessions)에는 토큰의 SHA-256 해시만 저장되므로, DB가 유출되어도
// 그 자체로 로그인에 재사용할 수 있는 값이 남지 않는다.
export async function createSession(userId: string): Promise<string> {
  const database = await getReadyDb();
  const rawToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  await database.insert(authSessions).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(rawToken),
    expiresAt,
  });
  return rawToken;
}

// 이전 버전(HMAC 자체서명 쿠키)의 세션은 이 새 스킴으로 검증할 수 없으므로
// 자동으로 로그아웃 처리된다(= "안전한 전환" 대신 "명시적 재로그인" 정책).
// 배포 직후 기존 로그인 사용자는 한 번 다시 로그인해야 한다.
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const rawToken = store.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) return null;

  const database = await getReadyDb();
  const tokenHash = hashToken(rawToken);
  const [row] = await database
    .select({
      revokedAt: authSessions.revokedAt,
      expiresAt: authSessions.expiresAt,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      deletedAt: users.deletedAt,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (row.revokedAt) return null;
  // expiresAt/now 모두 ISO 8601 문자열이라 문자열 비교가 시간 순서와 일치한다.
  if (row.expiresAt <= new Date().toISOString()) return null;
  if (row.deletedAt) return null; // 탈퇴(비활성) 계정은 세션이 남아있어도 인증 실패로 처리

  return { id: row.userId, email: row.email, displayName: row.displayName };
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const rawToken = store.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) return;
  const database = await getReadyDb();
  await database
    .update(authSessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(authSessions.tokenHash, hashToken(rawToken)));
}

// 비밀번호 변경·재설정, 계정 탈퇴 시 해당 사용자의 "모든" 세션(현재 세션
// 포함)을 폐기한다. 다른 기기에 남아있던 로그인도 다음 요청부터 막힌다.
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  const database = await getReadyDb();
  await database
    .update(authSessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
}

// Google 계정 연결처럼 민감한 작업 전에 "방금 비밀번호로 재인증했다"는
// 사실을 짧게(5분) 증명하는 토큰. 세션과 별개의 쿠키(REAUTH_COOKIE_NAME)에 담는다.
export function createReauthToken(userId: string): string {
  return signPayload({ userId, expiresAt: Date.now() + REAUTH_MAX_AGE_SECONDS * 1000 });
}

export function verifyReauthToken(token: string, expectedUserId: string): boolean {
  const payload = verifyPayload<{ userId?: string; expiresAt?: number }>(token);
  if (!payload || payload.userId !== expectedUserId) return false;
  if (typeof payload.expiresAt !== "number" || Date.now() > payload.expiresAt) return false;
  return true;
}
