import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { householdMembers } from "@/db/schema";
import { db, requireHouseholdOwner, requireSessionUser } from "../_lib";

export const dynamic = "force-dynamic";

// owner만 "다른" member를 제거할 수 있다. 자기 자신이나 현재 owner는 이
// 라우트로 제거할 수 없다(각각 나가기/소유권 이전으로만 가능).
export async function POST(request: Request) {
  const { user, response } = await requireSessionUser();
  if (!user) return response;

  const access = await requireHouseholdOwner(user.id);
  if (!access.ok) return access.response;
  const { household, membership } = access;

  let body: { targetUserId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const targetUserId = body.targetUserId?.trim();
  if (!targetUserId) {
    return NextResponse.json({ error: "제거할 구성원을 선택해주세요." }, { status: 400 });
  }
  if (targetUserId === membership.userId) {
    return NextResponse.json(
      { error: "자기 자신은 이 방법으로 제거할 수 없어요. 가족 나가기를 이용해주세요." },
      { status: 400 },
    );
  }

  const database = await db();
  const [target] = await database
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, household.id), eq(householdMembers.userId, targetUserId)))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "같은 가족의 구성원이 아니에요." }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json(
      { error: "관리자는 이 방법으로 제거할 수 없어요. 먼저 소유권을 이전해주세요." },
      { status: 400 },
    );
  }

  await database.delete(householdMembers).where(eq(householdMembers.id, target.id));

  return NextResponse.json({ ok: true });
}
