"use client";

// 앱을 켤 때 한 번만 나오는 시작 화면.
// 1단계: 앱 아이콘과 같은 민트 바탕 + 작은 수달 아이콘 (캐치처럼 작게, 아이콘을 누른 순간과 화면이 이어지게)
// 2단계: 바탕이 홈 바다색으로 천천히 바뀌면서 "hello, 닉네임"이 떠오름 (이케아처럼)
// 그동안 뒤에서는 세션 확인·홈 데이터가 불러와진다. 끝나면 서서히 사라진다.
// 같은 탭에서 새로고침하거나 소셜 로그인에서 돌아온 경우엔 다시 보여주지 않는다.

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

const MINT = "#74D3B4"; // 앱 아이콘 배경색과 같음
const SEA = "#1B5A96"; // 홈 바다(tankWallBackground)와 같음

const PHASE1_MS = 900; // 로고만 보이는 최소 시간
const NICK_WAIT_MAX_MS = 1800; // 닉네임을 이 이상은 기다리지 않음
const PHASE2_MS = 1400; // 인사가 읽히는 시간
const FADE_MS = 450;

const SHOWN_KEY = "ganseobi_splash_shown"; // sessionStorage: 이번 실행에서 이미 보여줬는지
const NICK_CACHE_KEY = "ganseobi_nickname_cache"; // localStorage: 다음 실행 때 바로 이름을 띄우기 위한 캐시

type Phase = "logo" | "hello" | "fade" | "done";

export default function SplashScreen() {
  const [phase, setPhase] = useState<Phase>("logo");
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    let skip = false;
    try {
      const fromOAuth = new URL(window.location.href).searchParams.has("auth");
      skip = fromOAuth || sessionStorage.getItem(SHOWN_KEY) === "1";
      sessionStorage.setItem(SHOWN_KEY, "1");
    } catch {}

    if (skip) {
      setPhase("fade");
      const t = setTimeout(() => setPhase("done"), 200);
      return () => clearTimeout(t);
    }

    let cancelled = false;
    let cached: string | null = null;
    try {
      cached = localStorage.getItem(NICK_CACHE_KEY);
    } catch {}
    if (cached) setNickname(cached);

    // 서버에서 최신 닉네임 받아오기 (캐시가 있으면 기다리지 않음)
    const loadNickname = async (): Promise<void> => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/user/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json().catch(() => null);
        const nick = typeof json?.nickname === "string" ? json.nickname.trim() : "";
        if (nick) {
          try {
            localStorage.setItem(NICK_CACHE_KEY, nick);
          } catch {}
          if (!cancelled && !cached) setNickname(nick);
        }
      } catch {}
    };

    const nickReady = cached
      ? Promise.resolve()
      : Promise.race([loadNickname(), new Promise<void>((r) => setTimeout(r, NICK_WAIT_MAX_MS))]);
    if (cached) loadNickname(); // 캐시 갱신만

    const minLogo = new Promise<void>((r) => setTimeout(r, PHASE1_MS));
    const timers: ReturnType<typeof setTimeout>[] = [];

    Promise.all([minLogo, nickReady]).then(() => {
      if (cancelled) return;
      setPhase("hello");
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setPhase("fade");
          timers.push(setTimeout(() => !cancelled && setPhase("done"), FADE_MS));
        }, PHASE2_MS)
      );
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  if (phase === "done") return null;

  const showHello = phase === "hello" || phase === "fade";

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: showHello ? SEA : MINT,
        transition: `background-color 700ms ease, opacity ${FADE_MS}ms ease`,
        opacity: phase === "fade" ? 0 : 1,
        pointerEvents: phase === "fade" ? "none" : "auto",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-192-v2.png"
        alt=""
        width={76}
        height={76}
        style={{
          width: 76,
          height: 76,
          borderRadius: 18,
          transform: showHello ? "translateY(-18px)" : "none",
          transition: "transform 700ms ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "calc(50% + 46px)",
          left: 0,
          right: 0,
          textAlign: "center",
          color: "#FFFFFF",
          fontFamily: "'Jua', sans-serif",
          opacity: showHello ? 1 : 0,
          transform: showHello ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 600ms ease 250ms, transform 600ms ease 250ms",
        }}
      >
        <div style={{ fontSize: 17, opacity: 0.85 }}>hello{nickname ? "," : ""}</div>
        {nickname && <div style={{ fontSize: 26, marginTop: 2 }}>{nickname}</div>}
      </div>
    </div>
  );
}
