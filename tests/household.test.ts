import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDbUrl } from "./testDbUrl";

process.env.TURSO_DATABASE_URL = testDbUrl();
process.env.AUTH_SECRET = "test-only-secret-do-not-use-elsewhere";
process.env.RESEND_API_KEY = "test-key";
process.env.EMAIL_FROM = "테스트 <noreply@example.com>";
process.env.APP_URL = "https://pdm.example.com";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";
import { getReadyDb, runHouseholdMemberBackfillForTests } from "../db";
import {
  authSessions,
  households,
  householdInvitations,
  householdMembers,
  users,
} from "../db/schema";
import { POST as createHouseholdPOST } from "../app/api/household/create/route";
import { POST as deletePOST } from "../app/api/auth/delete-account/route";
import { POST as deleteHouseholdPOST } from "../app/api/household/delete/route";
import { POST as acceptPOST } from "../app/api/household/invitations/accept/route";
import { POST as cancelInvitationPOST } from "../app/api/household/invitations/cancel/route";
import { GET as invitationsGET, POST as invitationsPOST } from "../app/api/household/invitations/route";
import { POST as resendInvitationPOST } from "../app/api/household/invitations/resend/route";
import { POST as joinPOST } from "../app/api/household/join/route";
import { POST as leavePOST } from "../app/api/household/leave/route";
import { GET as meGET } from "../app/api/household/me/route";
import { POST as removeMemberPOST } from "../app/api/household/remove-member/route";
import { GET as stateGET, POST as statePOST } from "../app/api/household/state/route";
import { POST as transferOwnershipPOST } from "../app/api/household/transfer-ownership/route";
import { POST as signupPOST } from "../app/api/auth/signup/route";
import {
  createSession,
  hashPassword,
  REAUTH_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "../lib/auth";
import { hashToken } from "../lib/auth";

const HH_URL = "http://localhost/api/household";

function mockCookie(sessionToken: string | undefined, reauthToken?: string) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => {
      if (name === SESSION_COOKIE_NAME && sessionToken !== undefined) return { value: sessionToken };
      if (name === REAUTH_COOKIE_NAME && reauthToken !== undefined) return { value: reauthToken };
      return undefined;
    },
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

function postJson(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createTestUser(opts: { passwordHash?: string; emailVerified?: boolean } = {}) {
  const db = await getReadyDb();
  const id = randomUUID();
  const email = `${id}@example.com`;
  await db.insert(users).values({
    id,
    email,
    passwordHash: opts.passwordHash ?? (await hashPassword("test-password-123")),
    emailVerifiedAt: opts.emailVerified === false ? null : new Date().toISOString(),
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
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

beforeAll(async () => {
  await getReadyDb();
});

// ── 멤버십 migration ────────────────────────────────────────────────
describe("household_members userId 마이그레이션", () => {
  it("정규화된 이메일이 일치하면 기존 멤버십이 userId로 연결된다", async () => {
    const db = await getReadyDb();
    const owner = await createTestUser();
    const householdId = randomUUID();
    await db.insert(households).values({ id: householdId, inviteCode: `L${randomUUID().slice(0, 5)}`, data: "{}" });
    // 마이그레이션 전 상태를 흉내: userId 없이 이메일 대소문자/공백만 다르게
    await db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userEmail: `  ${owner.email.toUpperCase()}  `,
      role: "owner",
      userId: null,
    });

    // getReadyDb()는 schemaReady를 한 번만 실행하도록 캐시하므로, 부팅 후에는
    // 다시 불러도 백필이 재실행되지 않는다(정상 동작 — 매 요청마다 전체 테이블을
    // 훑지 않기 위함). 백필 로직 자체가 "나중에 다시 돌려도 안전한지(멱등)"를
    // 검증하려면 아래처럼 직접 재실행한다.
    await runHouseholdMemberBackfillForTests();

    const [row] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId));
    expect(row?.userId).toBe(owner.id);
  });

  it("마이그레이션 전후 행 수가 일치한다(삭제되지 않음)", async () => {
    const db = await getReadyDb();
    const before = await db.select({ id: householdMembers.id }).from(householdMembers);
    const owner = await createTestUser();
    const householdId = randomUUID();
    await db.insert(households).values({ id: householdId, inviteCode: `L${randomUUID().slice(0, 5)}`, data: "{}" });
    await db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userEmail: owner.email,
      role: "owner",
      userId: null,
    });
    await runHouseholdMemberBackfillForTests();
    const after = await db.select({ id: householdMembers.id }).from(householdMembers);
    expect(after.length).toBe(before.length + 1);
  });

  it("일치하는 사용자가 없는 이메일은 조용히 누락되지 않고 연결되지 않은 채로 남는다", async () => {
    const db = await getReadyDb();
    const householdId = randomUUID();
    await db.insert(households).values({ id: householdId, inviteCode: `L${randomUUID().slice(0, 5)}`, data: "{}" });
    const memberId = randomUUID();
    await db.insert(householdMembers).values({
      id: memberId,
      householdId,
      userEmail: "no-such-user@example.com",
      role: "owner",
      userId: null,
    });
    await runHouseholdMemberBackfillForTests();
    const [row] = await db.select().from(householdMembers).where(eq(householdMembers.id, memberId));
    expect(row?.userId).toBeNull(); // 삭제되지도, 임의로 연결되지도 않음
  });

  it("한 사용자가 이미 다른 가족에 속해 있으면 두 번째 멤버십을 만들 수 없다(중복 차단)", async () => {
    const db = await getReadyDb();
    const owner = await createTestUser();
    await createHouseholdAs(owner);
    const anotherHouseholdId = randomUUID();
    await db.insert(households).values({
      id: anotherHouseholdId,
      inviteCode: `L${randomUUID().slice(0, 5)}`,
      data: "{}",
    });
    await expect(
      db.insert(householdMembers).values({
        id: randomUUID(),
        householdId: anotherHouseholdId,
        userEmail: owner.email,
        role: "member",
        userId: owner.id,
      }),
    ).rejects.toThrow();
  });

  it("초대 수락 시 클라이언트가 role을 함께 보내도 항상 member로만 저장된다", async () => {
    const owner = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    const invitee = await createTestUser();

    await loginAs(owner.id);
    const inviteRes = await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: invitee.email }));
    expect(inviteRes.status).toBe(200);
    const db = await getReadyDb();
    const [invitation] = await db
      .select()
      .from(householdInvitations)
      .where(eq(householdInvitations.householdId, householdId));
    const rawToken = fetchMock.mock.calls[0][1].body as string;
    const url = new URL(JSON.parse(rawToken).html.match(/href="([^"]+)"/)[1]);
    const token = url.searchParams.get("token")!;

    await loginAs(invitee.id);
    const acceptRes = await acceptPOST(postJson(`${HH_URL}/invitations/accept`, { token, role: "owner" }));
    expect(acceptRes.status).toBe(200);

    const [member] = await db
      .select()
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, invitee.id)));
    expect(member?.role).toBe("member");
    void invitation;
  });

  it("소유권 이전 뒤에는 정확히 한 명만 owner다", async () => {
    const owner = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    const member = await createTestUser();
    await joinViaInvite(householdId, owner, member);

    await loginAs(owner.id);
    const res = await transferOwnershipPOST(
      postJson(`${HH_URL}/transfer-ownership`, { targetUserId: member.id, password: "test-password-123" }),
    );
    expect(res.status).toBe(200);

    const db = await getReadyDb();
    const rows = await db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
    const owners = rows.filter((r) => r.role === "owner");
    expect(owners).toHaveLength(1);
    expect(owners[0]?.userId).toBe(member.id);
  });
});

