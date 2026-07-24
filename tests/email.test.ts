import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppUrl, sendPasswordResetEmail, sendVerificationEmail } from "../lib/email";

// 실제 Resend 서버를 부르지 않는다 — fetch를 모킹해서 "이메일 발송" 경계만
// 테스트한다. 실제 발송이 되는지는 RESEND_API_KEY/EMAIL_FROM/APP_URL을
// 진짜 값으로 채운 배포 환경에서만 확인할 수 있다(이 테스트로는 검증되지 않음).
const ORIGINAL_ENV = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  APP_URL: process.env.APP_URL,
};

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.APP_URL;
});

afterEach(() => {
  process.env.RESEND_API_KEY = ORIGINAL_ENV.RESEND_API_KEY;
  process.env.EMAIL_FROM = ORIGINAL_ENV.EMAIL_FROM;
  process.env.APP_URL = ORIGINAL_ENV.APP_URL;
  vi.unstubAllGlobals();
});

describe("lib/email — RESEND_API_KEY/EMAIL_FROM 미설정", () => {
  it("발송을 시도하지 않고 명확한 실패 결과를 돌려준다", async () => {
    const result = await sendVerificationEmail("user@example.com", "token-abc");
    expect(result).toEqual({ ok: false, error: "이메일 서비스가 아직 설정되지 않았어요." });
  });

  it("계정 생성 자체와는 별개로 취급된다 — throw하지 않는다", async () => {
    await expect(sendPasswordResetEmail("user@example.com", "token-abc")).resolves.toMatchObject({
      ok: false,
    });
  });
});

describe("lib/email — Resend 호출 경계 (fetch 모킹)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "테스트 <noreply@example.com>";
    process.env.APP_URL = "https://pdm.example.com";
  });

  it("성공 시 Resend API에 올바른 인증 헤더와 인증 링크가 담긴 본문을 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendVerificationEmail("user@example.com", "token-abc");
    expect(result).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body);
    expect(body.from).toBe("테스트 <noreply@example.com>");
    expect(body.to).toBe("user@example.com");
    expect(body.html).toContain("https://pdm.example.com/verify-email?token=token-abc");
  });

  it("비밀번호 재설정 메일은 reset-password 링크를 담는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendPasswordResetEmail("user@example.com", "reset-token-xyz");
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.html).toContain("https://pdm.example.com/reset-password?token=reset-token-xyz");
  });

  it("Resend가 실패 응답을 주면 명확한 오류를 돌려준다(throw하지 않음)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendVerificationEmail("user@example.com", "token-abc");
    expect(result).toEqual({ ok: false, error: "이메일 발송에 실패했어요." });
  });

  it("네트워크 오류가 나면 명확한 오류를 돌려준다(throw하지 않음)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendVerificationEmail("user@example.com", "token-abc");
    expect(result).toEqual({ ok: false, error: "이메일 발송 중 오류가 발생했어요." });
  });
});

describe("lib/email getAppUrl", () => {
  it("APP_URL이 없으면 로컬 개발 기본값을 쓴다", () => {
    delete process.env.APP_URL;
    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("APP_URL이 있으면 그 값을 그대로 쓴다", () => {
    process.env.APP_URL = "https://pdm.example.com";
    expect(getAppUrl()).toBe("https://pdm.example.com");
  });
});
