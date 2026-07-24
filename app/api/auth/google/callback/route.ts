import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { authAccounts, users } from "@/db/schema";
import {
  createReauthToken,
  createSession,
  getSessionUser,
  reauthCookieOptions,
  REAUTH_COOKIE_NAME,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
  verifyPayload,
  verifyReauthToken,
} from "@/lib/auth";
import { recordSignupConsent } from "@/lib/consent";
import { exchangeGoogleCallback } from "@/lib/googleOAuth";
import { safeInternalPath } from "@/lib/redirect";

export const dynamic = "force-dynamic";

const OAUTH_COOKIE_NAME = "pdm_oauth";

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

function errorRedirect(request: NextRequest, code: string) {
  const response = NextResponse.redirect(new URL(`/?authError=${code}`, request.url));
  response.cookies.set(OAUTH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  // 사용자가 Google 화면에서 취소했거나 Google이 오류를 보낸 경우
  const googleError = url.searchParams.get("error");
  if (googleError) {
    return errorRedirect(request, googleError === "access_denied" ? "google_cancelled" : "google_error");
  }

  const handshakeCookie = request.cookies.get(OAUTH_COOKIE_NAME)?.value;
  if (!handshakeCookie) return errorRedirect(request, "google_expired");
  const handshake = verifyPayload<Handshake>(handshakeCookie);
  if (!handshake) return errorRedirect(request, "google_expired");

  let identity;
  try {
    identity = await exchangeGoogleCallback(url, {
      codeVerifier: handshake.codeVerifier,
      state: handshake.state,
      nonce: handshake.nonce,
    });
  } catch (error) {
    console.error("[google-oauth] 콜백 처리 실패", error);
    return errorRedirect(request, "google_error");
  }

  if (!identity.emailVerified || !identity.email) {
    return errorRedirect(request, "google_email_unverified");
  }
  const normalizedEmail = identity.email.trim().toLowerCase();
  const database = await getReadyDb();

  if (handshake.mode === "link") {
    const currentUser = await getSessionUser();
    const reauthCookie = request.cookies.get(REAUTH_COOKIE_NAME)?.value;
    if (
      !currentUser ||
      currentUser.id !== handshake.linkUserId ||
      !reauthCookie ||
      !verifyReauthToken(reauthCookie, currentUser.id)
    ) {
      return errorRedirect(request, "reauth_required");
    }

    const [existingForSub] = await database
      .select()
      .from(authAccounts)
      .where(and(eq(authAccounts.provider, "google"), eq(authAccounts.providerSubject, identity.sub)))
      .limit(1);

    if (existingForSub && existingForSub.userId !== currentUser.id) {
      // 이 Google 계정은 이미 다른 사용자 계정에 연결되어 있다. 이메일이
      // 같아 보여도 자동으로 옮기거나 병합하지 않는다.
      return errorRedirect(request, "google_already_linked");
    }
    if (!existingForSub) {
      await database.insert(authAccounts).values({
        id: randomUUID(),
        userId: currentUser.id,
        provider: "google",
        providerSubject: identity.sub,
      });
    }

    // Google이 이 이메일을 인증했다고 확인했고(위쪽 emailVerified 체크),
    // 이 콜백의 사용자가 연결을 시작한 바로 그 세션이며(위쪽 reauth 체크),
    // Google 이메일이 이 계정의 현재 이메일과 정규화 기준으로 정확히
    // 일치할 때만 앱의 이메일 인증 상태를 갱신한다. 이메일이 다르면(예:
    // 다른 개인 Gmail을 로그인 수단으로만 연결한 경우) 조용히 건드리지
    // 않는다 — 클라이언트가 이 판단을 대신하게 두지 않는다.
    const normalizedCurrentEmail = currentUser.email.trim().toLowerCase();
    if (normalizedEmail === normalizedCurrentEmail) {
      await database
        .update(users)
        .set({ emailVerifiedAt: new Date().toISOString() })
        .where(and(eq(users.id, currentUser.id), isNull(users.emailVerifiedAt)));
    }

    const response = NextResponse.redirect(new URL("/?googleLinked=1", request.url));
    response.cookies.set(OAUTH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    response.cookies.set(REAUTH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    return response;
  }

  if (handshake.mode === "reauth") {
    const currentUser = await getSessionUser();
    if (!currentUser || currentUser.id !== handshake.linkUserId) {
      return errorRedirect(request, "reauth_required");
    }
    // 아무 Google 계정이나 방금 로그인했다고 재인증으로 인정하지 않는다 —
    // 반드시 "이미 이 사용자 계정에 연결된 바로 그 Google 계정"이어야 한다.
    const [linkedAccount] = await database
      .select({ id: authAccounts.id })
      .from(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, currentUser.id),
          eq(authAccounts.provider, "google"),
          eq(authAccounts.providerSubject, identity.sub),
        ),
      )
      .limit(1);
    if (!linkedAccount) {
      return errorRedirect(request, "reauth_account_mismatch");
    }

    const response = NextResponse.redirect(new URL(safeInternalPath(handshake.next), request.url));
    response.cookies.set(OAUTH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    response.cookies.set(REAUTH_COOKIE_NAME, createReauthToken(currentUser.id), reauthCookieOptions());
    return response;
  }

  // signin 모드
  const [existingAccount] = await database
    .select()
    .from(authAccounts)
    .where(and(eq(authAccounts.provider, "google"), eq(authAccounts.providerSubject, identity.sub)))
    .limit(1);

  let userId: string;
  if (existingAccount) {
    userId = existingAccount.userId;
  } else {
    // 같은(인증된) 이메일의 기존 계정이 있어도 자동으로 합치지 않는다.
    // 비밀번호로 먼저 로그인한 뒤, 계정 설정에서 명시적으로 연결해야 한다.
    const [existingUserByEmail] = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existingUserByEmail) {
      return errorRedirect(request, "google_email_in_use");
    }
    // 새 계정을 만드는 경우에만 동의 여부를 확인한다. "로그인" 탭에서 눌러도
    // 여기까지 왔다는 건 아직 계정이 없다는 뜻이라, 동의 없이는 계정을
    // 만들지 않는다(회원가입 탭에서 체크박스를 켠 채로 다시 시도해야 함).
    if (!handshake.agreed) {
      return errorRedirect(request, "consent_required");
    }

    const newUserId = randomUUID();
    await database.insert(users).values({
      id: newUserId,
      email: normalizedEmail,
      passwordHash: "", // Google 전용 계정: 비밀번호 없음
      displayName: identity.name,
      emailVerifiedAt: new Date().toISOString(), // Google이 이미 확인한 이메일
    });
    await database.insert(authAccounts).values({
      id: randomUUID(),
      userId: newUserId,
      provider: "google",
      providerSubject: identity.sub,
    });
    await recordSignupConsent(newUserId);
    userId = newUserId;
  }

  const [userRow] = await database.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow || userRow.deletedAt) {
    return errorRedirect(request, "account_unavailable");
  }

  const rawSessionToken = await createSession(userId);
  const response = NextResponse.redirect(new URL(safeInternalPath(handshake.next), request.url));
  response.cookies.set(SESSION_COOKIE_NAME, rawSessionToken, sessionCookieOptions());
  response.cookies.set(OAUTH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
