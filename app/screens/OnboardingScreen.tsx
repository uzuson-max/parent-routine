// app/screens/OnboardingScreen.tsx
// ============================================================================
// 첫 실행 소개 — 숨비식: 장마다 그림 하나 + 큰 문장 하나 + 작은 문장 하나, 아래 "다음".
// 어항 세계(노란 도트 벽, 굵은 외곽선) 안에서 그대로 보여준다. 설명서가 아니라
// "생각 → 물고기 → 참견이가 다시 꺼냄" 한 줄 흐름을 그림으로 먼저 보여주는 게 목적.
// 좌우로 쓸어도 넘어가고, 마지막 장의 버튼이 번호 인증 시트(OnboardingChecklistScreen)로 이어진다.
// ============================================================================
"use client";

import { useRef, useState } from "react";
import PeekMascot from "@/components/PeekMascot";
import { goldfishSvg } from "@/components/FishTank";
import { worldPage, INK, YELLOW, WORLD_CSS } from "@/components/WorldNav";

interface OnboardingScreenProps {
  onComplete: () => void;
}

const SLIDES: { art: "talk" | "tank" | "peek"; title: string; sub: string }[] = [
  {
    art: "talk",
    title: "생각나면 그냥 말하면 돼",
    sub: "정리 안 해도 괜찮아. 10초든 1분이든.",
  },
  {
    art: "tank",
    title: "생각은 어항 속 물고기가 돼",
    sub: "자주 하는 생각은 커지고, 잊은 생각은 수초 뒤에 숨어.",
  },
  {
    art: "peek",
    title: "가끔 참견이가 고개를 내밀어",
    sub: "니가 했던 말을 기억했다가 딱 그때 꺼내. 앱에서, 가끔은 문자로.",
  },
];

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const startX = useRef<number | null>(null);
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  const go = (next: number) => {
    if (next < 0) return;
    if (next >= SLIDES.length) {
      onComplete();
      return;
    }
    setDir(next > index ? 1 : -1);
    setIndex(next);
  };

  return (
    <div
      style={{ ...worldPage, paddingBottom: "max(28px, calc(env(safe-area-inset-bottom, 0px) + 20px))", display: "flex", flexDirection: "column", minHeight: "100dvh" }}
      onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (startX.current === null) return;
        const dx = e.changedTouches[0].clientX - startX.current;
        startX.current = null;
        if (dx < -60) go(index + 1);
        else if (dx > 60) go(index - 1);
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: WORLD_CSS + CSS }} />

      <div key={index} className={dir === 1 ? "ob-in-next" : "ob-in-prev"} style={s.stage}>
        <div className="ob-art" style={s.art} aria-hidden>
          {slide.art === "talk" && <TalkArt />}
          {slide.art === "tank" && <TankArt />}
          {slide.art === "peek" && <PeekArt />}
        </div>
        <h1 style={s.title}>{slide.title}</h1>
        <p style={s.sub}>{slide.sub}</p>
      </div>

      <div style={s.dots} aria-label={`${SLIDES.length}장 중 ${index + 1}번째`}>
        {SLIDES.map((_, i) => (
          <span key={i} style={{ ...s.dot, ...(i === index ? s.dotOn : null) }} />
        ))}
      </div>

      <button className="wn-sticker" style={s.next} onClick={() => go(index + 1)}>
        {isLast ? "내 어항 만들기" : "다음"}
      </button>
    </div>
  );
}

// ---- 그림: 전부 앱 안에 실제로 있는 것(마이크, 금붕어, 참견이 얼굴)으로만 그린다 ----

function TalkArt() {
  return (
    <div style={{ position: "relative", width: 220, height: 220 }}>
      <div style={{ ...s.micCircle }}>
        <svg width="70" height="70" viewBox="0 0 24 24" aria-hidden>
          <rect x="8.5" y="3" width="7" height="12" rx="3.5" fill="#FFFFFF" stroke={INK} strokeWidth={2} />
          <path d="M5.5 11.5 C5.5 15.5 8.5 18 12 18 C15.5 18 18.5 15.5 18.5 11.5" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
          <path d="M12 18 V21.5" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>
      {/* 말이 치어가 되어 퐁 하고 나온다 */}
      <div className="ob-fry" style={{ position: "absolute", right: 6, top: 18, width: 54 }}>
        {goldfishSvg("#FF8C2E", "#FFC75A", false, false)}
      </div>
      <span className="ob-bub" style={{ ...s.bub, left: 30, top: 34, width: 16, height: 16 }} />
      <span className="ob-bub" style={{ ...s.bub, left: 52, top: 6, width: 10, height: 10, animationDelay: "-.8s" }} />
    </div>
  );
}