// 이메일 초대를 만들고 실제로 보낸 이메일 본문에서 토큰을 추출해 수락까지
// 시키는 헬퍼. fetchMock이 Resend 호출을 가로채므로 그 본문에서 링크를 읽는다.
async function joinViaInvite(
  householdId: string,
  owner: { id: string; email: string },
  invitee: { id: string; email: string },
) {
  await loginAs(owner.id);
  const inviteRes = await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: invitee.email }));
  if (inviteRes.status !== 200) throw new Error("invite failed in test helper");
  const call = fetchMock.mock.calls.at(-1)!;
  const body = JSON.parse(call[1].body as string) as { html: string };
  const match = body.html.match(/href="([^"]+)"/);
  const url = new URL(match![1]);
  const token = url.searchParams.get("token")!;

  await loginAs(invitee.id);
  const acceptRes = await acceptPOST(postJson(`${HH_URL}/invitations/accept`, { token }));
  if (acceptRes.status !== 200) {
    throw new Error("accept failed in test helper: " + JSON.stringify(await acceptRes.json()));
  }
  return token;
}

// ── 가족 데이터 격리 ────────────────────────────────────────────────
describe("가족 데이터 격리", () => {
  it("사용자 A는 사용자 B의 가족 데이터를 조회할 수 없다(자신의 것만 보임)", async () => {
    const ownerA = await createTestUser();
    const ownerB = await createTestUser();
    await createHouseholdAs(ownerA);
    await createHouseholdAs(ownerB);

    await loginAs(ownerA.id);
    const resA = await stateGET();
    const payloadA = (await resA.json()) as { data: { hello: number } };
    expect(resA.status).toBe(200);
    expect(payloadA.data.hello).toBe(1); // createHouseholdAs가 넣은 공통 시드값이라 직접적 비교는 아니지만 정상 응답만 확인

    // B로 전환해도 자기 자신의 household만 보인다(별도 검증은 me로).
    await loginAs(ownerB.id);
    const meB = await meGET();
    const payloadB = (await meB.json()) as { household: { id: string } };
    const meA2 = await (async () => {
      await loginAs(ownerA.id);
      return meGET();
    })();
    const payloadA2 = (await meA2.json()) as { household: { id: string } };
    expect(payloadA2.household.id).not.toBe(payloadB.household.id);
  });

  it("householdId를 body에 몰래 끼워 넣어도(다른 가족 것으로) 자신의 가족만 수정된다", async () => {
    const ownerA = await createTestUser();
    const ownerB = await createTestUser();
    const idA = await createHouseholdAs(ownerA);
    const idB = await createHouseholdAs(ownerB);

    await loginAs(ownerA.id);
    // 응답에서 A의 현재 dataVersion을 얻어온다.
    const beforeA = await (await stateGET()).json();
    await statePOST(
      postJson(`${HH_URL}/state`, {
        data: { tampered: true },
        expectedVersion: beforeA.dataVersion,
        householdId: idB, // 존재하지도 않는 파라미터 — 서버가 읽지 않는지 확인
      }),
    );

    const db = await getReadyDb();
    const [rowA] = await db.select().from(households).where(eq(households.id, idA));
    const [rowB] = await db.select().from(households).where(eq(households.id, idB));
    expect(JSON.parse(rowA!.data)).toEqual({ tampered: true });
    expect(JSON.parse(rowB!.data)).toEqual({ hello: 1 }); // B는 전혀 영향받지 않음
  });

  it("member도 가족 공용 데이터를 조회·수정할 수 있다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(member.id);
    const getRes = await stateGET();
    expect(getRes.status).toBe(200);
    const current = (await getRes.json()) as { dataVersion: number };

    const postRes = await statePOST(
      postJson(`${HH_URL}/state`, { data: { editedByMember: true }, expectedVersion: current.dataVersion }),
    );
    expect(postRes.status).toBe(200);
  });

  it("제거된 구성원은 즉시 pull/push할 수 없다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(owner.id);
    const removeRes = await removeMemberPOST(postJson(`${HH_URL}/remove-member`, { targetUserId: member.id }));
    expect(removeRes.status).toBe(200);

    await loginAs(member.id);
    const stateRes = await stateGET();
    expect(stateRes.status).toBe(404);
  });

  it("탈퇴 후에는 기존 세션으로도 가족 데이터에 접근할 수 없다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    const token = await createSession(member.id);
    mockCookie(token);
    await joinViaInvite(householdId, owner, member);

    mockCookie(token);
    const leaveRes = await leavePOST();
    expect(leaveRes.status).toBe(200);

    mockCookie(token);
    const stateRes = await stateGET();
    expect(stateRes.status).toBe(404);
  });
});

