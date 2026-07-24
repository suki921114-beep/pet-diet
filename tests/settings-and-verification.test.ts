import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { testDbUrl } from "./testDbUrl";

process.env.TURSO_DATABASE_URL = testDbUrl();
process.env.AUTH_SECRET = "test-only-secret-do-not-use-elsewhere";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

// exchangeGoogleCallback은 실제로 Google 서버와 통신하므로(openid-client),
// 테스트에서는 이 경계만 모킹하고 그 결과를 콜백 라우트가 어떻게 처리하는지만
// 검증한다 — 실제 Google과의 왕복 자체는 이 테스트로 검증되지 않는다.
vi.mock("../lib/googleOAuth", () => ({
  exchangeGoogleCallback: vi.fn(),
  buildGoogleAuthorizationUrl: vi.fn(),
}));

import { cookies } from "next/headers";
import { exchangeGoogleCallback } from "../lib/googleOAuth";
import { getReadyDb } from "../db";
import { authAccounts, authTokens, users } from "../db/schema";
import { GET as googleCallbackGET } from "../app/api/auth/google/callback/route";
import { POST as resendVerificationPOST } from "../app/api/auth/resend-verification/route";
import { GET as meGET } from "../app/api/auth/me/route";
import { POST as googleDisconnectPOST } from "../app/api/auth/google/disconnect/route";
import {
  createReauthToken,
  createSession,
  hashPassword,
  REAUTH_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  signPayload,
} from "../lib/auth";
import { isEmailServiceConfigured } from "../lib/email";
import { checkRateLimit } from "../lib/rateLimit";

