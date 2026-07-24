import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { authAccounts, users } from "@/db/schema";
import { getSessionUser, hasPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 계정 설정 화면(비밀번호 변경, Google 연결 상태, 이메일 인증 여부)에 필요한
// 정보만 모아서 돌려준다. 가족(household) 정보는 이 라우트에서 다루지 않는다
// — 그건 여전히 /api/household/me 몫이다.
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const database = await getReadyDb();
  const [row] = await database
    .select({ passwordHash: users.passwordHash, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const accounts = await database
    .select({ provider: authAccounts.provider })
    .from(authAccounts)
    .where(eq(authAccounts.userId, user.id));

  return NextResponse.json({
    user,
    emailVerified: Boolean(row?.emailVerifiedAt),
    hasPassword: hasPassword(row?.passwordHash ?? ""),
    providers: accounts.map((a) => a.provider),
  });
}
