import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, REAUTH_COOKIE_NAME, signPayload, verifyReauthToken } from "@/lib/auth";
import { buildGoogleAuthorizationUrl } from "@/lib/googleOAuth";
import { checkRateLimit, clientIpFrom, rateLimitMessage } from "@/lib/rateLimit";
import { safeInternalPath } from "@/lib/redirect";

export const dynamic = "force-dynamic";

const OAUTH_COOKIE_NAME = "pdm_oauth";
const OAUTH_COOKIE_MAX_AGE = 60 * 10; // 10분(핸드셰이크만 담는 짧은 수명)

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

export async function GET(request: NextRequest) {
  const rate = await checkRateLimit(`google-start:${clientIpFrom(request)}`, {
    max: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  const url = new URL(request.url);
  const rawMode = url.searchParams.get("mode");
  const mode: "signin" | "link" | "reauth" =
    rawMode === "link" ? "link" : rawMode === "reauth" ? "reauth" : "signin";
  const next = safeInternalPath(url.searchParams.get("next"));
  // 회원가입 탭에서 약관 체크박스를 켠 채로 눌렀을 때만 "1"로 전달된다.
  // 콜백에서 신규 계정을 만드는 순간에만 이 값을 확인한다(로그인/연결에는 불필요).
  const agreed = url.searchParams.get("agreed") === "1";

  let linkUserId: string | null = null;
  if (mode === "link") {
    // Google을 기존 계정에 "연결"하는 건 방금 비밀번호로 재인증했을 때만
    // 허용한다 — 그냥 로그인만 돼 있다고 아무 계정에나 붙일 수 있으면 안 된다.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.redirect(new URL("/?authError=login_required", request.url));
    }
    const reauthCookie = request.cookies.get(REAUTH_COOKIE_NAME)?.value;
    if (!reauthCookie || !verifyReauthToken(reauthCookie, user.id)) {
      return NextResponse.redirect(new URL("/?authError=reauth_required", request.url));
    }
    linkUserId = user.id;
  } else if (mode === "reauth") {
    // 비밀번호가 없는(Google 전용) 계정이 소유권 이전이나 계정 탈퇴처럼
    // 민감한 작업 전에 "방금 나 자신임을 다시 증명"하는 용도. 로그인만
    // 돼 있으면 시작할 수 있고, 콜백에서 "이미 이 계정에 연결된 바로 그
    // Google 계정"으로 로그인했는지까지 다시 확인한다.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.redirect(new URL("/?authError=login_required", request.url));
    }
    linkUserId = user.id;
  }

  const redirectUri = new URL("/api/auth/google/callback", request.url).toString();

  let authStart;
  try {
    authStart = await buildGoogleAuthorizationUrl(redirectUri);
  } catch (error) {
    console.error("[google-oauth] 시작 실패", error);
    return NextResponse.redirect(new URL("/?authError=google_unavailable", request.url));
  }

  const handshake: Handshake = {
    codeVerifier: authStart.codeVerifier,
    state: authStart.state,
    nonce: authStart.nonce,
    mode,
    next,
    linkUserId,
    redirectUri,
    agreed,
  };

  const response = NextResponse.redirect(authStart.authorizationUrl);
  response.cookies.set(OAUTH_COOKIE_NAME, signPayload(handshake), {
    httpOnly: true,
    // Google에서 이 앱으로 돌아오는 리다이렉트는 최상위(top-level) GET
    // 내비게이션이라 sameSite=lax면 정상적으로 쿠키가 함께 전달된다.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  });
  return response;
}