function mockCookie(sessionToken: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === SESSION_COOKIE_NAME && sessionToken !== undefined ? { value: sessionToken } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
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

type Handshake = {
  codeVerifier: string;
  state: string;
  nonce: string;
  mode: "signin" | "link" | "reauth";
  next: string;
  linkUserId: string | null;
  redirectUri: string;
  agreed: boolean;
};

function buildLinkRequest(handshakeOverrides: Partial<Handshake>, extraCookies: Record<string, string> = {}) {
  const handshake: Handshake = {
    codeVerifier: "verifier",
    state: "state",
    nonce: "nonce",
    mode: "link",
    next: "/",
    linkUserId: null,
    redirectUri: "http://localhost/api/auth/google/callback",
    agreed: false,
    ...handshakeOverrides,
  };
  const cookieHeader = [`pdm_oauth=${signPayload(handshake)}`, ...Object.entries(extraCookies).map(([k, v]) => `${k}=${v}`)].join(
    "; ",
  );
  return new NextRequest("http://localhost/api/auth/google/callback?code=abc&state=state", {
    headers: { cookie: cookieHeader },
  });
}

beforeAll(async () => {
  await getReadyDb();
});

describe("Google 연동 계정의 이메일 인증 상태", () => {
  it("email_verified=true이고 정규화 이메일이 일치하면 앱 이메일이 인증 처리된다", async () => {
    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: false });
    const rawSession = await createSession(user.id);
    mockCookie(rawSession);
    const reauth = createReauthToken(user.id);

    vi.mocked(exchangeGoogleCallback).mockResolvedValue({
      sub: `sub-${randomUUID()}`,
      email: user.email.toUpperCase(), // 대소문자가 달라도 정규화하면 일치해야 한다
      emailVerified: true,
      name: "테스트",
    });

    const request = buildLinkRequest({ linkUserId: user.id }, { [REAUTH_COOKIE_NAME]: reauth });
    const res = await googleCallbackGET(request);
    expect(res.status).toBe(307); // redirect

    const db = await getReadyDb();
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.emailVerifiedAt).not.toBeNull();
  });

  it("Google 이메일이 앱 계정 이메일과 다르면 인증 처리되지 않는다", async () => {
    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: false });
    const rawSession = await createSession(user.id);
    mockCookie(rawSession);
    const reauth = createReauthToken(user.id);

    vi.mocked(exchangeGoogleCallback).mockResolvedValue({
      sub: `sub-${randomUUID()}`,
      email: `different-${randomUUID()}@example.com`,
      emailVerified: true,
      name: null,
    });

    const request = buildLinkRequest({ linkUserId: user.id }, { [REAUTH_COOKIE_NAME]: reauth });
    await googleCallbackGET(request);

    const db = await getReadyDb();
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.emailVerifiedAt).toBeNull();
  });

  it("email_verified=false이면 링크 자체가 거부되고 인증 처리되지 않는다", async () => {
    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: false });
    const rawSession = await createSession(user.id);
    mockCookie(rawSession);
    const reauth = createReauthToken(user.id);

    vi.mocked(exchangeGoogleCallback).mockResolvedValue({
      sub: `sub-${randomUUID()}`,
      email: user.email,
      emailVerified: false,
      name: null,
    });

    const request = buildLinkRequest({ linkUserId: user.id }, { [REAUTH_COOKIE_NAME]: reauth });
    const res = await googleCallbackGET(request);
    expect(res.headers.get("location")).toContain("authError=google_email_unverified");

    const db = await getReadyDb();
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.emailVerifiedAt).toBeNull();
  });

  it("클라이언트가 보낸 값이 아니라 서버가 exchangeGoogleCallback으로 받은 값만 신뢰한다", async () => {
    // exchangeGoogleCallback 자체가 openid-client를 통해 Google과 직접
    // 통신하는 유일한 경로이므로, 요청 쿼리스트링에 email/email_verified를
    // 아무리 실어 보내도 무시된다 — 실제로 반영되는 값은 모킹된 반환값뿐이다.
    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: false });
    const rawSession = await createSession(user.id);
    mockCookie(rawSession);
    const reauth = createReauthToken(user.id);

    vi.mocked(exchangeGoogleCallback).mockResolvedValue({
      sub: `sub-${randomUUID()}`,
      email: user.email,
      emailVerified: true,
      name: null,
    });

    const handshake: Handshake = {
      codeVerifier: "verifier",
      state: "state",
      nonce: "nonce",
      mode: "link",
      next: "/",
      linkUserId: user.id,
      redirectUri: "http://localhost/api/auth/google/callback",
      agreed: false,
    };
    const request = new NextRequest(
      // 클라이언트가 email_verified=false, email=attacker@evil.com을 직접
      // 쿼리스트링으로 실어 보내려 시도해도 라우트는 이 값을 아예 읽지 않는다.
      "http://localhost/api/auth/google/callback?code=abc&state=state&email=attacker@evil.com&email_verified=false",
      { headers: { cookie: `pdm_oauth=${signPayload(handshake)}; ${REAUTH_COOKIE_NAME}=${reauth}` } },
    );
    await googleCallbackGET(request);

    const db = await getReadyDb();
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.emailVerifiedAt).not.toBeNull(); // 모킹된 서버측 값(emailVerified:true)만 반영됨
  });

  it("다른 사용자에게 이미 연결된 Google sub는 연결할 수 없다", async () => {
    const ownerOfSub = await createTestUser();
    const other = await createTestUser({ passwordHash: await hashPassword("pw-12345678") });
    const sub = `sub-${randomUUID()}`;

    const db = await getReadyDb();
    await db.insert(authAccounts).values({ id: randomUUID(), userId: ownerOfSub.id, provider: "google", providerSubject: sub });

    const rawSession = await createSession(other.id);
    mockCookie(rawSession);
    const reauth = createReauthToken(other.id);

    vi.mocked(exchangeGoogleCallback).mockResolvedValue({
      sub,
      email: other.email,
      emailVerified: true,
      name: null,
    });

    const request = buildLinkRequest({ linkUserId: other.id }, { [REAUTH_COOKIE_NAME]: reauth });
    const res = await googleCallbackGET(request);
    expect(res.headers.get("location")).toContain("authError=google_already_linked");

    const accounts = await db.select().from(authAccounts).where(eq(authAccounts.userId, other.id));
    expect(accounts).toHaveLength(0);
  });

  it("인증 완료 후 /api/auth/me가 emailVerified:true를 돌려준다(설정 화면 발송 버튼이 이 값으로 숨겨짐)", async () => {
    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: false });
    const rawSession = await createSession(user.id);
    mockCookie(rawSession);
    const reauth = createReauthToken(user.id);

    vi.mocked(exchangeGoogleCallback).mockResolvedValue({
      sub: `sub-${randomUUID()}`,
      email: user.email,
      emailVerified: true,
      name: null,
    });

    await googleCallbackGET(buildLinkRequest({ linkUserId: user.id }, { [REAUTH_COOKIE_NAME]: reauth }));

    mockCookie(rawSession);
    const meRes = await meGET();
    const payload = (await meRes.json()) as { emailVerified: boolean };
    expect(payload.emailVerified).toBe(true);
  });

  it("유일한 로그인 수단(Google)은 연결 해제할 수 없다", async () => {
    const user = await createTestUser({ passwordHash: "" }); // 비밀번호 없는 Google 전용 계정
    const db = await getReadyDb();
    await db.insert(authAccounts).values({
      id: randomUUID(),
      userId: user.id,
      provider: "google",
      providerSubject: `sub-${randomUUID()}`,
    });
    const rawSession = await createSession(user.id);
    mockCookie(rawSession);

    const res = await googleDisconnectPOST();
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.code).toBe("LAST_LOGIN_METHOD");

    const accounts = await db.select().from(authAccounts).where(eq(authAccounts.userId, user.id));
    expect(accounts.some((a) => a.provider === "google")).toBe(true); // 그대로 남아있음
  });
});

