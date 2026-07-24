import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { households, householdMembers } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

// 가족 공유 기능은 로그인한 사용자만 쓸 수 있다. (스펙의 requireSessionUser())
export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }),
    } as const;
  }
  return { user, response: null } as const;
}

export function db() {
  return getReadyDb();
}

// 예전 6자리 코드는 더 이상 새로 발급하지 않지만(household_invitations로
// 대체), households.invite_code 컬럼 자체는 기존 데이터 보존을 위해 남겨두고
// 계속 값만 채워둔다(사용처는 없음).
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O, 1/I 제외

export function generateInviteCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return code;
}

export type Membership = {
  household: typeof households.$inferSelect;
  membership: typeof householdMembers.$inferSelect;
};

// userId 기준으로만 멤버십을 조회한다 — 이메일 문자열은 표시용일 뿐, 이제
// 권한 판단의 근거가 아니다. user_id가 NULL인(마이그레이션 미연결) 행은
// 여기서 아예 조회되지 않으므로 자동으로 "유효하지 않은 멤버십"이 된다.
export async function getMembershipByUserId(userId: string): Promise<Membership | null> {
  const database = await db();
  const [membership] = await database
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);
  if (!membership) return null;
  const [household] = await database
    .select()
    .from(households)
    .where(eq(households.id, membership.householdId))
    .limit(1);
  if (!household) return null; // 고아 멤버십 방어(정상 흐름에서는 발생하지 않음)
  return { membership, household };
}

function notMemberResponse() {
  return NextResponse.json({ error: "가입한 가족이 없어요." }, { status: 404 });
}

function forbiddenResponse() {
  // 어떤 가족이 존재하는지, 왜 막혔는지 이상으로 세부 정보를 노출하지 않는다.
  return NextResponse.json({ error: "이 작업을 수행할 권한이 없어요." }, { status: 403 });
}

// 순서: (호출하는 라우트가 이미 requireSessionUser로 세션을 확인했다는 전제하에)
// 로그인 세션 → 사용자 존재/활성 상태(getSessionUser가 이미 확인) → 가족
// 구성원 여부 → (owner 버전은) 역할까지 확인한다.
export async function requireHouseholdMember(
  userId: string,
): Promise<{ ok: true; household: Membership["household"]; membership: Membership["membership"] } | { ok: false; response: NextResponse }> {
  const found = await getMembershipByUserId(userId);
  if (!found) return { ok: false, response: notMemberResponse() };
  return { ok: true, household: found.household, membership: found.membership };
}

export async function requireHouseholdOwner(
  userId: string,
): Promise<{ ok: true; household: Membership["household"]; membership: Membership["membership"] } | { ok: false; response: NextResponse }> {
  const result = await requireHouseholdMember(userId);
  if (!result.ok) return result;
  if (result.membership.role !== "owner") {
    return { ok: false, response: forbiddenResponse() };
  }
  return result;
}

// 클라이언트가 body/쿼리로 householdId를 보내는 경우(예: 초대 수락), 그 값이
// 실제로 세션 사용자가 속한 가족과 같은지 확인한다(IDOR 방지용 추가 검사).
export function requireSameHousehold(membership: Membership, householdId: string): boolean {
  return membership.household.id === householdId;
}

export async function listMembers(householdId: string) {
  const database = await db();
  return database
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));
}

// 가족에 속해 있으면 그 구성원 자격을 내려놓는다. member의 "가족 나가기"와
// 계정 탈퇴의 마지막 정리 단계 둘 다 이 함수를 쓴다.
// 주의: owner의 탈퇴 가능 여부(다른 구성원이 남아있으면 소유권 이전 필요)는
// 이 함수를 호출하기 "전에" 호출하는 쪽에서 이미 확인했어야 한다 — 이
// 함수 자체는 무조건 멤버십을 지우고, 마지막 한 명이 나가면 가족 자체를
// 정리한다(계정 탈퇴의 "혼자 남은 owner" 분기에서만 이 정리 동작을 기대해야
// 하며, 일반 "가족 나가기" 버튼에서는 owner가 이 함수까지 도달하지 않도록
// 라우트 단에서 막는다).
export async function leaveHouseholdIfMember(userId: string): Promise<boolean> {
  const found = await getMembershipByUserId(userId);
  if (!found) return false;

  const database = await db();
  await database.delete(householdMembers).where(eq(householdMembers.id, found.membership.id));

  const remaining = await database
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, found.household.id))
    .limit(1);

  if (remaining.length === 0) {
    await database.delete(households).where(eq(households.id, found.household.id));
  }

  return true;
}