// ── 역할 권한 ──────────────────────────────────────────────────────
describe("역할 기반 권한", () => {
  it("member는 초대를 생성할 수 없다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(member.id);
    const res = await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: "someone@example.com" }));
    expect(res.status).toBe(403);
  });

  it("member는 초대를 취소·재발송할 수 없다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(owner.id);
    const inviteTarget = await createTestUser();
    await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: inviteTarget.email }));
    const db = await getReadyDb();
    const [invitation] = await db
      .select()
      .from(householdInvitations)
      .where(eq(householdInvitations.householdId, householdId));

    await loginAs(member.id);
    const cancelRes = await cancelInvitationPOST(
      postJson(`${HH_URL}/invitations/cancel`, { invitationId: invitation!.id }),
    );
    expect(cancelRes.status).toBe(403);
    const resendRes = await resendInvitationPOST(
      postJson(`${HH_URL}/invitations/resend`, { invitationId: invitation!.id }),
    );
    expect(resendRes.status).toBe(403);
  });

  it("member는 구성원을 제거할 수 없다", async () => {
    const owner = await createTestUser();
    const memberA = await createTestUser();
    const memberB = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, memberA);
    await joinViaInvite(householdId, owner, memberB);

    await loginAs(memberA.id);
    const res = await removeMemberPOST(postJson(`${HH_URL}/remove-member`, { targetUserId: memberB.id }));
    expect(res.status).toBe(403);
  });

  it("member는 소유권을 이전할 수 없다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(member.id);
    const res = await transferOwnershipPOST(
      postJson(`${HH_URL}/transfer-ownership`, { targetUserId: owner.id, password: "test-password-123" }),
    );
    expect(res.status).toBe(403);
  });

  it("owner는 정상적으로 다른 구성원을 제거할 수 있다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(owner.id);
    const res = await removeMemberPOST(postJson(`${HH_URL}/remove-member`, { targetUserId: member.id }));
    expect(res.status).toBe(200);
  });

  it("owner는 remove-member로 자기 자신(현재 owner)을 제거할 수 없다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(owner.id);
    const res = await removeMemberPOST(postJson(`${HH_URL}/remove-member`, { targetUserId: owner.id }));
    expect(res.status).toBe(400);
  });

  it("소유권 이전 후 정확히 한 명만 owner이고 이전 owner는 member가 된다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(owner.id);
    const res = await transferOwnershipPOST(
      postJson(`${HH_URL}/transfer-ownership`, { targetUserId: member.id, password: "test-password-123" }),
    );
    expect(res.status).toBe(200);

    const db = await getReadyDb();
    const rows = await db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
    const ownerRow = rows.find((r) => r.userId === owner.id);
    const memberRow = rows.find((r) => r.userId === member.id);
    expect(ownerRow?.role).toBe("member");
    expect(memberRow?.role).toBe("owner");
  });

  // "동시 소유권 이전" 시나리오는 tests/household-concurrency.test.ts로 옮겼다.
  // (로컬 sqlite3 파일 드라이버가 같은 커넥션 위에서 여러 트랜잭션이
  // 겹치는 상황을 계속 반복하면 통계적으로 커넥션이 이후 모든 트랜잭션에서
  // "SQL statements in progress" 에러를 내며 고장나는 현상을 재현 확인함 —
  // 이 파일의 나머지 39개 테스트가 함께 실패하는 걸 막기 위해 진짜 동시
  // 요청 테스트는 전용 파일로 분리해 격리했다. 자세한 내용은 그 파일 상단
  // 주석 참고.
});

