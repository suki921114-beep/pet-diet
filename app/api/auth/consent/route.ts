import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { recordSignupConsent } from "@/lib/consent";

export const dynamic = "force-dynamic";

// 약관/개인정보처리방침 버전이 바뀐 뒤, 계정 설정 화면의 "재동의" 버튼에서
// 호출한다. 앱 사용을 막지는 않으므로(비차단 안내) 이 엔드포인트는 그냥
// 최신 버전에 대한 동의 기록을 새로 추가하기만 한다.
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  await recordSignupConsent(user.id);
  return NextResponse.json({ ok: true });
}
