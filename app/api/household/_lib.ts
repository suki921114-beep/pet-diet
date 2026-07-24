import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { households, householdMembers } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

// 가족 공유 기능은 로그인한 사용자만 쓸 수 있다.
export async function requireApiUser() {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "로그인이 필요해요." },
        { status: 401 },
      ),
    } as const;
  }
  return { user, response: null } as const;
}

export function db() {
  return getReadyDb();
}

const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O, 1/I 제외

export function generateInviteCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return code;
}

export async function findMembership(userEmail: string) {
  const database = await db();
  const [membership] = await database
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.userEmail, userEmail))
    .limit(1);
  if (!membership) return null;
  const [household] = await database
    .select()
    .from(households)
    .where(eq(households.id, membership.householdId))
    .limit(1);
  if (!household) return null;
  return { membership, household };
}

export async function listMembers(householdId: string) {
  const database = await db();
  return database
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));
}

// 가족에 속해 있으면 그 구성원 자격을 내려놓는다("나가기" 버튼과 계정 탈퇴
// 둘 다 이 함수를 쓴다 — 가족 쪽 규칙은 항상 한 곳에서만 정의되게 하기 위함).
// 마지막 구성원이 나가면 가족 자체를 정리해 고아 데이터가 남지 않게 한다.
// 애초에 어느 가족에도 속해 있지 않았다면 아무 일도 하지 않고 false를 돌려준다.
export async function leaveHouseholdIfMember(userEmail: string): Promise<boolean> {
  const found = await findMembership(userEmail);
  if (!found) return false;

  const database = await db();
  await database
    .delete(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, found.household.id),
        eq(householdMembers.userEmail, userEmail),
      ),
    );

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

export async function requireMembership(userEmail: string, householdId: string) {
  const database = await db();
  const [membership] = await database
    .select()
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userEmail, userEmail),
      ),
    )
    .limit(1);
  return membership ?? null;
}