// ── 초대 ───────────────────────────────────────────────────────────
describe("초대", () => {
  it("토큰은 DB에 해시로만 저장되고 원본은 남지 않는다", async () => {
    const owner = await createTestUser();
    const invitee = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    const token = await joinViaInvite(householdId, owner, invitee);

    const db = await getReadyDb();
    const [row] = await db
      .select()
      .from(householdInvitations)
      .where(eq(householdInvitations.householdId, householdId));
    expect(row?.tokenHash).toBe(hashToken(token));
    expect(row?.tokenHash).not.toBe(token);
    expect(token.length).toBeGreaterThanOrEqual(40); // base64url(32바이트) 이상
  });

  it("정상적인 초대는 수락되어 멤버십이 생긴다", async () => {
    const owner = await createTestUser();
    const invitee = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, invitee);

    const db = await getReadyDb();
    const [member] = await db
      .select()
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, invitee.id)));
    expect(member).toBeDefined();
    expect(member?.role).toBe("member");
  });

  it("만료된 초대는 수락할 수 없다", async () => {
    const owner = await createTestUser();
    const invitee = await createTestUser();
    const householdId = await createHouseholdAs(owner);

    const db = await getReadyDb();
    const id = randomUUID();
    const rawToken = "expired-token-" + randomUUID();
    await db.insert(householdInvitations).values({
      id,
      householdId,
      invitedByUserId: owner.id,
      email: invitee.email,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      sentAt: new Date().toISOString(),
    });

    await loginAs(invitee.id);
    const res = await acceptPOST(postJson(`${HH_URL}/invitations/accept`, { token: rawToken }));
    expect(res.status).toBe(410);
    const payload = await res.json();
    expect(payload.code).toBe("expired");
  });

  it("취소된 초대는 수락할 수 없다", async () => {
    const owner = await createTestUser();
    const invitee = await createTestUser();
    const householdId = await createHouseholdAs(owner);

    await loginAs(owner.id);
    await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: invitee.email }));
    const db = await getReadyDb();
    const [invitation] = await db
      .select()
      .from(householdInvitations)
      .where(eq(householdInvitations.householdId, householdId));
    await cancelInvitationPOST(postJson(`${HH_URL}/invitations/cancel`, { invitationId: invitation!.id }));

    const call = fetchMock.mock.calls.at(-1)!;
    const body = JSON.parse(call[1].body as string) as { html: string };
    const token = new URL(body.html.match(/href="([^"]+)"/)![1]).searchParams.get("token")!;

    await loginAs(invitee.id);
    const res = await acceptPOST(postJson(`${HH_URL}/invitations/accept`, { token }));
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("cancelled");
  });

  it("이미 사용된 초대는 다시 수락할 수 없다", async () => {
    const owner = await createTestUser();
    const invitee = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    const token = await joinViaInvite(householdId, owner, invitee);

    // 같은 초대를 새로 초대할 다른 사람이 재사용 시도(현실적으로는 같은
    // 사람이 다시 눌러보는 상황을 흉내)
    await loginAs(invitee.id);
    const res = await acceptPOST(postJson(`${HH_URL}/invitations/accept`, { token }));
    // 이미 같은 가족의 구성원이 되어 있으므로 alreadyMember로 처리되거나(멱등),
    // 초대 자체는 acceptedAt이 있어 재사용이 성립하지 않는다.
    const payload = await res.json();
    expect(res.status === 200 ? payload.alreadyMember : payload.code === "used").toBeTruthy();
  });

  // "동시 수락 요청" 시나리오는 tests/household-concurrency.test.ts로 옮겼다
  // (커넥션 격리 이유는 위쪽 "동시 소유권 이전" 자리의 주석 참고).

  it("초대 이메일과 로그인 이메일이 다르면 거부된다", async () => {
    const owner = await createTestUser();
    const invitee = await createTestUser();
    const someoneElse = await createTestUser();
    const householdId = await createHouseholdAs(owner);

    await loginAs(owner.id);
    await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: invitee.email }));
    const call = fetchMock.mock.calls.at(-1)!;
    const body = JSON.parse(call[1].body as string) as { html: string };
    const token = new URL(body.html.match(/href="([^"]+)"/)![1]).searchParams.get("token")!;

    await loginAs(someoneElse.id);
    const res = await acceptPOST(postJson(`${HH_URL}/invitations/accept`, { token }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("email_mismatch");
    void householdId;
  });

  it("이메일 인증이 안 된 사용자는 초대를 수락할 수 없다", async () => {
    const owner = await createTestUser();
    const invitee = await createTestUser({ emailVerified: false });
    const householdId = await createHouseholdAs(owner);

    await loginAs(owner.id);
    await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: invitee.email }));
    const call = fetchMock.mock.calls.at(-1)!;
    const body = JSON.parse(call[1].body as string) as { html: string };
    const token = new URL(body.html.match(/href="([^"]+)"/)![1]).searchParams.get("token")!;

    await loginAs(invitee.id);
    const res = await acceptPOST(postJson(`${HH_URL}/invitations/accept`, { token }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("unverified_email");
    void householdId;
  });

  it("이미 다른 가족에 속한 사용자는 수락할 수 없다(자동 병합/탈퇴 없음)", async () => {
    const ownerA = await createTestUser();
    const ownerB = await createTestUser();
    const invitee = await createTestUser();
    const householdA = await createHouseholdAs(ownerA);
    await createHouseholdAs(ownerB);
    await joinViaInvite(householdA, ownerA, invitee); // invitee는 이미 A 가족 소속

    await loginAs(ownerB.id);
    await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: invitee.email }));
    const call = fetchMock.mock.calls.at(-1)!;
    const body = JSON.parse(call[1].body as string) as { html: string };
    const token = new URL(body.html.match(/href="([^"]+)"/)![1]).searchParams.get("token")!;

    await loginAs(invitee.id);
    const res = await acceptPOST(postJson(`${HH_URL}/invitations/accept`, { token }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("already_in_other_household");

    // A 가족 멤버십은 그대로 유지되고, 데이터가 병합되지도 않았다.
    const db = await getReadyDb();
    const stillInA = await db
      .select()
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdA), eq(householdMembers.userId, invitee.id)));
    expect(stillInA).toHaveLength(1);
  });

  it("재발송하면 이전 링크는 무효화된다", async () => {
    const owner = await createTestUser();
    const invitee = await createTestUser();
    const householdId = await createHouseholdAs(owner);

    await loginAs(owner.id);
    await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: invitee.email }));
    const firstCall = fetchMock.mock.calls.at(-1)!;
    const firstBody = JSON.parse(firstCall[1].body as string) as { html: string };
    const firstToken = new URL(firstBody.html.match(/href="([^"]+)"/)![1]).searchParams.get("token")!;

    const db = await getReadyDb();
    const [firstInvitation] = await db
      .select()
      .from(householdInvitations)
      .where(eq(householdInvitations.householdId, householdId));

    await resendInvitationPOST(postJson(`${HH_URL}/invitations/resend`, { invitationId: firstInvitation!.id }));

    await loginAs(invitee.id);
    const res = await acceptPOST(postJson(`${HH_URL}/invitations/accept`, { token: firstToken }));
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("cancelled");
  });

  it("이메일 발송이 실패하면 수락 가능한 초대가 남지 않는다", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const owner = await createTestUser();
    const invitee = await createTestUser();
    const householdId = await createHouseholdAs(owner);

    await loginAs(owner.id);
    const res = await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: invitee.email }));
    expect(res.status).toBe(502);

    const db = await getReadyDb();
    const rows = await db
      .select()
      .from(householdInvitations)
      .where(eq(householdInvitations.householdId, householdId));
    expect(rows.every((r) => r.cancelledAt !== null)).toBe(true);
  });

  it("초대 목록 조회 응답에 원본 토큰이 노출되지 않는다", async () => {
    const owner = await createTestUser();
    const invitee = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await loginAs(owner.id);
    await invitationsPOST(postJson(`${HH_URL}/invitations`, { email: invitee.email }));

    await loginAs(owner.id);
    const listRes = await invitationsGET();
    const text = await listRes.text();
    expect(text).not.toMatch(/tokenHash/i);
    // 원본 토큰(32바이트 base64url)이 응답 어디에도 포함되지 않는지도 대략 확인
    const call = fetchMock.mock.calls.at(-1)!;
    const body = JSON.parse(call[1].body as string) as { html: string };
    const token = new URL(body.html.match(/href="([^"]+)"/)![1]).searchParams.get("token")!;
    expect(text).not.toContain(token);
    void householdId;
  });

  it("기존 6자리 초대 코드는 더 이상 통하지 않는다", async () => {
    const owner = await createTestUser();
    await createHouseholdAs(owner);
    const someone = await createTestUser();
    await loginAs(someone.id);
    const res = await joinPOST();
    expect(res.status).toBe(410);
  });
});

