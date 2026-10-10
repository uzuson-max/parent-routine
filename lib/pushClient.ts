// lib/pushClient.ts
"use client";
import { supabaseClient } from "@/lib/supabaseClient";

// ============================================================================
// 브라우저 쪽 앱 알림 도우미.
// - 알림 허용 창은 사용자가 버튼을 누른 그 순간(클릭 핸들러 안)에만 띄울 수 있다(아이폰 규칙).
// - 아이폰은 "홈 화면에 추가"한 앱에서만 알림을 받을 수 있다(iOS 16.4+).
// ============================================================================

const DISMISS_KEY = "ganseobi_push_offer_dismissed";

export type PushSupport = "ok" | "needs_install" | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // 아이폰 사파리 탭에서는 PushManager가 없다 — 홈 화면에 추가하면 생긴다.
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    return ios ? "needs_install" : "unsupported";
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "unsupported";
  return "ok";
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

async function authHeader(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : null;
}

/** 서비스워커가 준비 안 되면 영영 안 끝나는 ready를 기다리지 않는다 — 대답 말풍선이 멈추면 안 된다. */
function readyWithin(ms: number): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ok") return null;
  try {
    const reg = await readyWithin(2500);
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** "괜찮아"/"알겠어"로 닫은 적 있는지 */
export function pushOfferDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** "그날 알려줄까?"를 띄워도 되는지 — 지원되고, 아직 이 기기를 등록 안 했고, 거절/닫은 적 없을 때만. */
export async function shouldOfferPush(): Promise<boolean> {
  if (pushSupport() !== "ok") return false;
  if (notificationPermission() === "denied") return false;
  try {
    if (localStorage.getItem(DISMISS_KEY) === "1") return false;
  } catch {
    /* 저장소 못 읽으면 그냥 진행 */
  }
  return !(await currentSubscription());
}

export function dismissPushOffer() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* 무시 */
  }
}

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** 반드시 버튼 클릭 핸들러 안에서 부를 것. 성공하면 "ok", 사용자가 거절하면 "denied". */
export async function subscribePush(): Promise<"ok" | "denied" | "failed"> {
  if (pushSupport() !== "ok") return "failed";
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const reg = await readyWithin(8000);
    if (!reg) return "failed";
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string),
      });
    }
    const headers = await authHeader();
    if (!headers) return "failed";
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return res.ok ? "ok" : "failed";
  } catch (e) {
    console.error("[push] 구독 실패:", e);
    return "failed";
  }
}

export async function unsubscribePush(): Promise<boolean> {
  try {
    const sub = await currentSubscription();
    const headers = await authHeader();
    if (headers) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub?.endpoint ?? "" }),
      });
    }
    if (sub) await sub.unsubscribe();
    return true;
  } catch {
    return false;
  }
}
