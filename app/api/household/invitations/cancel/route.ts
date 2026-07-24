import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { householdInvitations } from "@/db/schema";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";
import { db, requireHouseholdOwner, requireSessionUser } from "../../_lib";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response } = await requireSessionUser();
  if (!user) return response;

  const access = await requireHouseholdOwner(user.id);
  if (!access.ok) return access.response;

  const rate = await checkRateLimit(`invite-manage:${user.id}`, { max: 60, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage() }, { status: 429 });
  }

  let body: { invitationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const invitationId = body.invitationId?.trim();
  if (!invitationId) {
    return NextResponse.json({ error: "취소할 초대를 선택해주세요." }, { status: 400 });
  }

  const database = await db();
  const result = await database
    .update(householdInvitations)
    .set({ cancelledAt: new Date().toISOString() })
    .where(
      and(
        eq(householdInvitations.id, invitationId),
        // 다른 가족의 초대를 id만으로 취소할 수 없게 한다.
        eq(householdInvitations.householdId, access.household.id),
        isNull(householdInvitations.acceptedAt),
        isNull(householdInvitations.cancelledAt),
      ),
    );
  if (result.rowsAffected === 0) {
    return NextResponse.json({ error: "취소할 수 있는 초대를 찾지 못했어요." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
