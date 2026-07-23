import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { households, householdMembers } from "@/db/schema";
import { db, findMembership, generateInviteCode, requireApiUser } from "../_lib";

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

  let body: { name?: string; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  if (typeof body.data !== "object" || body.data === null) {
    return NextResponse.json({ error: "공유할 데이터가 없어요." }, { status: 400 });
  }

  const database = await db();
  const householdId = crypto.randomUUID();
  let inviteCode = generateInviteCode();
  // 초대 코드 중복 시 몇 번 더 시도한다.
  for (let attempt = 0; attempt < 5; attempt++) {
    const [clash] = await database
      .select({ id: households.id })
      .from(households)
      .where(eq(households.inviteCode, inviteCode))
      .limit(1);
    if (!clash) break;
    inviteCode = generateInviteCode();
  }

  const now = new Date().toISOString();
  await database.insert(households).values({
    id: householdId,
    inviteCode,
    name: body.name?.trim() || "우리 가족",
    data: JSON.stringify(body.data),
    dataVersion: 1,
    updatedAt: now,
    updatedByEmail: user.email,
    createdAt: now,
  });
  await database.insert(householdMembers).values({
    id: crypto.randomUUID(),
    householdId,
    userEmail: user.email,
    displayName: user.displayName,
    role: "owner",
    joinedAt: now,
  });

  return NextResponse.json({
    household: {
      id: householdId,
      name: body.name?.trim() || "우리 가족",
      inviteCode,
      dataVersion: 1,
      updatedAt: now,
      role: "owner",
    },
  });
}
