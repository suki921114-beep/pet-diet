// 격리 이유는 tests/household-concurrency-transfer.test.ts 상단 주석 참고.
// 이 파일은 "초대 동시 수락" 한 가지 시나리오만 자기 커넥션에서 실행한다.

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { testDbUrl } from "./testDbUrl";

process.env.TURSO_DATABASE_URL = testDbUrl();
process.env.AUTH_SECRET = "test-only-secret-do-not-use-elsewhere";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";
import { getReadyDb } from "../db";
import { householdMembers, users } from "../db/schema";
import { POST as createHouseholdPOST } from "../app/api/household/create/route";
import { POST as invitationsPOST } from "../app/api/household/invitations/route";
import { POST as acceptPOST } from "../app/api/household/invitations/accept/route";
import { createSession, hashPassword, SESSION_COOKIE_NAME } from "../lib/auth";

const HH_URL = "http://localhost/api/household";

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

async function loginAs(userId: string) {
  const token = await createSession(userId);
  mockCookie(token);
  return token;
}

async function createHouseholdAs(owner: { id: string; email: string }) {
  await loginAs(owner.id);
  const res = await createHouseholdPOST(postJson(`${HH_URL}/create`, { name: "테스트 가족", data: { hello: 1 } }));
  const payload = (await res.json()) as { household: { id: string } };
  return payload.household.id;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeAll(async () => {
  await getReadyDb();
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "테스트 <noreply@example.com>";
  process.env.APP_URL = "https://pdm.example.com";
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
});

describe("초대 동시 수락 (전용 커넥션으로 격리)", () => {
  it("같은 토큰으로 동시에 수락 요청을 보내도 정확히 한 번만 성공한다", async () => {
    const owner = await createTestUser();
    const invitee = await createTestUser();
    const householdId = await createHouseholdAs(owner);

    await loginAs(owner.id);
    await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: invitee.email }));
    const call = fetchMock.mock.calls.at(-1)!;
    const body = JSON.parse(call[1].body as string) as { html: string };
    const token = new URL(body.html.match(/href="([^"]+)"/)![1]).searchParams.get("token")!;

    await loginAs(invitee.id);
    const [r1, r2] = await Promise.all([
      acceptPOST(postJson(`${HH_URL}/invitations/accept`, { token })),
      acceptPOST(postJson(`${HH_URL}/invitations/accept`, { token })),
    ]);
    const statuses = [r1.status, r2.status];
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);

    const db = await getReadyDb();
    const members = await db
      .select()
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, invitee.id)));
    expect(members).toHaveLength(1); // 중복 가입 없음
  });
});
