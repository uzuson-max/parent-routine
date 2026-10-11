// components/DeepSea.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { OtterBody, type OtterExpression, type OtterHolding } from "@/components/Otter";
import { plop } from "@/lib/seaSound";

// ============================================================================
// 심해 — 지금 어항 바로 아래, 참견이(수달)가 사는 곳.
// ----------------------------------------------------------------------------
// 지난달 물고기를 다시 늘어놓는 곳이 아니다(그건 "지난 어항" 탭). 여기엔 참견이와 참견이의 집만 있다.
// 집은 성장 단계(lib/seaGrowth.ts — 기록한 날 + 다시 꺼낸 생각)로만 달라진다. 단계가 그대로면 그림도 그대로.
//   0 새로 이사 옴 — 모래, 조약돌 몇 개
//   1 다시마 싹
//   2 조약돌 더미 — 참견이가 배 위에 조약돌을 올려두고 논다
//   3 다시마 숲 — 참견이가 다시마를 몸에 감고 쉰다(떠내려가지 않게)
//   4 조개 정원 — 진주 품은 조개
//   5 보물 굴
//
// 참견이 상태
//   idle      배를 위로 하고 둥둥(밤엔 쿨쿨)
//   discover  내려온 걸 알아채고 일어나서 손 흔들기 — 잠깐
//   growth    실제로 단계가 올라갔고 아직 못 봤을 때만 — 뿌듯하게 보여주고, 본 걸로 기록(onSeen)
//   curious   누르면 갸우뚱하고 한마디(지금 어항의 실제 물고기 수 등 — 지어낸 기억은 말하지 않는다)
// 기억 회상은 여기서 하지 않는다 — 그건 홈 위쪽 말풍선/기억 캡슐이 기존 데이터로만 한다.
// ============================================================================

export interface SeaGrowth {
  stage: number;
  seen: number;
  fresh: boolean; // 서버에서 방금 받은 값인지(기기에 남아 있던 옛 값이면 "새 변화" 연출을 하지 않는다)
}

type Mode = "idle" | "discover" | "growth" | "curious";

const GROWTH_LINES: Record<number, string> = {
  1: "어, 다시마 싹 났다. 니가 말한 날들이 쌓여서 그래.",
  2: "조약돌 줍기 시작했어. 니가 다시 꺼낸 얘기들이야.",
  3: "다시마 숲 생겼어. 이제 안 떠내려가.",
  4: "조개 정원 생겼다. 니 얘기 진짜 많이 쌓였네.",
  5: "여기 이제 보물 굴이야. 전부 니 얘기로 만든 거.",
};

function holdingFor(stage: number): OtterHolding {
  if (stage >= 5) return "pearl";
  if (stage >= 4) return "shell";
  if (stage >= 2) return "pebble";
  return "none";
}

