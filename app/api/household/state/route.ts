import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { households } from "@/db/schema";
import { db, findMembership, requireApiUser } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const found = await findMembership(user.email);
  if (!found) {
    return NextResponse.json({ error: "가입한 가족이 없어요." }, { status: 404 });
  }

  return NextResponse.json({
    data: JSON.parse(found.household.data),
    dataVersion: found.household.dataVersion,
    updatedAt: found.household.updatedAt,
    updatedByEmail: found.household.updatedByEmail,
  });
}

export async function POST(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const found = await findMembership(user.email);
  if (!found) {
    return NextResponse.json({ error: "가입한 가족이 없어요." }, { status: 404 });
  }

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
  if (
    typeof body.expectedVersion === "number" &&
    body.expectedVersion !== found.household.dataVersion
  ) {
    return NextResponse.json(
      {
        error: "다른 가족 구성원이 방금 먼저 저장했어요.",
        data: JSON.parse(found.household.data),
        dataVersion: found.household.dataVersion,
        updatedAt: found.household.updatedAt,
        updatedByEmail: found.household.updatedByEmail,
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const nextVersion = found.household.dataVersion + 1;
  const database = await db();
  await database
    .update(households)
    .set({
      data: JSON.stringify(body.data),
      dataVersion: nextVersion,
      updatedAt: now,
      updatedByEmail: user.email,
    })
    .where(eq(households.id, found.household.id));

  return NextResponse.json({ dataVersion: nextVersion, updatedAt: now, updatedByEmail: user.email });
}
