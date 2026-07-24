import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 예전의 영구 6자리 코드 방식은 보안 초대로 보기 어려워 폐기했다(만료·취소·
// 1회용 처리가 전혀 없었음). 배포 이후로는 이 코드를 알고 있어도 가입할 수
// 없다 — 하위 호환을 위해 계속 인정하지 않는다. 새 흐름은
// /api/household/invitations(생성)와 /api/household/invitations/accept다.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "이 초대 코드 방식은 더 이상 지원하지 않아요. 가족 관리자에게 이메일로 새 초대를 요청해주세요.",
    },
    { status: 410 },
  );
}
