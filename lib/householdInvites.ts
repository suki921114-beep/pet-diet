import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getReadyDb } from "@/db";
import { householdInvitations } from "@/db/schema";
import { hashToken, randomToken } from "@/lib/auth";

// 초대 만료 기간을 한 곳에서만 관리한다.
export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7일

export type InvitationStatus = "pending" | "sent_pending" | "expired" | "accepted" | "cancelled";

export function invitationStatus(
  row: { sentAt: string | null; acceptedAt: string | null; cancelledAt: string | null; expiresAt: string },
  now = new Date().toISOString(),
): InvitationStatus {
  if (row.cancelledAt) return "cancelled";
  if (row.acceptedAt) return "accepted";
  if (row.expiresAt <= now) return "expired";
  if (!row.sentAt) return "pending"; // 발송 처리 중(정상적으로는 거의 안 보임)
  return "sent_pending";
}

// 같은 가족+이메일로 이미 살아있는(수락/취소/만료되지 않은) 초대가 있으면
// 모두 취소 처리한다 — 새 초대를 만들거나 재발송할 때, 오래된 링크가 계속
// 유효한 채로 남아있지 않게 하기 위함.
export async function cancelPendingInvitationsForEmail(householdId: string, email: string): Promise<void> {
  const database = await getReadyDb();
  const now = new Date().toISOString();
  await database
    .update(householdInvitations)
    .set({ cancelledAt: now })
    .where(
      and(
        eq(householdInvitations.householdId, householdId),
        eq(householdInvitations.email, email),
        isNull(householdInvitations.acceptedAt),
        isNull(householdInvitations.cancelledAt),
      ),
    );
}

// 초대를 "발송 대기" 상태로 만든다. 이 시점에는 아직 수락할 수 없다(sentAt이
// null) — 이메일 발송에 실제로 성공한 뒤에만 markInvitationSent로 활성화한다.
export async function createPendingInvitation(
  householdId: string,
  invitedByUserId: string,
  email: string,
): Promise<{ id: string; rawToken: string }> {
  const database = await getReadyDb();
  const id = randomUUID();
  const rawToken = randomToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  await database.insert(householdInvitations).values({
    id,
    householdId,
    invitedByUserId,
    email,
    role: "member",
    tokenHash: hashToken(rawToken),
    expiresAt,
  });
  return { id, rawToken };
}

export async function markInvitationSent(id: string): Promise<void> {
  const database = await getReadyDb();
  await database
    .update(householdInvitations)
    .set({ sentAt: new Date().toISOString() })
    .where(eq(householdInvitations.id, id));
}

// 이메일 발송이 실패했을 때: "발송 대기" 상태로 남겨두지 않고 취소 처리해서,
// 수락할 수 없는 반쪽짜리 초대가 남지 않게 한다.
export async function cancelInvitationById(id: string): Promise<void> {
  const database = await getReadyDb();
  await database
    .update(householdInvitations)
    .set({ cancelledAt: new Date().toISOString() })
    .where(eq(householdInvitations.id, id));
}
