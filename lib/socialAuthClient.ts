//
// 소셜 로그인(카카오/구글/애플) 공통 로직. 온보딩 체크리스트와 마이페이지가 같이 쓴다.
//
// 핵심 원칙: 기존 user_id 유지.
// - 지금 세션(익명이든 번호 계정이든)에 소셜 계정을 "연결"(linkIdentity)한다 → user_id 그대로, 기록 그대로.
// - 그 소셜 계정이 이미 다른 참견이 계정에 붙어 있으면(=예전에 다른 폰에서 연결한 사람) 그 계정으로
//   로그인을 넘긴다(signInWithOAuth). 이때 지금 막 생긴 빈 익명 계정만 버려진다(번호 로직과 같음).
// - redirectTo를 반드시 넘긴다. 안 넘기거나 Supabase Redirect URLs에 없으면 Supabase Site URL
//   (지금 우리집 레코드 주소)로 튕겨 나간다.
"use client";

import { supabaseClient } from "@/lib/supabaseClient";

export type SocialProvider = "kakao" | "google" | "apple";

const PENDING_KEY = "ganseobi_oauth_pending";

// 켜둔 provider만 버튼을 보여준다. Vercel 환경변수 NEXT_PUBLIC_AUTH_PROVIDERS="kakao,google,apple"
// (설정 안 하면 카카오만). Supabase에서 아직 안 켠 provider 버튼이 보이면 눌러도 에러라서.
export function enabledProviders(): SocialProvider[] {
  const raw = process.env.NEXT_PUBLIC_AUTH_PROVIDERS || "kakao";
  return raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v): v is SocialProvider => v === "kakao" || v === "google" || v === "apple");
}

// 언어에 따라 버튼 순서·노출을 정한다.
// - 한국어: 카카오가 메인, 애플·구글은 작게.
// - 그 외: 카카오는 숨기고 애플(아이폰)·구글.
export function providersForLocale(): { main: SocialProvider[]; more: SocialProvider[] } {
  const enabled = enabledProviders();
  const lang = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "ko";
  const isKo = lang.startsWith("ko");
  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const order: SocialProvider[] = isKo
    ? ["kakao", isIOS ? "apple" : "google", isIOS ? "google" : "apple"]
    : [isIOS ? "apple" : "google", isIOS ? "google" : "apple"];
  const list = order.filter((p) => enabled.includes(p));
  return isKo ? { main: list.slice(0, 1), more: list.slice(1) } : { main: list, more: [] };
}

export const PROVIDER_LABEL: Record<SocialProvider, string> = {
  kakao: "카카오로 계속하기",
  google: "Google로 계속하기",
  apple: "Apple로 계속하기",
};

function returnUrl(provider: SocialProvider) {
  return `${window.location.origin}/?auth=${provider}`;
}

/** 지금 계정에 소셜 계정 연결 시작(페이지가 카카오 등으로 이동한다). */
export async function startSocialLink(provider: SocialProvider): Promise<{ error: string | null }> {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  localStorage.setItem(PENDING_KEY, provider);

  // 세션이 없으면 연결할 대상이 없으니 그냥 로그인.
  if (!session) {
    const { error } = await supabaseClient.auth.signInWithOAuth({ provider, options: { redirectTo: returnUrl(provider) } });
    return { error: error ? "로그인을 시작하지 못했어\n잠깐 뒤에 다시 해줘" : null };
  }

  const { error } = await supabaseClient.auth.linkIdentity({ provider, options: { redirectTo: returnUrl(provider) } });
  if (error) {
    localStorage.removeItem(PENDING_KEY);
    console.error("[socialAuth] linkIdentity 실패:", error.message);
    // 대부분 Supabase "Manual linking"이 꺼져 있을 때다.
    return { error: "연결을 시작하지 못했어\n잠깐 뒤에 다시 해줘" };
  }
  return { error: null };
}

/**
 * 앱 첫 로드 때 한 번 부른다(ensureSession 맨 앞).
 * 소셜 화면에서 돌아왔을 때 "이미 다른 계정에 연결된 소셜 계정"이면 그 계정으로 로그인을 넘긴다.
 * true를 반환하면 페이지가 다시 이동 중이니 나머지 초기화를 멈춰야 한다.
 */
export async function handleOAuthReturn(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const provider = url.searchParams.get("auth") as SocialProvider | null;
  if (!provider) return false;

  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const errCode = hash.get("error_code") || url.searchParams.get("error_code");
  const errDesc = (hash.get("error_description") || url.searchParams.get("error_description") || "").toLowerCase();
  const pending = localStorage.getItem(PENDING_KEY);
  localStorage.removeItem(PENDING_KEY);

  // Supabase가 주소의 토큰(#access_token)을 먼저 읽어 세션을 만들게 기다린 뒤 주소창 정리.
  await supabaseClient.auth.getSession();
  window.history.replaceState(null, "", "/");

  const alreadyLinked = errCode === "identity_already_exists" || errDesc.includes("already linked") || errDesc.includes("identity is already");
  if (alreadyLinked && pending === provider) {
    // 그 소셜 계정이 가진 기존 참견이 계정으로 넘어간다.
    await supabaseClient.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/?auth=done` } });
    return true;
  }
  if (errCode) console.error("[socialAuth] 복귀 에러:", errCode, errDesc);
  return false;
}

/** 익명이 아닌(=소셜이나 번호로 지켜진) 계정인지. */
export function isProtectedUser(user: { is_anonymous?: boolean; phone?: string | null; identities?: { provider: string }[] } | null | undefined) {
  if (!user) return false;
  if (user.phone) return true;
  return (user.identities ?? []).some((i) => ["kakao", "google", "apple"].includes(i.provider));
}

export function linkedProviders(user: { identities?: { provider: string }[] } | null | undefined): SocialProvider[] {
  return (user?.identities ?? []).map((i) => i.provider).filter((p): p is SocialProvider => p === "kakao" || p === "google" || p === "apple");
}