// ── 가족·계정 탈퇴 ─────────────────────────────────────────────────
describe("가족·계정 탈퇴", () => {
  it("member가 탈퇴하면 멤버십만 삭제되고 가족 JSON은 유지된다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(member.id);
    const res = await leavePOST();
    expect(res.status).toBe(200);

    const db = await getReadyDb();
    const [household] = await db.select().from(households).where(eq(households.id, householdId));
    expect(household).toBeDefined();
    expect(JSON.parse(household!.data)).toEqual({ hello: 1 });
  });

  it("다른 구성원이 남은 owner는 가족 나가기를 할 수 없다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(owner.id);
    const res = await leavePOST();
    expect(res.status).toBe(409);
  });

  it("다른 구성원이 남은 owner는 계정을 탈퇴할 수 없다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(owner.id);
    const res = await deletePOST(postJson("http://localhost/api/auth/delete-account", { password: "test-password-123" }));
    expect(res.status).toBe(409);

    const db = await getReadyDb();
    const [row] = await db.select().from(users).where(eq(users.id, owner.id));
    expect(row?.deletedAt).toBeNull();
  });

  it("소유권 이전 후에는 이전 owner가 탈퇴할 수 있다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(owner.id);
    await transferOwnershipPOST(
      postJson(`${HH_URL}/transfer-ownership`, { targetUserId: member.id, password: "test-password-123" }),
    );

    await loginAs(owner.id);
    const res = await leavePOST();
    expect(res.status).toBe(200);
  });

  it("혼자 남은 owner가 계정을 탈퇴하면 가족 JSON까지 함께 삭제된다", async () => {
    const owner = await createTestUser();
    const householdId = await createHouseholdAs(owner);

    await loginAs(owner.id);
    const res = await deletePOST(postJson("http://localhost/api/auth/delete-account", { password: "test-password-123" }));
    expect(res.status).toBe(200);

    const db = await getReadyDb();
    const [household] = await db.select().from(households).where(eq(households.id, householdId));
    expect(household).toBeUndefined();
    const members = await db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
    expect(members).toHaveLength(0);
    const invitations = await db
      .select()
      .from(householdInvitations)
      .where(eq(householdInvitations.householdId, householdId));
    expect(invitations).toHaveLength(0);
  });

  // "동시 계정 탈퇴" 시나리오는 tests/household-concurrency.test.ts로 옮겼다
  // (커넥션 격리 이유는 위쪽 "동시 소유권 이전" 자리의 주석 참고).

  it("탈퇴 후 기존 세션으로는 더 이상 로그인 상태가 아니다", async () => {
    const owner = await createTestUser();
    const token = await loginAs(owner.id);
    await deletePOST(postJson("http://localhost/api/auth/delete-account", { password: "test-password-123" }));

    mockCookie(token);
    const db = await getReadyDb();
    const [session] = await db
      .select()
      .from(authSessions)
      .where(and(eq(authSessions.tokenHash, hashToken(token)), isNull(authSessions.revokedAt)));
    expect(session).toBeUndefined();
  });

  it("탈퇴한 이메일로 다시 회원가입할 수 있다", async () => {
    const db = await getReadyDb();
    const email = `reuse-${randomUUID()}@example.com`;
    const id = randomUUID();
    await db.insert(users).values({ id, email, passwordHash: await hashPassword("first-password-123") });
    mockCookie(await createSession(id));
    await deletePOST(postJson("http://localhost/api/auth/delete-account", { password: "first-password-123" }));

    const res = await signupPOST(
      postJson("http://localhost/api/auth/signup", {
        email,
        password: "second-password-123",
        agreed: true,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("가족 공간 삭제는 혼자 남은 owner만 쓸 수 있다", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const householdId = await createHouseholdAs(owner);
    await joinViaInvite(householdId, owner, member);

    await loginAs(owner.id);
    const blocked = await deleteHouseholdPOST(postJson(`${HH_URL}/delete`, { password: "test-password-123" }));
    expect(blocked.status).toBe(409);

    await loginAs(owner.id);
    await removeMemberPOST(postJson(`${HH_URL}/remove-member`, { targetUserId: member.id }));
    const allowed = await deleteHouseholdPOST(postJson(`${HH_URL}/delete`, { password: "test-password-123" }));
    expect(allowed.status).toBe(200);

    const db = await getReadyDb();
    const [household] = await db.select().from(households).where(eq(households.id, householdId));
    expect(household).toBeUndefined();
  });
});
