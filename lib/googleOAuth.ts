// Google OAuth 2.0 / OpenID Connect 연동. 직접 JWT 서명 검증이나 OAuth 흐름을
// 구현하지 않고, 검증된 라이브러리(openid-client)에게 맡긴다.
// - Authorization Code + PKCE
// - ID 토큰 서명/iss/aud/exp/nonce 검증은 authorizationCodeGrant()가 내부에서 수행
// - scope는 반드시 "openid email profile"만 요청(Drive 등 추가 권한 요청 금지)
import * as client from "openid-client";

const GOOGLE_ISSUER = "https://accounts.google.com";

function getEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} 환경변수가 없어요. Google Cloud Console에서 만든 값을 설정해주세요.`);
  }
  return value;
}

let configPromise: Promise<client.Configuration> | null = null;

async function getGoogleConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    configPromise = client
      .discovery(new URL(GOOGLE_ISSUER), getEnv("GOOGLE_CLIENT_ID"), getEnv("GOOGLE_CLIENT_SECRET"))
      .catch((error) => {
        configPromise = null;
        throw error;
      });
  }
  return configPromise;
}

export type GoogleAuthStart = {
  authorizationUrl: string;
  codeVerifier: string;
  state: string;
  nonce: string;
};

// 로그인 시작: PKCE code_verifier/challenge, state, nonce를 새로 만들고
// Google 인증 화면으로 보낼 URL을 만든다. 호출하는 쪽(API 라우트)이
// codeVerifier/state/nonce를 서명된 쿠키에 담아 콜백까지 들고 있어야 한다.
export async function buildGoogleAuthorizationUrl(redirectUri: string): Promise<GoogleAuthStart> {
  const config = await getGoogleConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    // Drive 등 추가 권한은 절대 요청하지 않는다. 로그인 식별 용도로만 사용.
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });

  return { authorizationUrl: url.href, codeVerifier, state, nonce };
}

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

// 콜백 처리: authorizationCodeGrant()가 code_verifier/state/nonce를 검증하고,
// ID 토큰의 서명·iss·aud·exp·nonce까지 모두 검증한 뒤 claims를 돌려준다.
// 이 함수는 그 결과에서 필요한 값만 골라 돌려줄 뿐, 직접 토큰을 검증하지 않는다.
export async function exchangeGoogleCallback(
  callbackUrl: URL,
  params: { codeVerifier: string; state: string; nonce: string },
): Promise<GoogleIdentity> {
  const config = await getGoogleConfig();
  const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: params.codeVerifier,
    expectedState: params.state,
    expectedNonce: params.nonce,
  });

  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== "string" || !claims.sub) {
    throw new Error("Google 응답에서 사용자 식별자를 확인할 수 없어요.");
  }

  return {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" ? claims.name : null,
  };
}
