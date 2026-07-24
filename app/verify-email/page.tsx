"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ShieldAlert } from "lucide-react";

type Status = "checking" | "success" | "error";

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token");
  // 토큰이 아예 없는 경우는 요청을 보내볼 필요도 없는 확정적인 오류라서,
  // effect 실행을 기다리지 않고 초기 state 계산 시점에 바로 반영한다
  // (effect 안에서 동기적으로 setState를 호출하지 않기 위함).
  const [{ status, message }, setResult] = useState<{ status: Status; message: string }>(() =>
    token
      ? { status: "checking", message: "이메일을 인증하는 중이에요…" }
      : { status: "error", message: "인증 링크가 올바르지 않아요." },
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = (await res.json()) as { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setResult({ status: "error", message: payload.error ?? "인증에 실패했어요." });
          return;
        }
        setResult({ status: "success", message: "이메일 인증이 완료됐어요." });
      } catch {
        if (!cancelled) {
          setResult({ status: "error", message: "네트워크 오류가 발생했어요. 다시 시도해주세요." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={{ maxWidth: 420, margin: "48px auto", padding: "0 16px" }}>
      <section className="form-section">
        <h2>이메일 인증</h2>
        {status === "checking" && <p className="form-note">{message}</p>}
        {status === "success" && (
          <div className="inline-alert" style={{ color: "inherit" }}>
            <CheckCircle2 size={18} /> {message}
          </div>
        )}
        {status === "error" && (
          <div className="inline-alert">
            <ShieldAlert size={18} /> {message}
          </div>
        )}
        <Link className="button primary full" href="/" style={{ marginTop: 16 }}>
          앱으로 돌아가기
        </Link>
      </section>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
