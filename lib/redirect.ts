// 로그인 후 이동할 경로("next"/"redirectTo" 등으로 넘어오는 값)는 반드시
// 이 앱 내부 경로만 허용한다. "//evil.com"이나 "https://evil.com" 같은
// 프로토콜 상대/절대 URL을 그대로 리다이렉트하면 open redirect가 된다.
export function safeInternalPath(path: string | null | undefined): string {
  if (!path) return "/";
  if (!path.startsWith("/")) return "/";
  if (path.startsWith("//")) return "/";
  if (path.includes("://")) return "/";
  if (path.startsWith("/\\")) return "/";
  return path;
}
