import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { authAccounts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const database = await getReadyDb();
  // 로그인 수단이 하나도 안 남는 상황을 막는다: Google 연결을 끊으려면
  // 다른 로그인 수단(비밀번호)이 이미 있어야 한다.
  const [otherMethod] = await database
    .select({ id: authAccounts.id })
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, user.id), ne(authAccounts.provider, "google")))
    .limit(1);
  if (!otherMethod) {
    return NextResponse.json(
      { error: "다른 로그인 수단이 없어서 Google 연결을 해제할 수 없어요. 먼저 비밀번호를 설정해주세요." },
      { status: 400 },
    );
  }

  await database
    .delete(authAccounts)
    .where(and(eq(authAccounts.userId, user.id), eq(authAccounts.provider, "google")));

  return NextResponse.json({ ok: true });
}
