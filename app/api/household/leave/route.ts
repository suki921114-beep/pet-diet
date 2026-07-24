import { NextResponse } from "next/server";
import { leaveHouseholdIfMember, requireApiUser } from "../_lib";

export const dynamic = "force-dynamic";

export async function POST() {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const left = await leaveHouseholdIfMember(user.email);
  if (!left) {
    return NextResponse.json({ error: "가입한 가족이 없어요." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
