import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getReadyDb } from "@/db";
import { householdInvitations, householdMembers, households, users } from "@/db/schema";
import { hasPassword, REAUTH_COOKIE_NAME, verifyPassword, verifyReauthToken } from "@/lib/auth";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";
import { requireHouseholdOwner, requireSessionUser } from "../_lib";

export const dynamic = "force-dynamic";

// "가족 공간 삭제": household.data를 포함해 가족 자체를 완전히 지우는
// 명시적 위험 작업. 다른 구성원이 남아있는 동안에는 그들의 공유 데이터를
// 동의 없이 지울 수 없으므로, 혼자 남은 owner만 쓸 수 있다. 단순 "가족
// 나가기" 버튼으로는 이 동작이 절대 일어나지 않는다(leave/route.ts 참고).
export async function POST(request: Request) {
  const { user, response } = await requireSessionUser();
  if (!user) return response;

  const access = await requireHouseholdOwner(user.id);
  if (!access.ok) return access.response;
  const { household, membership } = access;

  const rate = await checkRateLimit(`household-delete:${user.id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  const database = await getReadyDb();
  const otherMembers = await database
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, household.id))
    .limit(2);
  if (otherMembers.length > 1) {
    return NextResponse.json(
      { error: "다른 구성원이 있는 동안에는 가족 공간을 삭제할 수 없어요. 먼저 구성원을 정리해주세요." },
      { status: 409 },
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const [row] = await database
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "계정을 찾을 수 없어요." }, { status: 404 });
  }
  if (hasPassword(row.passwordHash)) {
    const password = body.password ?? "";
    if (!password || !(await verifyPassword(password, row.passwordHash))) {
      return NextResponse.json({ error: "비밀번호가 올바르지 않아요." }, { status: 401 });
    }
  } else {
    const store = await cookies();
    const reauthCookie = store.get(REAUTH_COOKIE_NAME)?.value;
    if (!reauthCookie || !verifyReauthToken(reauthCookie, user.id)) {
      return NextResponse.json(
        { error: "본인 확인이 필요해요. Google로 다시 인증한 뒤 시도해주세요." },
        { status: 401 },
      );
    }
  }

  await database.transaction(async (tx) => {
    await tx.delete(householdInvitations).where(eq(householdInvitations.householdId, household.id));
    await tx.delete(householdMembers).where(eq(householdMembers.id, membership.id));
    await tx.delete(households).where(eq(households.id, household.id));
  });

  return NextResponse.json({ ok: true });
}
