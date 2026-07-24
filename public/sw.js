// 최소 기능 서비스워커 (1차 설치형 PWA 단계).
//
// 역할: 앱 셸(루트 "/")과 버전 고정 정적 자산(빌드 산출물, 아이콘 등)을 캐싱해
// 기본 화면의 제한적인 오프라인 표시를 지원하고, 새로 배포된 버전을 감지해
// 클라이언트에 업데이트 여부를 물을 수 있게 한다. 추후 웹 푸시 기능을 위한
// 최소한의 토대만 남겨둔다(푸시 기능 자체는 이번 단계 범위 밖).
//
// 절대 하지 않는 것:
//  - 사용자별 반려동물 기록, 가족 공유 데이터, 인증 요청, /api/** 서버 응답 캐싱
//  - GET이 아닌 요청(POST/PUT/PATCH/DELETE) 가로채기·큐잉
//  - 오프라인 기록 저장, 백그라운드 동기화

const CACHE_VERSION = "app-shell-v1";

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

// 이 서비스워커가 캐싱을 담당하는 "정적 자산"만 명시적으로 판별한다.
// Next.js 빌드 산출물(/_next/static/**, 버전 해시가 파일명에 포함되어 불변)과
// public/ 아래의 아이콘류만 대상으로 한다.
function isCacheableStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/icons/")) return true;
  if (
    url.pathname === "/favicon.svg" ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    return true;
  }
  return false;
}

self.addEventListener("install", () => {
  // 아무 것도 미리 캐싱하지 않는다. 앱 셸/정적 자산은 실제 요청이 들어올 때마다
  // fetch 이벤트에서 채워진다(런타임 캐싱). 새 서비스워커는 기본적으로 "waiting"
  // 상태로 대기하며, 사용자가 업데이트를 수락(SKIP_WAITING 메시지)해야 activate로 넘어간다.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 오래된 앱 셸 캐시만 정리한다. 이 서비스워커는 다른 이름의 캐시를
      // 만들지 않으므로, CACHE_VERSION과 이름이 다른 캐시는 모두 이전 버전이다.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// 새 버전이 배포되어도 곧바로 활성화하지 않는다. 클라이언트(등록/업데이트 UI)가
// "지금 업데이트" 클릭 시 이 메시지를 보내야만 skipWaiting을 호출해 activate로 넘어간다.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // POST/PUT/PATCH/DELETE는 절대 가로채지 않는다.

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 외부 요청(인증 제공자 등)은 그대로 둔다.
  if (isApiRequest(url)) return; // 서버 API 응답은 항상 네트워크로만 처리한다(캐시 금지).

  // 앱 셸(루트 문서)만 network-first + 오프라인 대체를 지원한다. 그 외 페이지
  // (약관/개인정보/초대수락/비밀번호재설정/이메일인증 등)는 이 단계의 범위인
  // "기본 화면의 제한적 오프라인 표시"에 해당하지 않으므로 개입하지 않는다.
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_VERSION);
          cache.put("/", response.clone());
          return response;
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          const cached = await cache.match("/");
          if (cached) return cached;
          return new Response(
            "<!doctype html><meta charset=\"utf-8\"><title>오프라인</title>" +
              "<p style=\"font-family:sans-serif;padding:24px\">인터넷 연결이 끊겼어요. 연결 후 다시 시도해주세요.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
    return;
  }

  // 버전 고정 정적 자산: cache-first, 없으면 네트워크에서 받아 캐시를 채운다.
  if (isCacheableStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch (error) {
          if (cached) return cached;
          throw error;
        }
      })(),
    );
    return;
  }

  // 그 외 모든 요청(사용자 데이터, 인증, 기타 페이지)은 서비스워커가 개입하지 않고
  // 브라우저 기본 네트워크 요청으로 그대로 흘려보낸다.
});
