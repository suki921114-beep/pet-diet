import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { households, householdMembers } from "@/db/schema";
import { db, findMembership, requireApiUser } from "../_lib";

export const dynamic = "force-dynamic";

export async function POST() {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const found = await findMembership(user.email);
  if (!found) {
    return NextResponse.json({ error: "가입한 가족이 없어요." }, { status: 404 });
  }

  const database = await db();
  await database
    .delete(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, found.household.id),
        eq(householdMembers.userEmail, user.email),
      ),
    );

  const remaining = await database
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, found.household.id))
    .limit(1);

  // 마지막 구성원이 나가면 데이터가 고아로 남지 않도록 가족 자체를 정리한다.
  if (remaining.length === 0) {
    await database.delete(households).where(eq(households.id, found.household.id));
  }

  return NextResponse.json({ ok: true });
}
