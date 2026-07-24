import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { testDbUrl } from "./testDbUrl";

// 실제 Turso 대신 이 테스트 파일 전용의 임시 SQLite 파일을 쓴다(순수
// in-memory는 트랜잭션 사용 시 격리 문제가 있어 testDbUrl.ts 참고).
// getReadyDb()가 이 값을 읽는 시점은 테스트 안에서 처음 호출될 때(지연 평가)라서
// 여기서 미리 지정해두면 충분하다.
process.env.TURSO_DATABASE_URL = testDbUrl();
process.env.AUTH_SECRET = "test-only-secret-do-not-use-elsewhere";

// lib/auth.ts가 가져다 쓰는 next/headers의 cookies()는 실제 요청 컨텍스트
// 밖(vitest의 node 환경)에서는 동작하지 않으므로, 테스트가 쿠키 값을 직접
// 지정할 수 있도록 가짜 쿠키 저장소로 교체한다.
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";
import { getReadyDb } from "../db";
import { authSessions, authTokens, users } from "../db/schema";
import { consumeAuthToken, createAuthToken } from "../lib/authTokens";
import {
  createReauthToken,
  createSession,
  getSessionUser,
  hashPassword,
  hashToken,
  hasPassword,
  randomToken,
  revokeAllSessionsForUser,
  revokeCurrentSession,
  SESSION_COOKIE_NAME,
  signPayload,
  verifyPassword,
  verifyPayload,
  verifyReauthToken,
} from "../lib/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { safeInternalPath } from "../lib/redirect";

