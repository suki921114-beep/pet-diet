// 진짜 동시(Promise.all) 요청 테스트는 household.test.ts 안에 두면 안 된다.
//
// 로컬 @libsql/client의 "file:" sqlite3 드라이버는 실제 Turso 프로덕션에서
// 쓰는 원격 HTTP/WS 클라이언트와 달리 하나의 네이티브 커넥션을 프로세스
// 전체에서 공유한다. household.test.ts 안에서 여러 "동시 요청" 테스트를
// 함께 돌려본 결과, Promise.all로 두 개의 database.transaction()을 겹쳐서
// 실행하는 패턴을 그 커넥션 위에서 반복하면 통계적으로(항상은 아니고
// 가끔) 그 이후의 모든 트랜잭션이 "SQLITE_BUSY: cannot commit transaction -
// SQL statements in progress"로 영구히 실패하기 시작하는 현상을 재현
// 확인했다 — 커넥션 자체가 고장나는 것으로 보이며, 같은 파일 안의 관련
// 없는 나머지 테스트 39개가 연쇄적으로 실패했다. (vitest는 테스트 파일마다
// 모듈을 새로 평가하므로 db/index.ts의 client/schemaReady 싱글턴도 파일당
// 하나씩 새로 생긴다 — 그래서 파일을 분리하면 커넥션도 분리된다.)
//
// 이건 로컬 테스트 전용 드라이버의 한계이지 프로덕션(Turso 원격 연결)의
// 실제 동시성 보장과는 무관하다고 판단해서, 각 "동시 요청" 시나리오를
// 이렇게 자기 자신만 있는 별도 파일로 분리해 블라스트 반경을 그 테스트
// 하나로 격리했다. 그래도 이 테스트 자체는 여전히 진짜 Promise.all로
// 두 요청을 겹쳐 보내 "정확히 하나만 성공" 불변조건을 검증한다.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
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
import { POST as transferOwnershipPOST } from "../app/api/household/transfer-ownership/route";
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
async function joinViaInvite(owner: { id: string; email: string }, invitee: { id: string; email: string }) {
  await loginAs(owner.id);
  await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: invitee.email }));
  const call = fetchMock.mock.calls.at(-1)!;
  const body = JSON.parse(call[1].body as string) as { html: string };
  const token = new URL(body.html.match(/href="([^"]+)"/)![1]).searchParams.get("token")!;

  await loginAs(invitee.id);
  const res = await acceptPOST(postJson(`${HH_URL}/invitations/accept`, { token }));
  if (res.status !== 200) throw new Error("accept failed in test helper: " + JSON.stringify(await res.json()));
}

beforeAll(async () => {
  await getReadyDb();
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "테스트 <noreply@example.com>";
  process.env.APP_URL = "https://pdm.example.com";
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
});

describe("동시 소유권 이전 (전용 커넥션으로 격리)", () => {
  it("두 명에게 동시에 소유권을 이전해도 owner는 정확히 한 명만 남는다", async () => {
    const owner = await createTestUser();
    const memberA = await createTestUser();
    const memberB = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(owner, memberA);
    await joinViaInvite(owner, memberB);

    await loginAs(owner.id);
    const [resA, resB] = await Promise.all([
      transferOwnershipPOST(
        postJson(`${HH_URL}/transfer-ownership`, { targetUserId: memberA.id, password: "test-password-123" }),
      ),
      transferOwnershipPOST(
        postJson(`${HH_URL}/transfer-ownership`, { targetUserId: memberB.id, password: "test-password-123" }),
      ),
    ]);
    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses[0]).toBeLessThan(300); // 하나는 성공

    const db = await getReadyDb();
    const rows = await db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
    expect(rows.filter((r) => r.role === "owner")).toHaveLength(1);
  });
});
