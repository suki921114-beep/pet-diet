"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";

function ResetPasswordInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("재설정 링크가 올바르지 않아요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 해요.");
      return;
    }
    if (password !== confirm) {
      setError("비밀번호 확인이 일치하지 않아요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "재설정에 실패했어요.");
        return;
      }
      setDone(true);
    } catch {
      setError("네트워크 오류가 발생했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "48px auto", padding: "0 16px" }}>
      <section className="form-section">
        <h2>비밀번호 재설정</h2>
        {done ? (
          <>
            <p className="form-note">비밀번호를 새로 설정했어요. 이 기기에서는 자동으로 로그인돼요.</p>
            <Link className="button primary full" href="/" style={{ marginTop: 16 }}>
              앱으로 돌아가기
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>
              새 비밀번호
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8자 이상"
                minLength={8}
                required
              />
            </label>
            <label>
              새 비밀번호 확인
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </label>
            {error && (
              <div className="inline-alert">
                <ShieldAlert size={18} /> {error}
              </div>
            )}
            <button className="button primary full" type="submit" disabled={busy || !token}>
              비밀번호 재설정
            </button>
            {!token && <p className="form-note warning">재설정 링크가 올바르지 않아요.</p>}
          </form>
        )}
      </section>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
