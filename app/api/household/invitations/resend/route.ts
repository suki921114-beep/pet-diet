import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { householdInvitations } from "@/db/schema";
import { sendHouseholdInviteEmail } from "@/lib/email";
import { cancelInvitationById, createPendingInvitation, markInvitationSent } from "@/lib/householdInvites";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";
import { db, requireHouseholdOwner, requireSessionUser } from "../../_lib";

export const dynamic = "force-dynamic";

// 재발송: 지정한 초대를 취소하고, 같은 이메일로 완전히 새 토큰을 발급해
// 다시 보낸다. 기존 링크는 즉시 무효화된다.
export async function POST(request: Request) {
  const { user, response } = await requireSessionUser();
  if (!user) return response;

  const access = await requireHouseholdOwner(user.id);
  if (!access.ok) return access.response;
  const { household } = access;

  const rate = await checkRateLimit(`invite-send:${user.id}`, { max: 20, windowMs: 60 * 60 * 1000 });
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
    return NextResponse.json({ error: "재발송할 초대를 선택해주세요." }, { status: 400 });
  }

  const database = await db();
  const [existing] = await database
    .select()
    .from(householdInvitations)
    .where(
      and(
        eq(householdInvitations.id, invitationId),
        eq(householdInvitations.householdId, household.id),
        isNull(householdInvitations.acceptedAt),
      ),
    )
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "재발송할 수 있는 초대를 찾지 못했어요." }, { status: 404 });
  }

  await cancelInvitationById(existing.id);

  const { id, rawToken } = await createPendingInvitation(household.id, user.id, existing.email);
  const inviterLabel = user.displayName?.trim() || user.email;
  const result = await sendHouseholdInviteEmail(existing.email, rawToken, inviterLabel, household.name);
  if (!result.ok) {
    await cancelInvitationById(id);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  await markInvitationSent(id);

  return NextResponse.json({ ok: true });
}
