import { NextResponse } from "next/server";
import { findMembership, listMembers, requireApiUser } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const found = await findMembership(user.email);
  if (!found) {
    return NextResponse.json({ user, household: null });
  }

  const members = await listMembers(found.household.id);
  return NextResponse.json({
    user,
    household: {
      id: found.household.id,
      name: found.household.name,
      inviteCode: found.household.inviteCode,
      dataVersion: found.household.dataVersion,
      updatedAt: found.household.updatedAt,
      role: found.membership.role,
      members: members.map((member) => ({
        email: member.userEmail,
        displayName: member.displayName,
        role: member.role,
        joinedAt: member.joinedAt,
      })),
    },
  });
}
