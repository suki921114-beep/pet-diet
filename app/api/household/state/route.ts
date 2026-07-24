import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { households } from "@/db/schema";
import { db, requireHouseholdMember, requireSessionUser } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireSessionUser();
  if (!user) return response;

  const access = await requireHouseholdMember(user.id);
  if (!access.ok) return access.response;
  const { household } = access;

  return NextResponse.json({
    data: JSON.parse(household.data),
    dataVersion: household.dataVersion,
    updatedAt: household.updatedAt,
    updatedByEmail: household.updatedByEmail,
  });
}

export async function POST(request: Request) {
  const { user, response } = await requireSessionUser();
  if (!user) return response;

  const access = await requireHouseholdMember(user.id);
  if (!access.ok) return access.response;
  const { household } = access;

  let body: { data?: unknown; expectedVersion?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  if (typeof body.data !== "object" || body.data === null) {
    return NextResponse.json({ error: "저장할 데이터가 없어요." }, { status: 400 });
  }

  // 다른 가족 구성원이 그 사이에 먼저 저장했다면(버전 불일치) 그 변경을
  // 덮어쓰지 않고 최신 데이터를 그대로 돌려준다. 클라이언트는 이를 받아
  // 최신 내용으로 갱신한 뒤 필요하면 다시 시도한다.
  if (typeof body.expectedVersion === "number" && body.expectedVersion !== household.dataVersion) {
    return NextResponse.json(
      {
        error: "다른 가족 구성원이 방금 먼저 저장했어요.",
        data: JSON.parse(household.data),
        dataVersion: household.dataVersion,
        updatedAt: household.updatedAt,
        updatedByEmail: household.updatedByEmail,
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const nextVersion = household.dataVersion + 1;
  const database = await db();
  // household.id는 항상 세션 사용자의 실제 멤버십에서 유도된 값이라, 클라이언트가
  // 다른 가족의 id를 보내는 방식으로 남의 데이터를 덮어쓸 수 없다.
  await database
    .update(households)
    .set({
      data: JSON.stringify(body.data),
      dataVersion: nextVersion,
      updatedAt: now,
      updatedByEmail: user.email,
    })
    .where(eq(households.id, household.id));

  return NextResponse.json({ dataVersion: nextVersion, updatedAt: now, updatedByEmail: user.email });
}
