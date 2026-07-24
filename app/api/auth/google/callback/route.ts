import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { authAccounts, users } from "@/db/schema";
import {
  createSession,
  getSessionUser,
  REAUTH_COOKIE_NAME,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
  verifyPayload,
  verifyReauthToken,
} from "@/lib/auth";
import { exchangeGoogleCallback } from "@/lib/googleOAuth";
import { safeInternalPath } from "@/lib/redirect";

export const dynamic = "force-dynamic";

const OAUTH_COOKIE_NAME = "pdm_oauth";

type Handshake = {
  codeVerifier: string;
  state: string;
  nonce: string;
  mode: "signin" | "link";
  next: string;
  linkUserId: string | null;
  redirectUri: string;
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

    const response = NextResponse.redirect(new URL("/?googleLinked=1", request.url));
    response.cookies.set(OAUTH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    response.cookies.set(REAUTH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
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
