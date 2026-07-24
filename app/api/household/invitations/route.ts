import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { householdInvitations } from "@/db/schema";
import { sendHouseholdInviteEmail } from "@/lib/email";
import {
  cancelInvitationById,
  cancelPendingInvitationsForEmail,
  createPendingInvitation,
  invitationStatus,
  markInvitationSent,
} from "@/lib/householdInvites";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";
import { db, requireHouseholdOwner, requireSessionUser } from "../_lib";

export const dynamic = "force-dynamic";

// 초대 목록 조회(owner 전용). 토큰 원본/해시는 절대 포함하지 않는다.
export async function GET() {
  const { user, response } = await requireSessionUser();
  if (!user) return response;

  const access = await requireHouseholdOwner(user.id);
  if (!access.ok) return access.response;

  const database = await db();
  const rows = await database
    .select()
    .from(householdInvitations)
    .where(eq(householdInvitations.householdId, access.household.id));

  const now = new Date().toISOString();
  return NextResponse.json({
    invitations: rows
      .map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        status: invitationStatus(row, now),
      }))
      // 화면이 지저분해지지 않도록 취소·수락된 오래된 초대는 굳이 보여주지
      // 않는다. 최근 것만 최신순으로.
      .filter((row) => row.status === "sent_pending" || row.status === "pending" || row.status === "expired")
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  });
}

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

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "올바른 이메일을 입력해주세요." }, { status: 400 });
  }

  await cancelPendingInvitationsForEmail(household.id, email);
  const { id, rawToken } = await createPendingInvitation(household.id, user.id, email);

  const inviterLabel = user.displayName?.trim() || user.email;
  const result = await sendHouseholdInviteEmail(email, rawToken, inviterLabel, household.name);
  if (!result.ok) {
    await cancelInvitationById(id);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  await markInvitationSent(id);

  return NextResponse.json({ ok: true });
}
