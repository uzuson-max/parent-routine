
"use client";

import { useEffect } from "react";

// 참견이 PWA(홈 화면 추가) 지원용 컴포넌트 — 서비스워커 등록만 담당한다.
// 화면/상태/기존 로직에는 전혀 관여하지 않고, 등록 실패해도 앱 동작에는 영향 없음(조용히 무시).
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // 서비스워커 등록 실패는 치명적이지 않으므로 무시 (앱은 정상 동작).
    });
  }, []);

  return null;
}
