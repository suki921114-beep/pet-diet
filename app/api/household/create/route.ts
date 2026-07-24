import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { households, householdMembers } from "@/db/schema";
import { db, generateInviteCode, getMembershipByUserId, requireSessionUser } from "../_lib";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response } = await requireSessionUser();
  if (!user) return response;

  const existing = await getMembershipByUserId(user.id);
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
    userId: user.id,
  });

  // inviteCode는 households 테이블의 NOT NULL 컬럼이라 내부적으로는 계속
  // 채워 넣지만(레거시 데이터/스키마 호환), 6자리 코드 참여 방식 자체가
  // 폐기됐으므로 클라이언트 응답에는 더 이상 포함하지 않는다(me/route.ts와
  // 동일하게 맞춤 — 화면 어디에도 죽은 코드를 보여주지 않기 위함).
  return NextResponse.json({
    household: {
      id: householdId,
      name: body.name?.trim() || "우리 가족",
      dataVersion: 1,
      updatedAt: now,
      role: "owner",
    },
  });
}