export default function DeepSea({
  night,
  topColor,
  growth,
  fishCount,
  busy,
  onSeen,
}: {
  night: boolean;
  topColor: string; // 위 바다의 맨 아래 색 — 이음새 없이 이어지게
  growth: SeaGrowth | null;
  fishCount: number;
  busy: boolean; // 대답 기다리는 중/카드 열림 — 이땐 연출 안 함
  onSeen: (stage: number) => void;
}) {
  const stage = growth?.stage ?? 0;
  const pending = !!growth && growth.fresh && growth.stage > growth.seen;
  const deep = night ? "#0F2E57" : "#14457A";
  const mid = night ? "#173F70" : "#1E5C98";

  const [mode, setMode] = useState<Mode>("idle");
  const [say, setSay] = useState<{ text: string; key: number } | null>(null);
  const [tapN, setTapN] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearAll, []);

  // 연출 중 최신 값을 읽으려고
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const speak = (text: string, ms: number) => {
    setSay({ text, key: Date.now() });
    later(() => setSay(null), ms);
  };

  const showGrowth = () => {
    const s = stageRef.current;
    clearAll();
    setMode("growth");
    speak(GROWTH_LINES[s] ?? "여기 좀 달라졌지?", 5200);
    later(() => onSeen(s), 1800); // 봤다고 기록 — 다음에 다시 열어도 같은 변화를 새것처럼 하지 않는다
    later(() => setMode("idle"), 5600);
  };

  // ---- 내려와서 참견이가 보이면 ----
  const ref = useRef<HTMLDivElement>(null);
  const inView = useRef(false);
  const lastMet = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (es) => {
        const e = es[0];
        const now = Date.now();
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          if (inView.current) return;
          inView.current = true;
          if (busyRef.current) return;
          if (pendingRef.current) {
            showGrowth();
          } else if (now - lastMet.current > 20000) {
            clearAll();
            setMode("discover");
            speak(night ? "…음? 이 시간에 왔어?" : "어, 왔어?", 2600);
            later(() => setMode("idle"), 2800);
          }
          lastMet.current = now;
        } else if (!e.isIntersecting || e.intersectionRatio < 0.2) {
          inView.current = false;
        }
      },
      { threshold: [0, 0.2, 0.5, 0.8] }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [night]);

  // 이미 심해를 보고 있는데 서버에서 새 단계가 도착하면(녹음 직후 등) 그 자리에서 보여준다
  useEffect(() => {
    if (pending && inView.current && !busy && mode === "idle") showGrowth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, busy]);

  const tap = () => {
    if (mode === "growth") return;
    plop();
    clearAll();
    const n = tapN + 1;
    setTapN(n);
    if (n % 4 === 0) {
      setMode("discover");
      speak("간지러워.", 1800);
      later(() => setMode("idle"), 2000);
      return;
    }
    const lines = [
      fishCount > 0 ? `위에 사는 물고기 ${fishCount}마리, 전부 니 생각이야.` : "위에 아직 물고기가 없네. 뭐라도 말해봐.",
      stage === 0 ? "여기 이사 온 지 얼마 안 됐어. 니가 말할수록 넓어져." : "여기 내 집. 니가 말할수록 넓어져.",
      stage >= 2 ? "이 조약돌? 니가 다시 꺼낸 얘기들이야." : "같은 얘기를 다른 날 또 하면, 그게 조약돌이 돼.",
    ];
    setMode("curious");
    speak(lines[(n - 1) % lines.length], 3400);
    later(() => setMode("idle"), 3600);
  };

  const upright = mode === "discover" || mode === "growth";
  const expr: OtterExpression =
    mode === "growth" ? "proud" : mode === "discover" ? (tapN % 4 === 0 && tapN > 0 ? "laugh" : "surprise") : mode === "curious" ? "tilt" : night ? "sleep" : "base";

  return (
    <section
      className="ds-root"
      style={{ background: `linear-gradient(${topColor} 0%, ${mid} 32%, ${deep} 100%)` }}
      aria-label="심해 — 참견이가 사는 곳"
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* 깊은 곳까지 내려오는 희미한 빛 */}
      <div className="ds-ray" style={{ left: "22%" }} />
      <div className="ds-ray" style={{ left: "64%", width: 40, animationDelay: "-2.4s" }} />

      {/* 떠다니는 작은 빛 알갱이 */}
      {MOTES.map((m, i) => (
        <span key={i} className="ds-mote" style={m} />
      ))}

      {/* 5 보물 굴 — 뒤쪽 바위 아치 */}
      {stage >= 5 && (
        <svg className="ds-deco" viewBox="0 0 320 220" style={{ left: "50%", bottom: 60, width: "min(300px, 86%)", transform: "translateX(-50%)", zIndex: 1 }} aria-hidden>
          <path className="ds-ol" d="M10 220 C10 120 60 40 160 40 C260 40 310 120 310 220 L250 220 C250 150 214 104 160 104 C106 104 70 150 70 220 Z" fill="#3B4F7A" />
          <path d="M40 200 C44 150 70 92 120 70" fill="none" stroke="#6176A8" strokeWidth={6} strokeLinecap="round" opacity={0.6} />
          {[
            [92, 120],
            [128, 92],
            [170, 86],
            [212, 98],
            [240, 128],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle className="ds-glow" cx={x} cy={y} r={11} fill="#FFF3B0" opacity={0.4} style={{ animationDelay: `${-i * 0.5}s` }} />
              <circle className="ds-ol2" cx={x} cy={y} r={5} fill="#FFFDF4" />
            </g>
          ))}
        </svg>
      )}

      {/* 3 다시마 숲 — 양옆 큰 다시마 */}
      {stage >= 3 && (
        <>
          <svg className="ds-deco" width="70" height="330" viewBox="0 0 60 300" style={{ left: -6, bottom: 60, zIndex: 2 }} aria-hidden>
            <path className="ds-ol ds-sway" d={KELP_TALL} fill="#2FAF6A" />
          </svg>
          <svg className="ds-deco" width="54" height="250" viewBox="0 0 60 300" style={{ left: 40, bottom: 56, zIndex: 2 }} aria-hidden>
            <path className="ds-ol ds-sway" d={KELP_TALL} fill="#46C985" style={{ animationDelay: "-1.6s" }} />
          </svg>
          <svg className="ds-deco" width="66" height="300" viewBox="0 0 60 300" style={{ right: -4, bottom: 60, zIndex: 2 }} aria-hidden>
            <path className="ds-ol ds-sway" d={KELP_TALL} fill="#2FAF6A" style={{ animationDelay: "-0.8s" }} />
          </svg>
          <svg className="ds-deco" width="50" height="220" viewBox="0 0 60 300" style={{ right: 44, bottom: 56, zIndex: 2 }} aria-hidden>
            <path className="ds-ol ds-sway" d={KELP_TALL} fill="#46C985" style={{ animationDelay: "-2.2s" }} />
          </svg>
        </>
      )}

      {/* 참견이 */}
      <div ref={ref} className="ds-otter-zone">
        {say && (
          <div key={say.key} className="ds-say" role="status">
            {say.text}
          </div>
        )}
        <button className={`ds-otter ${upright ? "ds-up" : "ds-float"} ${mode === "growth" ? "ds-proud" : ""}`} onClick={tap} aria-label="참견이">
          {upright ? (
            <OtterBody pose="upright" expression={expr} holding={holdingFor(stage)} kelp={stage >= 3} wave={mode === "discover"} width={124} />
          ) : (
            <OtterBody pose="float" expression={expr} holding={holdingFor(stage)} kelp={stage >= 3} width={200} />
          )}
        </button>
        {night && !upright && (
          <>
            <span className="ds-zz" style={{ left: "62%", animationDelay: "-1s" }}>z</span>
            <span className="ds-zz" style={{ left: "70%", fontSize: 20, animationDelay: "-2.6s" }}>z</span>
          </>
        )}
        {mode === "growth" && (
          <div className="ds-burst" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} style={{ transform: `rotate(${i * 60}deg) translateY(-92px)`, animationDelay: `${i * 0.06}s` }} />
            ))}
          </div>
        )}
      </div>

      {/* 바닥 */}
      <div className="ds-floor" aria-hidden>
        {/* 1 다시마 싹 */}
        {stage >= 1 && stage < 3 && (
          <>
            <svg className="ds-deco" width="30" height="90" viewBox="0 0 40 140" style={{ left: "18%", bottom: 64 }}>
              <path className="ds-ol ds-sway" d={WEED} fill="#46C985" />
            </svg>
            <svg className="ds-deco" width="22" height="62" viewBox="0 0 40 140" style={{ left: "26%", bottom: 60 }}>
              <path className="ds-ol ds-sway" d={WEED} fill="#2FAF6A" style={{ animationDelay: "-1.3s" }} />
            </svg>
          </>
        )}
        {/* 2 조약돌 더미 */}
        {stage >= 2 && (
          <svg className="ds-deco" width="96" height="56" viewBox="0 0 96 56" style={{ right: "16%", bottom: 58, zIndex: 3 }}>
            <ellipse className="ds-ol2" cx="22" cy="44" rx="16" ry="10" fill="#9CC9EC" />
            <ellipse className="ds-ol2" cx="52" cy="46" rx="18" ry="9" fill="#FF9EC4" />
            <ellipse className="ds-ol2" cx="78" cy="44" rx="14" ry="9" fill="#FFD54A" />
            <ellipse className="ds-ol2" cx="38" cy="30" rx="14" ry="9" fill="#B9A7F2" />
            <ellipse className="ds-ol2" cx="64" cy="30" rx="13" ry="8" fill="#8BE0C0" />
            <ellipse className="ds-ol2" cx="51" cy="16" rx="11" ry="7.5" fill="#FFFFFF" />
          </svg>
        )}
        {/* 4 조개 정원 */}
        {stage >= 4 && (
          <>
            <svg className="ds-deco" width="70" height="50" viewBox="0 0 70 50" style={{ left: "12%", bottom: 54, zIndex: 3 }}>
              <path className="ds-ol" d="M6 40 Q4 18 22 14 L48 14 Q66 18 64 40 Z" fill="#FFC2D6" />
              <path className="ds-ol" d="M8 20 Q10 2 35 2 Q60 2 62 20 Q48 12 35 12 Q22 12 8 20 Z" fill="#FFB0C8" transform="rotate(-14 35 14)" />
              <circle className="ds-glow" cx="35" cy="30" r="13" fill="#FFF3B0" opacity={0.5} />
              <circle className="ds-ol2" cx="35" cy="30" r="7" fill="#FFFDF4" />
            </svg>
            <svg className="ds-deco" width="34" height="28" viewBox="0 0 34 28" style={{ left: "38%", bottom: 50, zIndex: 3 }}>
              <path className="ds-ol2" d="M3 24 Q2 6 17 4 Q32 6 31 24 Z" fill="#FFE1A8" />
              <path className="ds-ol2" d="M10 23 L13 8 M17 23 L17 6 M24 23 L21 8" fill="none" />
            </svg>
            <svg className="ds-deco" width="28" height="24" viewBox="0 0 34 28" style={{ right: "6%", bottom: 50, zIndex: 3 }}>
              <path className="ds-ol2" d="M3 24 Q2 6 17 4 Q32 6 31 24 Z" fill="#C9B6FF" />
              <path className="ds-ol2" d="M10 23 L13 8 M17 23 L17 6 M24 23 L21 8" fill="none" />
            </svg>
          </>
        )}
        <svg className="ds-sand" viewBox="0 0 332 84" preserveAspectRatio="none">
          <path className="ds-ol" d="M-4 40 C40 30 80 44 120 36 C160 26 200 42 240 34 C280 26 310 38 336 32 V90 H-4 Z" fill={night ? "#C9AE70" : "#E8C77A"} />
          {SAND_PEBBLES.map(([cx, cy, rx, ry, c], i) => (
            <ellipse key={i} className="ds-ol2" cx={cx} cy={cy} rx={rx} ry={ry} fill={c} />
          ))}
        </svg>
      </div>
    </section>
  );
}

