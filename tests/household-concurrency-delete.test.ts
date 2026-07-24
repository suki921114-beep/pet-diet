// 격리 이유는 tests/household-concurrency-transfer.test.ts 상단 주석 참고.
// 이 파일은 "계정 탈퇴 동시 요청" 한 가지 시나리오만 자기 커넥션에서 실행한다.

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { testDbUrl } from "./testDbUrl";

process.env.TURSO_DATABASE_URL = testDbUrl();
process.env.AUTH_SECRET = "test-only-secret-do-not-use-elsewhere";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";
import { getReadyDb } from "../db";
import { users } from "../db/schema";
import { POST as deletePOST } from "../app/api/auth/delete-account/route";
import { createSession, hashPassword, SESSION_COOKIE_NAME } from "../lib/auth";

function mockCookie(sessionToken: string) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === SESSION_COOKIE_NAME ? { value: sessionToken } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

function postJson(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createTestUser() {
  const db = await getReadyDb();
  const id = randomUUID();
  const email = `${id}@example.com`;
  await db.insert(users).values({
    id,
    email,
    passwordHash: await hashPassword("test-password-123"),
    emailVerifiedAt: new Date().toISOString(),
  });
  return { id, email };
}

beforeAll(async () => {
  await getReadyDb();
});

describe("계정 탈퇴 동시 요청 (전용 커넥션으로 격리)", () => {
  it("같은 계정을 동시에 두 번 탈퇴 요청해도 한 번만 성공한다", async () => {
    const owner = await createTestUser();
    const token = await createSession(owner.id);
    mockCookie(token);

    const [r1, r2] = await Promise.all([
      deletePOST(postJson("http://localhost/api/auth/delete-account", { password: "test-password-123" })),
      deletePOST(postJson("http://localhost/api/auth/delete-account", { password: "test-password-123" })),
    ]);
    const statuses = [r1.status, r2.status];
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
  });
});
