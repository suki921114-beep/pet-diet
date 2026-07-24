import Link from "next/link";
import { TERMS_BODY, TERMS_TITLE, TERMS_VERSION } from "@/lib/legal";

export default function TermsPage() {
  return (
    <div style={{ maxWidth: 640, margin: "48px auto", padding: "0 16px" }}>
      <section className="form-section">
        <h2>{TERMS_TITLE}</h2>
        <p className="form-note warning">
          이 문서는 예시(플레이스홀더) 문구이며 법적 효력이 없어요. 실제 서비스 배포 전 법률
          전문가의 검토가 필요해요.
        </p>
        <p className="form-note">버전: {TERMS_VERSION}</p>
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.6 }}>{TERMS_BODY}</pre>
        <Link className="button secondary full" href="/" style={{ marginTop: 16 }}>
          앱으로 돌아가기
        </Link>
      </section>
    </div>
  );
}
