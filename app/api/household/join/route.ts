import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { households, householdMembers } from "@/db/schema";
import { db, findMembership, listMembers, requireApiUser } from "../_lib";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const existing = await findMembership(user.email);
  if (existing) {
    return NextResponse.json(
      { error: "이미 가족에 속해있어요. 먼저 기존 가족에서 나가주세요." },
      { status: 409 },
    );
  }

  let body: { inviteCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const inviteCode = body.inviteCode?.trim().toUpperCase();
  if (!inviteCode) {
    return NextResponse.json({ error: "초대 코드를 입력해주세요." }, { status: 400 });
  }

  const database = await db();
  const [household] = await database
    .select()
    .from(households)
    .where(eq(households.inviteCode, inviteCode))
    .limit(1);
  if (!household) {
    return NextResponse.json(
      { error: "초대 코드를 찾을 수 없어요. 코드를 다시 확인해주세요." },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  await database.insert(householdMembers).values({
    id: crypto.randomUUID(),
    householdId: household.id,
    userEmail: user.email,
    displayName: user.displayName,
    role: "member",
    joinedAt: now,
  });

  const members = await listMembers(household.id);
  return NextResponse.json({
    household: {
      id: household.id,
      name: household.name,
      inviteCode: household.inviteCode,
      dataVersion: household.dataVersion,
      updatedAt: household.updatedAt,
      role: "member",
      members: members.map((member) => ({
        email: member.userEmail,
        displayName: member.displayName,
        role: member.role,
        joinedAt: member.joinedAt,
      })),
    },
    data: JSON.parse(household.data),
  });
}