const WEED = "M20 140 C8 110 30 95 18 70 C8 48 28 35 20 6 C34 30 22 50 30 72 C40 98 24 112 28 140 Z";
const KELP_TALL =
  "M28 300 C14 260 40 236 24 200 C10 168 38 146 26 112 C16 84 40 62 30 30 C28 18 32 8 36 2 C44 24 38 44 42 70 C48 100 30 122 40 152 C50 184 30 206 42 238 C52 266 36 282 40 300 Z";

const SAND_PEBBLES: [number, number, number, number, string][] = [
  [40, 56, 11, 7, "#9CC9EC"],
  [96, 66, 8, 5.5, "#FF9EC4"],
  [176, 58, 10, 6.5, "#FFFFFF"],
  [250, 66, 9, 6, "#B9A7F2"],
  [302, 56, 11, 7, "#8BE0C0"],
];

const MOTES: React.CSSProperties[] = [
  { left: "12%", top: "18%", animationDelay: "0s" },
  { left: "78%", top: "12%", animationDelay: "-3s" },
  { left: "36%", top: "8%", animationDelay: "-6s" },
  { left: "88%", top: "44%", animationDelay: "-1.5s" },
  { left: "6%", top: "52%", animationDelay: "-4.5s" },
  { left: "54%", top: "64%", animationDelay: "-7s" },
];

