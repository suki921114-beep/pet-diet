// Resend로 인증·재설정 메일을 보낸다. RESEND_API_KEY가 설정돼 있지 않으면
// (예: 로컬 개발, 이 세션의 샌드박스) 실제 발송은 하지 않고 그 사실을
// 명확한 결과값으로 돌려준다 — 조용히 성공한 것처럼 넘어가지 않는다.
// 계정 생성 자체는 메일 발송 성공 여부와 무관하게 이뤄져야 하므로, 호출하는
// 쪽(app/api/auth/*)이 이 결과를 보고 사용자에게 정확한 안내를 보여준다.

export type SendEmailResult = { ok: true } | { ok: false; error: string };

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const appUrl = process.env.APP_URL?.trim();
  return { apiKey, from, appUrl };
}

export function getAppUrl(): string {
  return process.env.APP_URL?.trim() || "http://localhost:3000";
}

async function sendEmail(to: string, subject: string, html: string): Promise<SendEmailResult> {
  const { apiKey, from } = getResendConfig();
  if (!apiKey || !from) {
    console.warn(
      `[email] RESEND_API_KEY 또는 EMAIL_FROM이 설정되지 않아 메일을 보내지 못했어요. (to=${to}, subject=${subject})`,
    );
    return { ok: false, error: "이메일 서비스가 아직 설정되지 않았어요." };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`[email] Resend 발송 실패 (${response.status}): ${text}`);
      return { ok: false, error: "이메일 발송에 실패했어요." };
    }
    return { ok: true };
  } catch (error) {
    console.error("[email] 발송 중 오류", error);
    return { ok: false, error: "이메일 발송 중 오류가 발생했어요." };
  }
}

export async function sendVerificationEmail(to: string, rawToken: string): Promise<SendEmailResult> {
  const url = `${getAppUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
  return sendEmail(
    to,
    "이메일 주소를 인증해주세요",
    `<p>안녕하세요.</p><p>아래 링크를 눌러 이메일 주소를 인증해주세요. 이 링크는 24시간 동안만 유효해요.</p><p><a href="${url}">${url}</a></p><p>본인이 요청하지 않았다면 이 메일을 무시해도 괜찮아요.</p>`,
  );
}

export async function sendPasswordResetEmail(to: string, rawToken: string): Promise<SendEmailResult> {
  const url = `${getAppUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
  return sendEmail(
    to,
    "비밀번호 재설정",
    `<p>안녕하세요.</p><p>아래 링크를 눌러 비밀번호를 재설정해주세요. 이 링크는 30분 동안만 유효해요.</p><p><a href="${url}">${url}</a></p><p>본인이 요청하지 않았다면 이 메일을 무시해도 괜찮아요. 비밀번호는 바뀌지 않아요.</p>`,
  );
}
