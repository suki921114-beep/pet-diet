import { NextResponse } from "next/server";
import { getMembershipByUserId, listMembers, requireSessionUser } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireSessionUser();
  if (!user) return response;

  const found = await getMembershipByUserId(user.id);
  if (!found) {
    return NextResponse.json({ user, household: null });
  }

  const members = await listMembers(found.household.id);
  return NextResponse.json({
    user,
    household: {
      id: found.household.id,
      name: found.household.name,
      dataVersion: found.household.dataVersion,
      updatedAt: found.household.updatedAt,
      role: found.membership.role,
      members: members.map((member) => ({
        userId: member.userId,
        email: member.userEmail,
        displayName: member.displayName,
        role: member.role,
        joinedAt: member.joinedAt,
      })),
    },
  });
}
