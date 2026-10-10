// 참견이 PWA 서비스워커.
// 1) 홈 화면 추가(설치)에 필요한 최소 요건 — fetch는 캐시 없이 그대로 네트워크로 통과시킨다.
// 2) 앱 알림(웹 푸시) — 서버가 보낸 참견을 알림으로 띄우고, 누르면 앱을 연다.
// 녹음 업로드/AI 분석/Supabase 통신 등 다른 요청에는 관여하지 않는다.

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

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "참견이";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