function mockCookie(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && value !== undefined ? { value } : undefined,
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

async function createTestUser(passwordHash = ""): Promise<{ id: string; email: string }> {
  const db = await getReadyDb();
  const id = randomUUID();
  const email = `${id}@example.com`;
  await db.insert(users).values({ id, email, passwordHash });
  return { id, email };
}

beforeAll(async () => {
  // 스키마(테이블) 생성을 미리 한 번 확실히 해둔다.
  await getReadyDb();
});

describe("lib/auth 비밀번호 해시", () => {
  it("올바른 비밀번호는 검증을 통과한다", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("틀린 비밀번호는 검증을 통과하지 못한다", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("빈 문자열(비밀번호 없는 Google 전용 계정) 해시는 어떤 입력으로도 통과하지 않는다", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("", "")).toBe(false);
  });

  it("hasPassword는 빈 문자열(또는 공백)일 때만 false를 반환한다", () => {
    expect(hasPassword("")).toBe(false);
    expect(hasPassword("   ")).toBe(false);
    expect(hasPassword("salt:hash")).toBe(true);
  });
});

describe("lib/auth signPayload / verifyPayload", () => {
  it("서명한 값은 원래 payload로 그대로 복원된다", () => {
    const token = signPayload({ a: 1, b: "two" });
    expect(verifyPayload(token)).toEqual({ a: 1, b: "two" });
  });

  it("서명이 위조되면 검증에 실패한다", () => {
    const token = signPayload({ a: 1 });
    const [encoded] = token.split(".");
    expect(verifyPayload(`${encoded}.deadbeefdeadbeef`)).toBeNull();
  });

  it("내용은 바뀌었는데 서명이 그대로면 검증에 실패한다", () => {
    const token = signPayload({ a: 1 });
    const [, signature] = token.split(".");
    const tamperedEncoded = Buffer.from(JSON.stringify({ a: 999 }), "utf8").toString("base64url");
    expect(verifyPayload(`${tamperedEncoded}.${signature}`)).toBeNull();
  });

  it("형식이 잘못된 토큰은 null을 반환한다", () => {
    expect(verifyPayload("not-a-valid-token")).toBeNull();
    expect(verifyPayload("")).toBeNull();
  });
});

describe("lib/auth randomToken / hashToken", () => {
  it("호출할 때마다 다른 무작위 토큰을 만든다", () => {
    expect(randomToken()).not.toBe(randomToken());
  });

  it("같은 원본 토큰은 항상 같은 해시가 된다(재현 가능)", () => {
    const token = randomToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("다른 원본 토큰은 다른 해시가 된다", () => {
    expect(hashToken(randomToken())).not.toBe(hashToken(randomToken()));
  });
});

describe("lib/auth 재인증(reauth) 토큰", () => {
  it("발급 직후에는 같은 사용자 id에 대해 유효하다", () => {
    const token = createReauthToken("user-1");
    expect(verifyReauthToken(token, "user-1")).toBe(true);
  });

  it("다른 사용자 id로는 유효하지 않다(다른 계정에 재사용 불가)", () => {
    const token = createReauthToken("user-1");
    expect(verifyReauthToken(token, "user-2")).toBe(false);
  });

  it("5분이 지나면 만료되어 더 이상 유효하지 않다", () => {
    vi.useFakeTimers();
    try {
      const token = createReauthToken("user-1");
      vi.advanceTimersByTime(6 * 60 * 1000);
      expect(verifyReauthToken(token, "user-1")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("lib/redirect safeInternalPath (오픈 리다이렉트 방지)", () => {
  it.each([
    [undefined, "/"],
    [null, "/"],
    ["", "/"],
    ["/settings", "/settings"],
    ["relative-path", "/"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    ["http://evil.com/phish", "/"],
    ["/\\evil.com", "/"],
  ])("safeInternalPath(%j) -> %j", (input, expected) => {
    expect(safeInternalPath(input as string | null | undefined)).toBe(expected);
  });
});

describe("세션 생명주기 (in-memory DB)", () => {
  it("세션을 만들면 그 토큰으로 로그인된 사용자가 조회된다", async () => {
    const { id, email } = await createTestUser();
    const rawToken = await createSession(id);
    mockCookie(rawToken);
    expect(await getSessionUser()).toEqual({ id, email, displayName: null });
  });

  it("세션 쿠키가 없으면 로그인 상태가 아니다", async () => {
    mockCookie(undefined);
    expect(await getSessionUser()).toBeNull();
  });

  it("존재하지 않는 토큰은 로그인 상태가 아니다", async () => {
    mockCookie("this-token-was-never-issued");
    expect(await getSessionUser()).toBeNull();
  });

  it("만료된 세션은 로그인 상태로 인정되지 않는다", async () => {
    const { id } = await createTestUser();
    const db = await getReadyDb();
    const rawToken = randomToken();
    await db.insert(authSessions).values({
      id: randomUUID(),
      userId: id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    mockCookie(rawToken);
    expect(await getSessionUser()).toBeNull();
  });

  it("로그아웃(revokeCurrentSession) 이후에는 같은 쿠키로 로그인 상태가 아니다", async () => {
    const { id } = await createTestUser();
    const rawToken = await createSession(id);
    mockCookie(rawToken);
    await revokeCurrentSession();
    expect(await getSessionUser()).toBeNull();
  });

  it("탈퇴 처리(deletedAt)된 계정은 유효한 세션이 남아있어도 로그인 상태가 아니다", async () => {
    const { id } = await createTestUser();
    const rawToken = await createSession(id);
    const db = await getReadyDb();
    await db.update(users).set({ deletedAt: new Date().toISOString() }).where(eq(users.id, id));
    mockCookie(rawToken);
    expect(await getSessionUser()).toBeNull();
  });

  it("revokeAllSessionsForUser는 그 사용자의 모든 세션을(여러 기기 포함) 무효화한다", async () => {
    const { id } = await createTestUser();
    const tokenA = await createSession(id);
    const tokenB = await createSession(id);
    await revokeAllSessionsForUser(id);
    mockCookie(tokenA);
    expect(await getSessionUser()).toBeNull();
    mockCookie(tokenB);
    expect(await getSessionUser()).toBeNull();
  });
});

describe("일회용 토큰 (이메일 인증 / 비밀번호 재설정)", () => {
  it("발급한 토큰은 정상적으로 한 번 소비할 수 있다", async () => {
    const { id, email } = await createTestUser();
    const token = await createAuthToken("email_verify", id, email);
    expect(await consumeAuthToken("email_verify", token)).toEqual({ userId: id, email });
  });

  it("같은 토큰을 두 번 소비할 수 없다 (1회용)", async () => {
    const { id, email } = await createTestUser();
    const token = await createAuthToken("password_reset", id, email);
    expect(await consumeAuthToken("password_reset", token)).not.toBeNull();
    expect(await consumeAuthToken("password_reset", token)).toBeNull();
  });

  it("발급 목적(purpose)이 다르면 소비할 수 없다", async () => {
    const { id, email } = await createTestUser();
    const token = await createAuthToken("email_verify", id, email);
    expect(await consumeAuthToken("password_reset", token)).toBeNull();
  });

  it("만료된 토큰은 소비할 수 없다", async () => {
    const { id, email } = await createTestUser();
    const db = await getReadyDb();
    const rawToken = randomToken();
    await db.insert(authTokens).values({
      id: randomUUID(),
      purpose: "password_reset",
      tokenHash: hashToken(rawToken),
      userId: id,
      email,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(await consumeAuthToken("password_reset", rawToken)).toBeNull();
  });
});

describe("checkRateLimit", () => {
  it("허용 개수 이내에서는 계속 허용된다", async () => {
    const key = `rate-test-${randomUUID()}`;
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit(key, { max: 3, windowMs: 60_000 })).allowed).toBe(true);
    }
  });

  it("허용 개수를 넘으면 이후 요청은 차단된다", async () => {
    const key = `rate-test-${randomUUID()}`;
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(key, { max: 3, windowMs: 60_000 });
    }
    expect((await checkRateLimit(key, { max: 3, windowMs: 60_000 })).allowed).toBe(false);
  });

  it("서로 다른 key(예: 다른 IP)는 독립적으로 카운트된다", async () => {
    const keyA = `rate-a-${randomUUID()}`;
    const keyB = `rate-b-${randomUUID()}`;
    await checkRateLimit(keyA, { max: 1, windowMs: 60_000 });
    expect((await checkRateLimit(keyA, { max: 1, windowMs: 60_000 })).allowed).toBe(false);
    expect((await checkRateLimit(keyB, { max: 1, windowMs: 60_000 })).allowed).toBe(true);
  });
});