const CSS = `
.ds-root{position:relative;height:max(94dvh,640px);overflow:hidden}
.ds-ray{position:absolute;top:-10px;width:30px;height:70%;background:linear-gradient(rgba(255,255,255,.12),rgba(255,255,255,0));transform:rotate(14deg);transform-origin:top;animation:ds-shimmer 6s ease-in-out infinite alternate;pointer-events:none}
@keyframes ds-shimmer{from{opacity:.4}to{opacity:1}}
.ds-mote{position:absolute;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.55);animation:ds-mote 9s ease-in-out infinite;pointer-events:none}
@keyframes ds-mote{0%,100%{transform:translate(0,0);opacity:.15}50%{transform:translate(10px,-26px);opacity:.8}}
.ds-ol{stroke:#1B1630;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.ds-ol2{stroke:#1B1630;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.ds-deco{position:absolute;overflow:visible;pointer-events:none}
.ds-sway{transform-box:fill-box;transform-origin:50% 100%;animation:ds-sway 4.4s ease-in-out infinite alternate}
@keyframes ds-sway{from{transform:rotate(-5deg)}to{transform:rotate(5deg)}}
.ds-glow{transform-box:fill-box;transform-origin:50% 50%;animation:ds-glow 2.6s ease-in-out infinite}
@keyframes ds-glow{0%,100%{opacity:.25;transform:scale(.85)}50%{opacity:.6;transform:scale(1.15)}}
.ds-otter-zone{position:absolute;left:0;right:0;top:20%;height:240px;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:flex-end}
.ds-otter{display:block;padding:0;margin:0;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ds-otter svg{display:block}
.ds-otter:focus-visible{outline:3px dashed #fff;outline-offset:4px;border-radius:24px}
.ds-float{animation:ds-float 3.4s ease-in-out infinite alternate}
@keyframes ds-float{from{transform:translateY(-6px) rotate(-3deg)}to{transform:translateY(6px) rotate(2deg)}}
.ds-up{animation:ds-pop .5s cubic-bezier(.3,1.6,.5,1) both}
@keyframes ds-pop{from{transform:translateY(30px) scale(.8);opacity:.4}to{transform:none;opacity:1}}
.ds-proud{animation:ds-pop .5s cubic-bezier(.3,1.6,.5,1) both,ds-spin 1.1s cubic-bezier(.4,1.4,.5,1) .5s both}
@keyframes ds-spin{0%{transform:rotate(0)}60%{transform:rotate(370deg) translateY(-14px)}100%{transform:rotate(360deg)}}
.ds-otter .otr-wave{animation:ds-wave .5s ease-in-out 4 alternate}
@keyframes ds-wave{from{transform:rotate(-16deg)}to{transform:rotate(18deg)}}
.ds-otter .otr-tail{transform-box:fill-box;transform-origin:100% 50%;animation:ds-tail 1.8s ease-in-out infinite alternate}
@keyframes ds-tail{from{transform:rotate(-5deg)}to{transform:rotate(6deg)}}
.ds-say{max-width:min(300px,82%);margin-bottom:10px;padding:9px 16px;background:#fff;border:3px solid #1B1630;border-radius:22px;box-shadow:3px 3px 0 #1B1630;font-size:16px;line-height:1.35;text-align:center;word-break:keep-all;animation:ds-say .35s cubic-bezier(.3,1.5,.5,1) both}
@keyframes ds-say{from{transform:scale(.6);opacity:0}to{transform:none;opacity:1}}
.ds-zz{position:absolute;bottom:90px;font-family:'Jua',sans-serif;font-size:16px;color:#fff;-webkit-text-stroke:1.5px #1B1630;pointer-events:none;animation:ds-zz 3.8s ease-in-out infinite}
@keyframes ds-zz{0%{transform:translate(0,10px) scale(.6);opacity:0}25%{opacity:1}100%{transform:translate(14px,-40px) scale(1.2);opacity:0}}
.ds-burst{position:absolute;left:50%;bottom:90px;width:0;height:0;pointer-events:none}
.ds-burst span{position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;background:#FFE066;border:2px solid #1B1630;opacity:0;animation:ds-burst 1.4s ease-out .6s both}
@keyframes ds-burst{0%{opacity:0;scale:.3}30%{opacity:1;scale:1.1}100%{opacity:0;scale:.6}}
.ds-floor{position:absolute;left:0;right:0;bottom:0;height:200px;pointer-events:none}
.ds-sand{position:absolute;left:-6px;right:-6px;bottom:0;width:calc(100% + 12px);height:90px;display:block}
@media (prefers-reduced-motion: reduce){
  .ds-ray,.ds-mote,.ds-sway,.ds-glow,.ds-float,.ds-up,.ds-proud,.ds-zz,.ds-burst span,.ds-otter .otr-wave,.ds-otter .otr-tail{animation:none}
  .ds-burst{display:none}
}
`;