function TankArt() {
  return (
    <div style={s.tank}>
      <div style={s.water}>
        <div className="ob-swim" style={{ position: "absolute", left: "10%", top: "18%", width: 92 }}>
          {goldfishSvg("#5AA9FF", "#D3E8FF", false, true)}
        </div>
        <div className="ob-swim" style={{ position: "absolute", left: "58%", top: "42%", width: 58, animationDelay: "-1.4s" }}>
          {goldfishSvg("#FFC93C", "#FFF0A8", false, false)}
        </div>
        <div className="ob-swim" style={{ position: "absolute", left: "30%", top: "62%", width: 30, animationDelay: "-.6s" }}>
          {goldfishSvg("#FF8FB3", "#FFD9E6", false, false)}
        </div>
        {/* 수초 뒤에 숨은 물고기 */}
        <div style={{ position: "absolute", right: "4%", bottom: 30, width: 44, opacity: 0.85 }}>
          {goldfishSvg("#3FCF9A", "#C8F5E1", false, false)}
        </div>
        <svg style={{ position: "absolute", right: "6%", bottom: 22, width: 40, height: 96 }} viewBox="0 0 40 140" aria-hidden>
          <path className="ft-ol" d="M20 140 C8 110 30 95 18 70 C8 48 28 35 20 6 C34 30 22 50 30 72 C40 98 24 112 28 140 Z" fill="#2FAF6A" />
        </svg>
        <div style={s.sand} />
      </div>
    </div>
  );
}

function PeekArt() {
  return (
    <div style={{ ...s.tank, overflow: "visible" }}>
      <div style={{ ...s.water, overflow: "hidden" }}>
        <div className="ob-swim" style={{ position: "absolute", left: "16%", top: "40%", width: 80 }}>
          {goldfishSvg("#3FCF9A", "#C8F5E1", false, true)}
        </div>
        <div style={s.sand} />
      </div>
      <div style={s.peekSay}>어? 고사리 얘기 오랜만이네.</div>
      <div style={{ position: "absolute", right: -26, top: 36, transform: "rotate(-10deg)" }}>
        <PeekMascot expression="surprise" size={96} />
      </div>
    </div>
  );
}

const CSS = `
.ob-art .ft-ol { stroke: ${INK}; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
.ob-art .ft-ol2 { stroke: ${INK}; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.ob-art svg { display: block; width: 100%; height: auto; overflow: visible; }
.ob-in-next { animation: obInNext .38s cubic-bezier(.2,.9,.3,1); }
.ob-in-prev { animation: obInPrev .38s cubic-bezier(.2,.9,.3,1); }
@keyframes obInNext { from { opacity: 0; translate: 40px 0; } to { opacity: 1; translate: 0 0; } }
@keyframes obInPrev { from { opacity: 0; translate: -40px 0; } to { opacity: 1; translate: 0 0; } }
.ob-swim { animation: obSwim 2.4s ease-in-out infinite alternate; }
@keyframes obSwim { from { translate: -6px -3px; } to { translate: 6px 3px; } }
.ob-fry { animation: obPop 2.6s ease-in-out infinite; }
@keyframes obPop { 0% { translate: -40px 50px; scale: .4; opacity: 0; } 30% { opacity: 1; } 60%, 100% { translate: 0 0; scale: 1; opacity: 1; } }
.ob-bub { animation: obRise 2.2s ease-in-out infinite; }
@keyframes obRise { from { translate: 0 10px; opacity: .2; } to { translate: 0 -10px; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .ob-in-next, .ob-in-prev, .ob-swim, .ob-fry, .ob-bub { animation: none; } }
`;

const s: { [k: string]: React.CSSProperties } = {
  stage: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14 },
  art: { minHeight: 240, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  title: { margin: 0, fontSize: 26, fontWeight: 400, letterSpacing: "-0.5px", wordBreak: "keep-all", textShadow: "3px 3px 0 #FFFFFF" },
  sub: { margin: 0, maxWidth: 300, fontSize: 16, lineHeight: 1.5, color: "rgba(27,22,48,.65)", wordBreak: "keep-all" },
  dots: { display: "flex", justifyContent: "center", gap: 8, margin: "20px 0 18px" },
  dot: { width: 9, height: 9, borderRadius: 999, background: "rgba(27,22,48,.2)", transition: "width .25s" },
  dotOn: { width: 28, background: INK },
  next: {
    width: "100%",
    minHeight: 56,
    borderRadius: 999,
    border: `3px solid ${INK}`,
    background: YELLOW,
    boxShadow: `4px 4px 0 ${INK}`,
    fontSize: 19,
    color: INK,
    cursor: "pointer",
  },
  micCircle: {
    position: "absolute",
    left: 30,
    bottom: 10,
    width: 150,
    height: 150,
    borderRadius: "50%",
    border: `4px solid ${INK}`,
    background: YELLOW,
    boxShadow: `6px 6px 0 ${INK}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  bub: { position: "absolute", borderRadius: "50%", border: `2.5px solid ${INK}`, background: "#FFFFFF" },
  tank: {
    position: "relative",
    width: 280,
    height: 220,
    border: `4px solid ${INK}`,
    borderRadius: 30,
    boxShadow: "6px 6px 0 rgba(27,22,48,.22)",
    background: "#EAF9FF",
    padding: "16px 0 0",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  water: { position: "relative", width: "100%", height: "100%", background: "#45BFEC", borderTop: "3px solid #FFFFFF", borderRadius: "0 0 26px 26px" },
  sand: { position: "absolute", left: 0, right: 0, bottom: 0, height: 30, background: "#F6D589", borderTop: `3px solid ${INK}` },
  peekSay: {
    position: "absolute",
    right: 40,
    top: -26,
    padding: "7px 12px",
    background: "#FFFFFF",
    border: `3px solid ${INK}`,
    borderRadius: 18,
    boxShadow: `3px 3px 0 ${INK}`,
    fontSize: 14,
    whiteSpace: "nowrap",
    zIndex: 2,
  },
};
