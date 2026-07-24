import { redirect } from "next/navigation";

// 이메일 초대 링크(/invite/accept?token=...)가 실제로 여는 페이지. 이 앱은
// 별도 로그인 페이지가 없는 단일 페이지 앱이라, 토큰을 그대로 안전한 내부
// 경로(항상 "/"로 시작)인 홈으로 옮겨준다. 실제 로그인 확인/수락 API 호출은
// PetDietApp이 ?inviteToken= 쿼리를 감지해서 처리한다. redirect()의 목적지가
// 하드코딩된 내부 경로라 오픈 리다이렉트 위험은 없다.
export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    redirect("/");
  }
  redirect(`/?inviteToken=${encodeURIComponent(token)}`);
}
