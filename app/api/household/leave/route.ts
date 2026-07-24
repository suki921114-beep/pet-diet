import { NextResponse } from "next/server";
import { leaveHouseholdIfMember, requireHouseholdMember, requireSessionUser } from "../_lib";

export const dynamic = "force-dynamic";

// "가족 나가기"는 member만 바로 할 수 있다. owner는 다른 구성원이 있으면
// 먼저 소유권을 이전해야 하고(POST /api/household/transfer-ownership), 혼자
// 남은 owner는 이 버튼으로 가족 데이터를 조용히 지우지 않는다 — 가족 공간
// 삭제는 별도의 명시적 위험 작업(POST /api/household/delete)이나 계정
// 탈퇴에서만 일어난다.
export async function POST() {
  const { user, response } = await requireSessionUser();
  if (!user) return response;

  const access = await requireHouseholdMember(user.id);
  if (!access.ok) return access.response;

  if (access.membership.role === "owner") {
    return NextResponse.json(
      {
        error:
          "관리자는 바로 나갈 수 없어요. 다른 구성원에게 소유권을 이전한 뒤 나가거나, 혼자 남았다면 '가족 공간 삭제'를 이용해주세요.",
      },
      { status: 409 },
    );
  }

  const left = await leaveHouseholdIfMember(user.id);
  if (!left) {
    return NextResponse.json({ error: "가입한 가족이 없어요." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