describe("인증 메일 발송", () => {
  it("정상 발송 시에만 성공 응답을 준다", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "테스트 <noreply@example.com>";
    process.env.APP_URL = "https://pdm.example.com";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: false });
    mockCookie(await createSession(user.id));

    const res = await resendVerificationPOST();
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    vi.unstubAllGlobals();
  });

  it("API 키가 없으면 EMAIL_SERVICE_UNAVAILABLE을 돌려주고 토큰을 만들지 않는다", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = "테스트 <noreply@example.com>";
    expect(isEmailServiceConfigured()).toBe(false);

    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: false });
    mockCookie(await createSession(user.id));

    const db = await getReadyDb();
    const before = await db.select().from(authTokens).where(eq(authTokens.userId, user.id));

    const res = await resendVerificationPOST();
    expect(res.status).toBe(503);
    const payload = await res.json();
    expect(payload.code).toBe("EMAIL_SERVICE_UNAVAILABLE");
    expect(payload.error).toBe("현재 인증 메일을 보낼 수 없습니다. 관리자 설정이 필요합니다.");

    const after = await db.select().from(authTokens).where(eq(authTokens.userId, user.id));
    expect(after.length).toBe(before.length); // 토큰이 새로 만들어지지 않음
  });

  it("발신 주소(EMAIL_FROM)가 없으면 마찬가지로 서비스 미설정으로 처리된다", async () => {
    process.env.RESEND_API_KEY = "test-key";
    delete process.env.EMAIL_FROM;
    expect(isEmailServiceConfigured()).toBe(false);

    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: false });
    mockCookie(await createSession(user.id));

    const res = await resendVerificationPOST();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("EMAIL_SERVICE_UNAVAILABLE");
  });

  it("Resend가 실패 응답을 주면 성공으로 처리하지 않고, 발급된 토큰도 즉시 무효화한다", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "테스트 <noreply@example.com>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));

    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: false });
    mockCookie(await createSession(user.id));

    const res = await resendVerificationPOST();
    expect(res.status).toBe(502);
    const payload = await res.json();
    expect(payload.code).toBe("SEND_FAILED");
    expect(payload.error).toBe("인증 메일을 보내지 못했어요. 잠시 후 다시 시도해주세요.");

    const db = await getReadyDb();
    const tokens = await db.select().from(authTokens).where(eq(authTokens.userId, user.id));
    const latest = tokens.at(-1);
    expect(latest?.usedAt).not.toBeNull(); // 무효화됨 — 아무도 못 받은 링크가 유효한 채로 남지 않음
    vi.unstubAllGlobals();
  });

  it("원본 토큰이나 전체 인증 링크가 API 응답에 노출되지 않는다", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "테스트 <noreply@example.com>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: false });
    mockCookie(await createSession(user.id));

    const res = await resendVerificationPOST();
    const text = await res.text();
    expect(text).not.toMatch(/verify-email\?token=/);
    vi.unstubAllGlobals();
  });

  it("속도 제한이 적용된다", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "테스트 <noreply@example.com>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: false });
    mockCookie(await createSession(user.id));

    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await resendVerificationPOST();
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
    vi.unstubAllGlobals();
  });

  it("이미 인증된 이메일에는 발송을 시도하지 않는다", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "테스트 <noreply@example.com>";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: true });
    mockCookie(await createSession(user.id));

    const res = await resendVerificationPOST();
    const payload = await res.json();
    expect(payload.alreadyVerified).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("인증 콜백은 쿼리스트링의 임의 URL을 사용하지 않고 항상 같은 내부 경로(/verify-email)로만 링크를 만든다", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "테스트 <noreply@example.com>";
    process.env.APP_URL = "https://pdm.example.com";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const user = await createTestUser({ passwordHash: await hashPassword("pw-12345678"), emailVerified: false });
    mockCookie(await createSession(user.id));

    await resendVerificationPOST();
    const call = fetchMock.mock.calls.at(-1)!;
    const body = JSON.parse(call[1].body as string) as { html: string };
    expect(body.html).toContain("https://pdm.example.com/verify-email?token=");
    expect(body.html).not.toMatch(/href="(?!https:\/\/pdm\.example\.com)/);
    vi.unstubAllGlobals();
  });
});

describe("checkRateLimit 재확인(반복/병렬 재발송 방지)", () => {
  it("같은 키로 짧은 시간에 여러 번 시도하면 허용 개수를 넘는 순간부터 차단된다", async () => {
    const key = `resend-verification:${randomUUID()}`;
    for (let i = 0; i < 5; i++) {
      expect((await checkRateLimit(key, { max: 5, windowMs: 60 * 60 * 1000 })).allowed).toBe(true);
    }
    expect((await checkRateLimit(key, { max: 5, windowMs: 60 * 60 * 1000 })).allowed).toBe(false);
  });
});
