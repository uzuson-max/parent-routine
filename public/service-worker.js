
// 참견이 PWA 최소 서비스워커.
// 오프라인 캐싱, 요청 가로채기, 리소스 프리캐시 등 어떤 로직도 없음 —
// 오직 "홈 화면에 추가했을 때 앱처럼 실행"되는 데 필요한 최소 요건(설치 가능한 서비스워커 존재)만
// 충족시키기 위한 용도. 녹음 업로드/AI 분석/전화·문자(Twilio)/Supabase 통신 등 기존 네트워크
// 요청에는 전혀 관여하지 않는다 — fetch 이벤트는 그대로 네트워크로 통과(passthrough)시킬 뿐,
// 캐시에 저장하거나 응답을 가로채지 않는다.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // 캐시 없이 원래 요청을 그대로 네트워크로 전달만 한다 (동작 변경 없음).
  event.respondWith(fetch(event.request));
});
