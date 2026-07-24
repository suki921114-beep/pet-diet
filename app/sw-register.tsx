"use client";

// 서비스워커 등록 + 새 버전 감지/업데이트 안내를 담당하는 클라이언트 전용 컴포넌트.
// 프로덕션에서만 등록한다(개발 환경에서 서비스워커가 캐시를 붙잡고 있으면
// 핫리로드/테스트에 방해가 되므로).
//
// 새 서비스워커가 "waiting" 상태로 대기하면 배너를 띄우고, 사용자가
// "지금 업데이트"를 누르면 그 워커에 SKIP_WAITING을 보내 활성화시킨 뒤
// controllerchange 이벤트를 받아 페이지를 정확히 한 번만 새로고침한다.

import { useEffect, useRef, useState } from "react";

const SW_PATH = "/sw.js";

export default function ServiceWorkerUpdater() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const reloadedRef = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    function handleControllerChange() {
      // 새 서비스워커가 이 탭을 실제로 장악했을 때만 반응한다. 이미 한 번
      // 새로고침했다면(reloadedRef) 다시는 새로고침하지 않아 무한 루프를 막는다.
      if (reloadedRef.current) return;
      reloadedRef.current = true;
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    function trackInstalling(worker: ServiceWorker) {
      worker.addEventListener("statechange", () => {
        // controller가 이미 존재한다는 건 "최초 설치"가 아니라 "이미 떠 있던
        // 앱을 대체할 새 버전"이라는 뜻이다. 최초 설치 때는 배너를 띄우지 않는다.
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          setWaitingWorker(worker);
        }
      });
    }

    navigator.serviceWorker
      .register(SW_PATH)
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting);
        }
        if (registration.installing) trackInstalling(registration.installing);
        registration.addEventListener("updatefound", () => {
          if (registration.installing) trackInstalling(registration.installing);
        });
      })
      .catch(() => {
        // 서비스워커 등록 실패는 조용히 무시한다. PWA로 설치되지 않아도
        // 웹앱 자체의 동작에는 영향이 없어야 한다.
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  function updateNow() {
    if (!waitingWorker) return;
    waitingWorker.postMessage("SKIP_WAITING");
  }

  function dismiss() {
    setWaitingWorker(null);
  }

  if (!waitingWorker) return null;

  return (
    <div className="sw-update-banner" role="status">
      <span>새로운 버전이 준비됐어요.</span>
      <div className="sw-update-actions">
        <button type="button" className="button ghost small" onClick={dismiss}>
          나중에
        </button>
        <button type="button" className="button small" onClick={updateNow}>
          지금 업데이트
        </button>
      </div>
    </div>
  );
}
