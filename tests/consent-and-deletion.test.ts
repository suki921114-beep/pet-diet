import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.TURSO_DATABASE_URL = "file::memory:";
process.env.AUTH_SECRET = "test-only-secret-do-not-use-elsewhere";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";
import { getReadyDb } from "../db";
import { authAccounts, authSessions, households, householdMembers, userConsents, users } from "../db/schema";
import { POST as deleteAccountPOST } from "../app/api/auth/delete-account/route";
import { createSession, hashPassword, hashToken, SESSION_COOKIE_NAME } from "../lib/auth";
import { getConsentStatus, recordConsent, recordSignupConsent } from "../lib/consent";
import { PRIVACY_VERSION, TERMS_VERSION } from "../lib/legal";

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

function deleteRequest(body: unknown) {
  return new Request("http://localhost/api/auth/delete-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await getReadyDb();
});

describe("lib/consent — 동의 생애주기", () => {
  it("아직 동의 기록이 없으면 up-to-date가 아니다", async () => {
    const { id } = await createTestUser();
    const status = await getConsentStatus(id);
    expect(status.terms).toBeNull();
    expect(status.privacy).toBeNull();
    expect(status.upToDate).toBe(false);
  });

  it("가입 동의를 기록하면 현재 버전 기준으로 up-to-date가 된다", async () => {
    const { id } = await createTestUser();
    await recordSignupConsent(id);
    const status = await getConsentStatus(id);
    expect(status.terms).toMatchObject({ version: TERMS_VERSION });
    expect(status.privacy).toMatchObject({ version: PRIVACY_VERSION });
    expect(status.upToDate).toBe(true);
  });

  it("옛날 버전으로만 동의한 경우 up-to-date가 아니다(재동의 안내 대상)", async () => {
    const { id } = await createTestUser();
    await recordConsent(id, "terms", "2020-01-01");
    await recordConsent(id, "privacy", "2020-01-01");
    const status = await getConsentStatus(id);
    expect(status.upToDate).toBe(false);
  });

  it("같은 종류에 여러 번 동의해도 가장 최근 기록만 현재 상태로 본다", async () => {
    const { id } = await createTestUser();
    await recordConsent(id, "terms", "2020-01-01");
    await recordConsent(id, "terms", TERMS_VERSION);
    const status = await getConsentStatus(id);
    expect(status.terms?.version).toBe(TERMS_VERSION);
  });
});

describe("계정 탈퇴 API — 비밀번호 계정", () => {
  it("비밀번호가 틀리면 탈퇴되지 않는다", async () => {
    const { id, email } = await createTestUser(await hashPassword("correct-password-1"));
    const rawToken = await createSession(id);
    mockCookie(rawToken);

    const res = await deleteAccountPOST(deleteRequest({ password: "wrong-password" }));
    expect(res.status).toBe(401);

    const db = await getReadyDb();
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    expect(row?.email).toBe(email);
    expect(row?.deletedAt).toBeNull();
  });

  it("올바른 비밀번호면 탈퇴되고 이메일이 익명화되며 세션이 모두 폐기된다", async () => {
    const { id, email } = await createTestUser(await hashPassword("correct-password-2"));
    await seedPasswordAccount(id);
    const rawToken = await createSession(id);
    mockCookie(rawToken);

    const res = await deleteAccountPOST(deleteRequest({ password: "correct-password-2" }));
    expect(res.status).toBe(200);

    const db = await getReadyDb();
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    expect(row?.email).not.toBe(email);
    expect(row?.email).toMatch(/^deleted-.+@deleted\.local$/);
    expect(row?.passwordHash).toBe("");
    expect(row?.deletedAt).not.toBeNull();

    const remainingAccounts = await db.select().from(authAccounts).where(eq(authAccounts.userId, id));
    expect(remainingAccounts).toHaveLength(0);

    // 탈퇴 전 세션은 더 이상 로그인 상태로 쓰이지 않는다.
    const [sessionRow] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, hashToken(rawToken)))
      .limit(1);
    expect(sessionRow?.revokedAt).not.toBeNull();
  });
});

describe("계정 탈퇴 API — Google 전용(비밀번호 없음) 계정", () => {
  it("확인 이메일이 다르면 탈퇴되지 않는다", async () => {
    const { id } = await createTestUser(""); // 비밀번호 없음
    const rawToken = await createSession(id);
    mockCookie(rawToken);

    const res = await deleteAccountPOST(deleteRequest({ confirmEmail: "not-my-email@example.com" }));
    expect(res.status).toBe(401);
  });

  it("본인 이메일을 정확히 입력하면(대소문자 무시) 탈퇴된다", async () => {
    const { id, email } = await createTestUser("");
    const rawToken = await createSession(id);
    mockCookie(rawToken);

    const res = await deleteAccountPOST(deleteRequest({ confirmEmail: email.toUpperCase() }));
    expect(res.status).toBe(200);

    const db = await getReadyDb();
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    expect(row?.deletedAt).not.toBeNull();
  });
});

describe("계정 탈퇴 시 가족 공유 자동 정리", () => {
  it("가족의 유일한 구성원이었다면 탈퇴 시 가족 자체가 정리된다", async () => {
    const { id, email } = await createTestUser(await hashPassword("household-owner-pw"));
    const rawToken = await createSession(id);
    mockCookie(rawToken);

    const db = await getReadyDb();
    const householdId = randomUUID();
    await db.insert(households).values({
      id: householdId,
      inviteCode: `T${randomUUID().slice(0, 5).toUpperCase()}`,
      data: "{}",
    });
    await db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userEmail: email,
      role: "owner",
    });

    const res = await deleteAccountPOST(deleteRequest({ password: "household-owner-pw" }));
    expect(res.status).toBe(200);

    const remainingMembers = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId));
    expect(remainingMembers).toHaveLength(0);
    const remainingHousehold = await db.select().from(households).where(eq(households.id, householdId));
    expect(remainingHousehold).toHaveLength(0);
  });
});

describe("계정 탈퇴 속도 제한", () => {
  it("짧은 시간에 반복 시도하면 차단된다", async () => {
    const { id } = await createTestUser(await hashPassword("rate-limit-pw"));
    const rawToken = await createSession(id);
    mockCookie(rawToken);

    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await deleteAccountPOST(deleteRequest({ password: "wrong-password" }));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

async function seedPasswordAccount(userId: string) {
  const db = await getReadyDb();
  await db.insert(userConsents).values({ id: randomUUID(), userId, kind: "terms", version: TERMS_VERSION });
  await db.insert(authAccounts).values({ id: randomUUID(), userId, provider: "password" });
}
