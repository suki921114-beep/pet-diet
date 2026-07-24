import { NextResponse } from "next/server";
import { revokeCurrentSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  // 쿠키만 지우는 게 아니라 서버에 저장된 세션 자체를 폐기한다. 그래야
  // 누군가 이전 쿠키 값을 들고 있어도(예: 브라우저 히스토리, 프록시 로그)
  // 더 이상 로그인 상태로 재사용할 수 없다.
  await revokeCurrentSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
