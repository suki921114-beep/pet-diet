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
