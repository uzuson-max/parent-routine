// components/SoraTalk.tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OTTER, otterFaceG, type OtterExpression } from "@/components/Otter";
import { useTankRecorder, type TankRecordResult } from "@/lib/useTankRecorder";
import { playFx } from "@/lib/fx";
import type { HomeBubble } from "@/app/screens/TimelineScreen";

// ============================================================================
// 소라님 — 홈 바다의 말하는 입구. (2026-10-19, 물속 녹음 화면 TankRecordingScreen을 대신한다)
// ----------------------------------------------------------------------------
// 홈 바다에 소라님이 둥둥 떠다닌다(FloatingConch). 소라를 누르거나 노란 버튼(소라 모양)을 누르면:
//   1. 참견이가 화면 앞으로 쑥 올라와 팔을 쭉 늘려 소라를 내민다(그날 처음만 길게, 그다음부턴 짧게)
//   2. 소라 입구에 대고 말한다(녹음). 말 못 하는 상황이면 "글로" — 써도 똑같이 들어간다
//   3. 다 말했으면 줄을 당긴다 = 보내기. 조용해지고 두둥
//      → 평소 녹음이랑 똑같이 /api/voice/upload로 간다(page.tsx uploadFromHome).
//        받아쓰기·기억 저장·물고기·응답 엔진 전부 그대로. 바뀐 건 입구뿐이다.
//   4. 참견이가 소라를 니 귀에 대준다. 쏴아— 바닷소리 속에서 소라님 말씀이 한 글자씩
//      (엔진이 과거 기억을 썼으면 그때 니가 한 말도 작게 같이)
//   5. 닫으면 소라님은 다시 바다로. 방금 한 말은 물고기가 돼서 바다에 남는다.
// 목소리 회상(그때 니 목소리)은 아직 안 넣는다 — 엔진이 진짜 맞는 기억을 찾았을 때만 나중에 붙인다.
// ============================================================================

const INK = "#1B1630";
const INTRO_KEY = "chamgyeoni_sora_intro_day";

type Mode = "intro" | "rec" | "type" | "sent" | "result";

// ── 소라님 그림 — 동글동글한 핑크·라벤더 소라. 마법 같은 그라데이션 + 혹 + 소용돌이 + 반짝임 ──────
// viewBox 0 0 200 170 · 입구는 왼쪽 아래(55,138)
export function ConchArt({ width, glow = false }: { width: number; glow?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="0 0 200 170" width={width} height={(width * 170) / 200} style={{ overflow: "visible", display: "block" }} aria-hidden>
      <defs>
        <linearGradient id={`cb${id}`} x1="0.1" y1="0.05" x2="0.85" y2="1">
          <stop offset="0" stopColor={glow ? "#FFF1F8" : "#FFE3F1"} />
          <stop offset="0.45" stopColor={glow ? "#FFC6E2" : "#F7B6DA"} />
          <stop offset="1" stopColor={glow ? "#D7A8F5" : "#B79AEB"} />
        </linearGradient>
        <radialGradient id={`cm${id}`} cx="0.45" cy="0.4" r="0.7">
          <stop offset="0" stopColor={glow ? "#FFFBD6" : "#FFF3FA"} />
          <stop offset="0.55" stopColor={glow ? "#FFE07A" : "#F5B8DA"} />
          <stop offset="1" stopColor={glow ? "#F2A93B" : "#9C6FD8"} />
        </radialGradient>
      </defs>
      {/* 몸통 */}
      <path d="M30 148 C 10 112, 28 64, 78 42 C 108 29, 138 20, 170 8 C 166 30, 176 46, 183 64 C 192 102, 162 150, 102 160 C 70 165, 44 161, 30 148 Z" fill={`url(#cb${id})`} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
      {/* 등의 동글 혹 */}
      {[
        [104, 32, 9],
        [132, 22, 8],
        [156, 14, 7],
        [176, 40, 6],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={glow ? "#FFE8F4" : "#FFD9EC"} stroke={INK} strokeWidth={4.5} />
      ))}
      {/* 아래쪽 그림자 */}
      <path d="M182 70 C 188 108, 158 148, 104 156 C 76 160, 52 157, 38 148 C 80 150, 140 132, 170 90 Z" fill="#7B5BC7" opacity={0.22} />
      {/* 소용돌이 */}
      <path d="M70 132 C 70 96, 112 70, 160 58" fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" opacity={0.85} />
      <path d="M96 146 C 108 116, 140 96, 176 88" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" opacity={0.6} />
      {/* 하이라이트 */}
      <path d="M44 108 C 54 80, 76 62, 104 50" fill="none" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" opacity={0.75} />
      <circle cx="118" cy="44" r="4" fill="#FFFFFF" opacity={0.85} />
      {/* 입구 */}
      <ellipse cx="55" cy="138" rx="31" ry="21" transform="rotate(-25 55 138)" fill={`url(#cm${id})`} stroke={INK} strokeWidth={6} />
      <ellipse cx="60" cy="136" rx="15" ry="8" transform="rotate(-25 60 136)" fill={glow ? "#E6902C" : "#7E52C4"} opacity={0.7} />
      <ellipse cx="44" cy="141" rx="6" ry="3" transform="rotate(-25 44 141)" fill="#FFFFFF" opacity={0.8} />
      {/* 반짝 */}
      <path d="M150 112 l 3 -9 l 3 9 l 9 3 l -9 3 l -3 9 l -3 -9 l -9 -3 Z" fill="#FFFFFF" opacity={0.85} />
    </svg>
  );
}

// ── 참견이 — 얼굴은 앱 원래 참견이 얼굴(components/Otter.tsx otterFaceG) 그대로. 거기에 어깨·몸통만 붙였다 ──
// 좌표: 무대(300x330) 기준. 머리 가운데 (100,250). 오른쪽 어깨에서 팔이 나간다(팔은 따로 그림).
const HEAD_S = 1.75; // 원래 얼굴(100x100)을 키우는 배율
function OtterBuddy({ expression, question = false, giggle = false }: { expression: OtterExpression; question?: boolean; giggle?: boolean }) {
  return (
    <svg className="st-buddy" width="300" height="380" viewBox="0 0 300 380" aria-hidden>
      <defs>
        <linearGradient id="st-bud-fur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={OTTER.FUR} />
          <stop offset="1" stopColor={OTTER.FUR_DARK} />
        </linearGradient>
        <linearGradient id="st-bud-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.72" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.97" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="st-bud-mask">
          <rect x="0" y="0" width="300" height="380" fill="url(#st-bud-fade)" />
        </mask>
      </defs>
      <g mask="url(#st-bud-mask)">
        {/* 어깨·몸통 — 머리 아래로 둥글게 이어진다 */}
        <path
          d="M36 286 C 22 306, 6 340, 2 384 L 198 384 C 194 340, 178 306, 164 286 C 140 300, 60 300, 36 286 Z"
          fill="url(#st-bud-fur)"
          stroke={INK}
          strokeWidth={5}
          strokeLinejoin="round"
        />
        <path d="M60 384 C 58 340, 74 312, 100 308 C 126 312, 142 340, 140 384 Z" fill={OTTER.FACE} />
      </g>
      {/* 머리 — 원래 참견이 얼굴 */}
      <g className={giggle ? "st-giggle" : undefined}>
        <g transform={`translate(${100 - 50 * HEAD_S} ${250 - 58 * HEAD_S}) scale(${HEAD_S})`}>{otterFaceG(expression, { props: false })}</g>
      </g>
      {question && (
        <text x="14" y="200" fontSize="34" fontWeight="bold" fill="#FF5A5A" stroke={INK} strokeWidth={1.5} className="st-q">
          ?
        </text>
      )}
    </svg>
  );
}

// ── 물속 배경 — 겹겹이: 빛줄기 / 먼 다시마 / 중간 바위 / 바다눈 / 가까운 바위·다시마 / 비네트 ──
const SNOW = Array.from({ length: 16 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  top: `${(i * 53) % 100}%`,
  size: 2 + (i % 3),
  dur: 9 + (i % 5) * 2,
  delay: -((i * 1.7) % 10),
}));

function Backdrop({ dark }: { dark: boolean }) {
  return (
    <div className="st-bg" aria-hidden>
      <div className="st-rays">
        <span style={{ left: "18%", width: 70, animationDelay: "0s" }} />
        <span style={{ left: "46%", width: 120, animationDelay: "-2.5s" }} />
        <span style={{ left: "72%", width: 54, animationDelay: "-4.2s" }} />
      </div>
      {/* 먼 다시마·바위 — 흐리고 어둡게 */}
      <svg className="st-layer st-far" viewBox="0 0 400 360" preserveAspectRatio="xMidYMax slice">
        <path d="M30 360 C 10 300, 50 260, 26 200 C 8 150, 44 120, 30 70 C 52 120, 40 150, 54 200 C 68 250, 40 300, 52 360 Z" fill="#163E6B" />
        <path d="M352 360 C 336 310, 372 270, 352 210 C 338 170, 362 130, 356 96 C 378 136, 366 176, 378 214 C 392 262, 366 306, 376 360 Z" fill="#163E6B" />
        <path d="M0 360 L 0 300 C 60 270, 120 290, 170 276 C 230 260, 300 286, 400 268 L 400 360 Z" fill="#12355E" />
      </svg>
      {/* 중간 바위 */}
      <svg className="st-layer st-mid" viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice">
        <path d="M-10 240 L -10 170 C 30 140, 70 150, 100 172 C 130 150, 170 160, 190 190 L 200 240 Z" fill="#0F2C52" />
        <path d="M230 240 C 240 200, 280 176, 320 186 C 350 168, 390 172, 410 196 L 410 240 Z" fill="#0F2C52" />
        <path d="M30 168 C 50 154, 74 156, 92 168" fill="none" stroke="#2B5888" strokeWidth={4} strokeLinecap="round" opacity={0.6} />
        <path d="M270 190 C 290 180, 312 182, 330 192" fill="none" stroke="#2B5888" strokeWidth={4} strokeLinecap="round" opacity={0.6} />
      </svg>
      {SNOW.map((f, i) => (
        <span key={i} className="st-snow" style={{ left: f.left, top: f.top, width: f.size, height: f.size, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }} />
      ))}
      {/* 가까운 바위(왼쪽 아래) · 다시마(오른쪽 아래) — 선 있고 진하게 */}
      <svg className="st-near st-near-l" viewBox="0 0 170 120">
        <path d="M-6 124 L -6 56 C 20 30, 56 26, 80 44 C 104 30, 140 40, 156 70 C 166 88, 168 108, 172 124 Z" fill="#1F4677" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
        <path d="M14 54 C 32 40, 54 38, 72 50" fill="none" stroke="#3E73AD" strokeWidth={6} strokeLinecap="round" />
        <path d="M96 52 C 114 46, 134 54, 146 70" fill="none" stroke="#3E73AD" strokeWidth={5} strokeLinecap="round" />
        <path d="M30 96 C 60 86, 110 88, 150 104 L 170 124 L -6 124 Z" fill="#132F55" opacity={0.6} />
      </svg>
      <svg className="st-near st-near-r" viewBox="0 0 110 220">
        <path className="st-kelp" d="M60 224 C 40 180, 76 150, 54 106 C 38 74, 66 46, 58 8 C 82 44, 70 76, 82 108 C 96 148, 70 182, 82 224 Z" fill="#2C8F6D" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
        <path className="st-kelp st-kelp2" d="M86 224 C 74 196, 100 176, 88 146 C 80 126, 96 108, 94 86 C 110 112, 102 132, 108 152 C 116 182, 98 200, 104 224 Z" fill="#237559" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
        <path d="M62 150 C 58 120, 70 90, 64 50" fill="none" stroke="#5BC79B" strokeWidth={4} strokeLinecap="round" opacity={0.55} />
      </svg>
      <div className="st-vignette" />
      <div className="st-dim" style={{ opacity: dark ? 1 : 0 }} />
    </div>
  );
}

// 노란 버튼 안에 들어가는 작은 소라
export function ConchIcon({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="20 0 200 180" width={size} height={(size * 180) / 200} aria-hidden>
      <path d="M36 168 C 18 110, 70 52, 136 36 L 206 10 L 182 76 C 174 132, 118 182, 36 168 Z" fill="#F7B8CF" stroke={INK} strokeWidth={13} strokeLinejoin="round" />
      <path d="M62 150 C 74 112, 110 76, 168 54" fill="none" stroke={INK} strokeWidth={10} strokeLinecap="round" />
      <ellipse cx="66" cy="148" rx="30" ry="18" transform="rotate(-32 66 148)" fill="#FFE7F0" stroke={INK} strokeWidth={11} />
    </svg>
  );
}

// ── 홈 바다에 둥둥 떠다니는 소라님 ────────────────────────────────
// 첫 화면(한 화면 높이) 안에서만, 아주 천천히. 벽에 닿으면 그 방향만 뒤집는다.
const FLOAT_W = 60;
const FLOAT_H = (FLOAT_W * 180) / 200;
const FLOAT_TOP = 150; // 로고·말풍선 첫 줄 아래
const FLOAT_BOTTOM = 210; // 노란 버튼·탭바 위
const DRIFT = 13; // px/초

export function FloatingConch({ onTap, night = false }: { onTap: () => void; night?: boolean }) {
  const layer = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pos = useRef({ x: -1, y: -1 });
  const vel = useRef((() => {
    const a = Math.random() * Math.PI * 2;
    return { x: Math.cos(a) * DRIFT, y: Math.sin(a) * DRIFT * 0.7 };
  })());

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const L = layer.current;
      const B = btn.current;
      if (L && B) {
        const x0 = FLOAT_W / 2 + 8;
        const x1 = Math.max(x0 + 1, L.clientWidth - FLOAT_W / 2 - 8);
        const y0 = FLOAT_TOP;
        const y1 = Math.max(y0 + 40, L.clientHeight - FLOAT_BOTTOM);
        if (pos.current.x < 0) pos.current = { x: x0 + Math.random() * (x1 - x0), y: y0 + Math.random() * (y1 - y0) };
        let { x, y } = pos.current;
        x += vel.current.x * dt;
        y += vel.current.y * dt;
        if (x < x0 || x > x1) {
          vel.current.x *= -1;
          x = Math.min(x1, Math.max(x0, x));
        }
        if (y < y0 || y > y1) {
          vel.current.y *= -1;
          y = Math.min(y1, Math.max(y0, y));
        }
        pos.current = { x, y };
        B.style.transform = `translate(${x - FLOAT_W / 2}px, ${y - FLOAT_H / 2}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={layer} className="st-float-layer" aria-hidden={false}>
      <style dangerouslySetInnerHTML={{ __html: FLOAT_CSS }} />
      <button ref={btn} className="st-float" onClick={onTap} aria-label="소라님한테 말하기">
        <span className="st-float-glow" style={{ opacity: night ? 0.95 : 0.7 }} />
        <span className="st-float-body">
          <ConchArt width={FLOAT_W} />
        </span>
      </button>
    </div>
  );
}

const FLOAT_CSS = `
.st-float-layer{position:absolute;left:0;right:0;top:0;height:100dvh;z-index:18;pointer-events:none;overflow:hidden}
.st-float{position:absolute;left:0;top:0;width:${FLOAT_W}px;height:${FLOAT_H}px;padding:0;margin:0;border:0;background:none;cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent;will-change:transform}
.st-float::before{content:"";position:absolute;inset:-16px}
.st-float-glow{position:absolute;left:50%;top:50%;width:104px;height:104px;margin:-52px 0 0 -52px;border-radius:50%;background:radial-gradient(circle,rgba(255,243,176,.6),rgba(255,243,176,0) 70%);animation:st-breathe 3.6s ease-in-out infinite;pointer-events:none}
.st-float-body{position:relative;display:block;animation:st-wobble 5s ease-in-out infinite alternate}
.st-float:active .st-float-body{transform:scale(.9)}
@keyframes st-breathe{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes st-wobble{from{transform:rotate(-10deg)}to{transform:rotate(8deg) translateY(-4px)}}
@media (prefers-reduced-motion: reduce){.st-float-glow,.st-float-body{animation:none}}
`;

// ── 소리 — 두둥(보내기) / 쏴아(귀에 대기). 줄 당기는 터치 안에서 깨운 AudioContext를 같이 쓴다 ──
function useSoraSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const ctx = (): AudioContext | null => {
    if (!ctxRef.current) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    return ctxRef.current;
  };
  useEffect(() => () => {
    ctxRef.current?.close().catch(() => {});
  }, []);

  const dudung = () => {
    const c = ctx();
    if (!c) return;
    try {
      c.resume();
      [0, 0.42].forEach((at, i) => {
        const t = c.currentTime + at;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(i === 0 ? 96 : 72, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + 0.62);
      });
    } catch {
      /* 소리는 없어도 된다 */
    }
  };

  // 소라에 귀 대면 들리는 쏴아— (걸러낸 잡음, 천천히 커졌다 작아진다)
  const whoosh = (sec = 2.4) => {
    const c = ctx();
    if (!c) return;
    try {
      c.resume();
      const len = Math.floor(c.sampleRate * sec);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; // 갈색 잡음 비슷하게
        d[i] = last * 6;
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 700;
      const g = c.createGain();
      const t = c.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + sec * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
      src.connect(lp).connect(g).connect(c.destination);
      src.start(t);
      src.stop(t + sec);
    } catch {
      /* 무시 */
    }
  };

  return { ctx, dudung, whoosh };
}

function ago(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (!Number.isFinite(d) || d <= 0) return "오늘";
  if (d === 1) return "어제";
  if (d < 7) return `${d}일 전`;
  if (d < 30) return `${Math.floor(d / 7)}주 전`;
  return `${Math.floor(d / 30)}달 전`;
}

function mmss(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// 그날 처음 여는 거면 참견이 등장을 길게
export function soraIntroQuick(): boolean {
  try {
    const today = new Date().toDateString();
    const quick = localStorage.getItem(INTRO_KEY) === today;
    localStorage.setItem(INTRO_KEY, today);
    return quick;
  } catch {
    return false;
  }
}

// ── 소라님에게 말하기(전체 화면) ────────────────────────────────
export default function SoraTalk({
  quick,
  replyTo,
  startTyping = false,
  thinking,
  heard,
  bubble,
  onSend,
  onConfirmSpeech,
  onRetrySpeech,
  onClose,
}: {
  quick: boolean;
  replyTo?: string; // 참견이의 말에 대답하는 거면 그 말
  startTyping?: boolean;
  thinking: boolean;
  heard: { text: string; key: number } | null;
  bubble: HomeBubble | null;
  onSend: (input: Blob | string, replyTo?: string) => void;
  onConfirmSpeech?: (yes: boolean) => void;
  onRetrySpeech?: () => void;
  onClose: (keepBubble: boolean) => void; // keepBubble — 알람 제안처럼 홈 말풍선에 남겨야 할 게 있으면 true
}) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<Mode>("intro");
  const [target, setTarget] = useState<string | undefined>(replyTo);
  const [text, setText] = useState("");
  const [otter, setOtter] = useState<{ face: OtterExpression; line: string }>({ face: "laugh", line: "소라님한테 말해봐." });
  const [pullY, setPullY] = useState(0);
  const [closing, setClosing] = useState(false);
  const [ear, setEar] = useState(false);
  const [typed, setTyped] = useState(0);
  const [result, setResult] = useState<HomeBubble | null>(null);
  const drag = useRef<{ y0: number; moved: number } | null>(null);
  const sentAt = useRef(0);
  const sawThinking = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const sound = useSoraSound();

  const recorder = useTankRecorder((res) => {
    // 3분 자동 정지 — 그대로 보낸다
    handleRecorded(res);
  });
  const recording = recorder.state === "recording";

  useEffect(() => setMounted(true), []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // 등장 → 바로 녹음(또는 글쓰기)
  useEffect(() => {
    later(() => {
      if (startTyping) {
        setMode("type");
        setOtter({ face: "tilt", line: "써봐. 소라님이 읽어줄게." });
      } else startRec();
    }, quick ? 380 : 1050);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRec = async () => {
    setMode("rec");
    setOtter({ face: "laugh", line: target ? "참견이 말에 대답해봐." : "소라님한테 말해봐." });
    const ok = await recorder.start();
    if (!ok) {
      setMode("type");
      setOtter({ face: "tilt", line: "마이크가 안 잡혀. 글로 써줘." });
    }
  };

  const send = (input: Blob | string) => {
    sound.dudung();
    sentAt.current = Date.now();
    sawThinking.current = false;
    setResult(null);
    setEar(false);
    setTyped(0);
    setMode("sent");
    setOtter({ face: "surprise", line: "" });
    onSend(input, target);
  };

  function handleRecorded(res: TankRecordResult) {
    if (res.kind === "audio") {
      send(res.blob);
      return;
    }
    setOtter({ face: "stare", line: res.kind === "failed" ? "마이크가 안 잡혀. 글로 써줘." : "아직 아무 말도 안 했는데?" });
    if (res.kind === "failed") setMode("type");
  }

  // 줄 당기기 = 보내기
  const pull = async () => {
    sound.ctx()?.resume().catch(() => {});
    if (mode === "rec") {
      if (!recording) {
        setOtter({ face: "stare", line: "먼저 말해야 소라님이 듣지." });
        return;
      }
      playFx("micStop");
      handleRecorded(await recorder.finish());
      return;
    }
    if (mode === "type") {
      const t = text.trim();
      if (!t) {
        setOtter({ face: "stare", line: "먼저 써야 소라님이 듣지." });
        return;
      }
      send(t);
    }
  };

  const toType = async () => {
    playFx("buttonPress");
    if (recording) await recorder.finish(); // 하던 녹음은 버린다
    setMode("type");
    setOtter({ face: "tilt", line: "써봐. 소라님이 읽어줄게." });
  };
  const toRec = () => {
    playFx("micStart");
    startRec();
  };

  // 보낸 뒤 — 대답이 오면(생각이 끝나면) 결과로. 두둥 연출은 최소 1.6초는 지킨다.
  useEffect(() => {
    if (mode !== "sent") return;
    if (thinking) {
      sawThinking.current = true;
      return;
    }
    const wait = Math.max(0, 1600 - (Date.now() - sentAt.current));
    const t = setTimeout(() => {
      if (bubble) {
        setResult(bubble);
        setMode("result");
      } else if (sawThinking.current) {
        close(false); // 결과가 다른 데로 갔다(새 녹음에 밀림 등) — 홈으로
      }
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, thinking, bubble]);

  // 결과가 대답이면 — 소라를 귀에 대고, 쏴아— 뒤에 한 글자씩
  useEffect(() => {
    if (mode !== "result" || !result) return;
    if (result.kind !== "reply") {
      setOtter(
        result.kind === "confirm"
          ? { face: "tilt", line: "이렇게 말한 거 맞아?" }
          : result.kind === "retry"
          ? { face: "surprise", line: "앗." }
          : { face: "stare", line: "" }
      );
      return;
    }
    setOtter({ face: "sly", line: "쉿, 귀 대봐." });
    setEar(true);
    sound.whoosh();
    let i = 0;
    const full = result.text.length;
    let iv: ReturnType<typeof setInterval> | null = null;
    const t = setTimeout(() => {
      setOtter({ face: "laugh", line: "" });
      iv = setInterval(() => {
        i += 1;
        setTyped(i);
        if (i >= full && iv) clearInterval(iv);
      }, 38);
    }, 1300);
    return () => {
      clearTimeout(t);
      if (iv) clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, result]);

  const close = (keepBubble: boolean) => {
    if (closing) return;
    setClosing(true);
    later(() => onClose(keepBubble), 300);
  };

  const moreTalk = () => {
    if (result?.kind === "reply") setTarget(result.text);
    setResult(null);
    setEar(false);
    setTyped(0);
    playFx("micStart");
    later(startRec, 0);
  };

  // 줄 — 아래로 끌어서 놓거나, 그냥 눌러도 된다
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { y0: e.clientY, moved: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = Math.max(0, Math.min(90, e.clientY - drag.current.y0));
    drag.current.moved = Math.max(drag.current.moved, dy);
    setPullY(dy);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setPullY(0);
    if (!d) return;
    if (d.moved > 45 || d.moved < 6) pull();
  };

  const busy = mode === "sent";
  const canPull = mode === "rec" || mode === "type";
  const reply = mode === "result" && result?.kind === "reply" ? result : null;
  const answerShown = reply ? reply.text.slice(0, typed) : "";
  const answerDone = !!reply && typed >= reply.text.length;

  const ui = (
    <div className={`st-overlay ${busy ? "st-dark" : ""} ${closing ? "st-closing" : ""}`} role="dialog" aria-label="소라님">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Backdrop dark={busy} />
      <button className="st-x" onClick={() => close(!!reply?.alarmOffer)} aria-label="닫기">
        ×
      </button>

      <div className="st-say-row">
        {otter.line && (
          <div key={otter.line} className="st-say">
            {otter.line}
          </div>
        )}
      </div>
      {target && mode !== "result" && <div className="st-replyto">↳ “{target.length > 34 ? target.slice(0, 34) + "…" : target}”</div>}

      {/* 참견이가 팔을 쭉 늘려 내민 소라님 */}
      <div className={`st-stage ${quick ? "st-quick" : ""}`}>
        <div className={`st-halo ${busy ? "st-halo-on" : ""}`} />

        <div className={`st-held-pos ${ear ? "st-ear" : ""}`}>
          <div className="st-held-in">
            <div className={busy ? "st-shake" : "st-bob"}>
              <ConchArt width={160} glow={busy || mode === "result"} />
            </div>
          </div>
          {/* 말하는 동안 소라 입구에서 보글보글 */}
          {recording &&
            [0, 1, 2, 3].map((k) => <span key={k} className="st-bub" style={{ left: 34 + (k % 2) * 12, animationDelay: `${k * 0.45}s` }} />)}
          {ear && (
            <svg className="st-waves" width="70" height="90" viewBox="0 0 70 90" aria-hidden>
              <path d="M10 20 Q 28 45 10 70" fill="none" stroke="#FFF6E5" strokeWidth={4} strokeLinecap="round" />
              <path d="M28 8 Q 54 45 28 82" fill="none" stroke="#FFF6E5" strokeWidth={4} strokeLinecap="round" opacity={0.6} />
            </svg>
          )}
        </div>
        {/* 참견이 팔 — 오른쪽 어깨에서 탄력 있게 쭈욱. 앞발이 소라 아래를 꼭 쥔다 */}
        <svg className={`st-arm ${ear ? "st-gone" : ""}`} width="300" height="340" viewBox="0 0 300 340" aria-hidden>
          <defs>
            <linearGradient id="st-arm-fur" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#E09062" />
              <stop offset="0.55" stopColor="#C26A44" />
              <stop offset="1" stopColor="#8E4A2A" />
            </linearGradient>
            <radialGradient id="st-paw-fur" cx="0.38" cy="0.32" r="0.75">
              <stop offset="0" stopColor="#E09062" />
              <stop offset="1" stopColor="#9A5230" />
            </radialGradient>
          </defs>
          <g className="st-arm-g">
            <path d="M146 300 C 196 290, 194 208, 160 140 L 186 136 C 222 208, 220 318, 160 336 Z" fill="url(#st-arm-fur)" stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
            <path d="M162 304 C 188 284, 188 212, 168 152" fill="none" stroke="#F4B087" strokeWidth={4} strokeLinecap="round" opacity={0.7} />
            <circle cx="173" cy="134" r="18" fill="url(#st-paw-fur)" stroke={INK} strokeWidth={4.5} />
            <circle cx="159" cy="120" r="7" fill="#D27A50" stroke={INK} strokeWidth={3.5} />
            <circle cx="173" cy="114" r="7.5" fill="#D27A50" stroke={INK} strokeWidth={3.5} />
            <circle cx="187" cy="120" r="7" fill="#C26A44" stroke={INK} strokeWidth={3.5} />
            <ellipse cx="166" cy="130" rx="6" ry="4" fill="#FFFFFF" opacity={0.25} />
          </g>
          {!quick && mode === "intro" && (
            <g className="st-speed" stroke="#FFF6E5" strokeWidth={3} strokeLinecap="round" opacity={0.8}>
              <path d="M214 230 L 232 222" />
              <path d="M218 200 L 238 194" />
              <path d="M212 170 L 228 164" />
            </g>
          )}
        </svg>

        {/* 참견이 몸 — 팔 위에 겹쳐서 어깨에서 팔이 나오는 것처럼 */}
        <div className={`st-face ${ear ? "st-face-ear" : ""}`}>
          <OtterBuddy expression={otter.face} question={otter.face === "tilt"} giggle={otter.face === "laugh" && mode === "result"} />
        </div>

        {!quick && mode === "intro" && (
          <div className="st-zzu" aria-hidden>
            쭈욱—
          </div>
        )}
        {ear && !answerShown && (
          <div className="st-sha" aria-hidden>
            쏴아—
          </div>
        )}

        {canPull && (
          <div
            className={`st-rope ${recording || text.trim() ? "st-rope-ready" : ""}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => {
              drag.current = null;
              setPullY(0);
            }}
            role="button"
            tabIndex={0}
            aria-label="줄 당겨서 보내기"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") pull();
            }}
          >
            <svg width="40" height={70 + pullY} viewBox={`0 0 40 ${70 + pullY}`} style={{ overflow: "visible", display: "block" }} aria-hidden>
              <path d={`M14 0 C 26 ${18 + pullY / 4}, 6 ${34 + pullY / 2}, 20 ${52 + pullY}`} fill="none" stroke="#FFF6E5" strokeWidth={4} strokeLinecap="round" />
              <circle cx="20" cy={60 + pullY} r="12" fill="#FFF6E5" stroke={INK} strokeWidth={3.5} />
              <circle cx="20" cy={60 + pullY} r="5" fill="#8FD3F4" stroke={INK} strokeWidth={2.5} />
            </svg>
            <span className="st-rope-hint">{recording || text.trim() ? "↓ 당기면 보내기" : ""}</span>
          </div>
        )}
        {busy && <div className="st-dudung">두둥…</div>}

      </div>

      <div className="st-bottom">
        {mode === "rec" && (
          <>
            <div className="st-hint">{recording ? `${mmss(recorder.elapsedMs)} · 다 말했으면 줄 당겨` : recorder.state === "starting" ? "듣는 중…" : ""}</div>
            <div className="st-row">
              <button className="st-btn st-btn-small" onClick={toType}>
                글로 쓰기
              </button>
              {recorder.state === "idle" && (
                <button className="st-btn st-btn-yellow" onClick={toRec}>
                  다시 말하기
                </button>
              )}
            </div>
          </>
        )}

        {mode === "type" && (
          <>
            <label className="st-sr" htmlFor="st-text">
              소라님한테 할 말
            </label>
            <textarea id="st-text" className="st-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="소라님, 나 요즘…" maxLength={1000} rows={3} />
            <div className="st-hint">다 썼으면 줄 당겨</div>
            <div className="st-row">
              <button className="st-btn st-btn-small" onClick={toRec}>
                말로 하기
              </button>
            </div>
          </>
        )}

        {mode === "sent" && (
          <div className="st-heard">{heard ? `“${heard.text.length > 60 ? heard.text.slice(0, 60) + "…" : heard.text}”` : "소라님이 듣는 중…"}</div>
        )}

        {reply && (
          <>
            {answerShown && (
              <div className="st-card">
                <div className="st-card-cap">소라님 말씀</div>
                <div className="st-answer">{answerShown}</div>
                {answerDone && reply.recall && (
                  <div className="st-recall">
                    그때 니가 한 말 · {ago(reply.recall.at)}
                    <br />“{reply.recall.quote.length > 60 ? reply.recall.quote.slice(0, 60) + "…" : reply.recall.quote}”
                  </div>
                )}
              </div>
            )}
            {answerDone && (
              <div className="st-row">
                <button className="st-btn st-btn-yellow" onClick={moreTalk}>
                  더 말하기
                </button>
                <button className="st-btn" onClick={() => close(!!reply.alarmOffer)}>
                  됐어
                </button>
              </div>
            )}
          </>
        )}

        {mode === "result" && result?.kind === "notice" && (
          <>
            <div className="st-notice">{result.text}</div>
            <div className="st-row">
              <button className="st-btn st-btn-yellow" onClick={moreTalk}>
                다시 말하기
              </button>
              <button className="st-btn" onClick={() => close(false)}>
                됐어
              </button>
            </div>
          </>
        )}

        {mode === "result" && result?.kind === "confirm" && (
          <>
            <div className="st-card">
              <div className="st-answer">“{result.text}”</div>
            </div>
            <div className="st-row">
              <button
                className="st-btn st-btn-yellow"
                onClick={() => {
                  sentAt.current = Date.now();
                  sawThinking.current = false;
                  setResult(null);
                  setMode("sent");
                  onConfirmSpeech?.(true);
                }}
              >
                맞아
              </button>
              <button
                className="st-btn"
                onClick={() => {
                  onConfirmSpeech?.(false);
                  moreTalk();
                }}
              >
                아니
              </button>
            </div>
          </>
        )}

        {mode === "result" && result?.kind === "retry" && (
          <>
            <div className="st-notice">{result.text}</div>
            <div className="st-row">
              <button
                className="st-btn st-btn-yellow"
                onClick={() => {
                  sentAt.current = Date.now();
                  sawThinking.current = false;
                  setResult(null);
                  setMode("sent");
                  onRetrySpeech?.();
                }}
              >
                다시 보내기
              </button>
              <button className="st-btn" onClick={() => close(false)}>
                됐어
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return mounted ? createPortal(ui, document.body) : null;
}

const CSS = `
.st-overlay{position:fixed;inset:0;z-index:9999;background:#0B1E3A;display:flex;flex-direction:column;align-items:center;padding:calc(env(safe-area-inset-top) + 16px) 18px calc(env(safe-area-inset-bottom) + 18px);box-sizing:border-box;overflow-y:auto;overflow-x:hidden;color:${INK};font-family:'Jua',sans-serif;transition:background 1s ease,opacity .3s ease;animation:st-fade .3s ease both;touch-action:manipulation}
.st-dark{}
.st-bg{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:linear-gradient(180deg,#1C4E86 0%,#123A6A 30%,#0B2850 60%,#061631 100%)}
.st-rays span{position:absolute;top:-12%;height:78%;transform:rotate(16deg);transform-origin:top center;background:linear-gradient(180deg,rgba(190,235,255,.22),rgba(190,235,255,0));filter:blur(6px);animation:st-ray 7s ease-in-out infinite alternate}
.st-layer{position:absolute;left:0;right:0;bottom:0;width:100%}
.st-far{height:62%;opacity:.85}
.st-mid{height:36%}
.st-snow{position:absolute;border-radius:50%;background:#E6F6FF;opacity:.55;box-shadow:0 0 6px 1px rgba(200,235,255,.6);animation:st-snow linear infinite,st-twinkle 2.6s ease-in-out infinite alternate}
@keyframes st-twinkle{from{opacity:.2}to{opacity:.8}}
.st-near{position:absolute;bottom:0}
.st-near-l{left:-10px;width:170px;height:120px}
.st-near-r{right:-12px;width:110px;height:220px}
.st-kelp{transform-box:fill-box;transform-origin:50% 100%;animation:st-sway 5s ease-in-out infinite alternate}
.st-kelp2{animation-delay:-2s}
.st-vignette{position:absolute;inset:0;background:radial-gradient(ellipse 85% 70% at 50% 38%,rgba(0,0,0,0) 45%,rgba(3,8,24,.62) 100%)}
.st-dim{position:absolute;inset:0;background:rgba(2,6,18,.6);transition:opacity 1s ease}
.st-say-row,.st-replyto,.st-bottom{position:relative;z-index:1}
.st-closing{opacity:0}
.st-x{position:absolute;right:14px;top:calc(env(safe-area-inset-top) + 12px);z-index:3;width:44px;height:44px;border-radius:50%;border:2.5px solid ${INK};background:#FFF6E5;font-size:24px;line-height:1;color:${INK};cursor:pointer;font-family:inherit}
.st-say-row{align-self:stretch;min-height:44px;margin-right:56px;display:flex;align-items:center}
.st-say{background:#FFF6E5;border:2.5px solid ${INK};border-radius:16px;padding:7px 12px;font-size:16px;word-break:keep-all;animation:st-pop .3s cubic-bezier(.3,1.5,.5,1) both}
.st-replyto{align-self:stretch;margin-top:6px;text-align:center;font-size:13px;color:#DCE6FF;font-family:'Gowun Dodum',sans-serif}
.st-stage{position:relative;z-index:1;left:26px;width:300px;height:330px;flex:none;margin-top:auto}
.st-halo{position:absolute;left:125px;top:-20px;width:230px;height:230px;margin-left:-115px;border-radius:50%;background:radial-gradient(circle,rgba(255,243,176,.35),rgba(255,243,176,0) 70%);transition:opacity 1s ease,transform 1s ease;opacity:.6}
.st-halo-on{opacity:1;transform:scale(1.25);animation:st-breathe 1.1s ease-in-out infinite}
.st-arm{position:absolute;left:0;top:0;overflow:visible;pointer-events:none;transition:opacity .4s ease;filter:drop-shadow(0 8px 8px rgba(0,0,0,.35))}
.st-gone{opacity:0}
.st-arm-g{transform-box:view-box;transform-origin:165px 322px;animation:st-stretch .7s cubic-bezier(.3,1.4,.5,1) .2s both}
.st-held-pos{position:absolute;left:48px;top:8px;transition:transform .9s cubic-bezier(.3,1.2,.5,1)}
.st-ear{transform:translate(78px,-6px) rotate(26deg) scale(.82)}
.st-held-in{filter:drop-shadow(0 12px 12px rgba(0,0,0,.4));transform-origin:20% 90%;animation:st-reach .7s cubic-bezier(.3,1.5,.5,1) .3s both}
.st-bob{animation:st-bob 4s ease-in-out infinite alternate}
.st-shake{animation:st-shake .5s ease-in-out .5s 2}
.st-bub{position:absolute;top:96px;width:10px;height:10px;border-radius:50%;border:2.5px solid #FFF6E5;animation:st-bubup 1.8s ease-out infinite;pointer-events:none}
.st-waves{position:absolute;left:150px;top:30px;animation:st-fade .5s ease .5s both}
.st-zzu{position:absolute;right:-4px;top:110px;font-size:20px;color:#FFF6E5;transform:rotate(10deg);opacity:0;animation:st-zzu 1.2s ease .3s both;pointer-events:none}
.st-sha{position:absolute;left:0;right:0;top:200px;text-align:center;font-size:24px;color:#FFF6E5;text-shadow:2px 2px 0 ${INK};animation:st-sha 1.3s ease both;pointer-events:none}
.st-rope{position:absolute;left:78px;top:116px;cursor:grab;touch-action:none;display:flex;flex-direction:column;align-items:center;outline:none;z-index:2}
.st-rope-ready svg{animation:st-tug 1.2s ease-in-out infinite}
.st-rope-hint{font-size:13px;color:${INK};white-space:nowrap;margin-top:4px}
.st-rope-hint:not(:empty){background:#FFF6E5;border:2px solid ${INK};border-radius:999px;padding:2px 9px}
.st-dudung{position:absolute;left:0;right:0;top:160px;text-align:center;font-size:32px;color:#FFF6E5;text-shadow:2px 2px 0 ${INK};animation:st-dudung 1.6s ease both;z-index:2}
.st-face{position:absolute;left:0;top:0;width:300px;height:380px;pointer-events:none;filter:drop-shadow(0 8px 10px rgba(0,0,0,.35));transition:transform .8s ease;animation:st-facein .45s cubic-bezier(.3,1.5,.5,1) both}
.st-face-ear{transform:translateX(30px)}
.st-buddy{display:block;overflow:visible}
.st-buddy .st-giggle{transform-box:fill-box;transform-origin:50% 60%}
.st-q{animation:st-qbob 1.2s ease-in-out infinite alternate}
.st-speed{animation:st-fade .2s ease .35s both}
.st-giggle{animation:st-giggle .35s ease-in-out infinite alternate}
.st-quick .st-arm-g{animation-duration:.3s;animation-delay:0s}
.st-quick .st-held-in{animation-duration:.3s;animation-delay:0s}
.st-quick .st-face{animation-duration:.25s}
.st-bottom{width:100%;max-width:380px;margin-top:auto;display:flex;flex-direction:column;align-items:stretch;gap:10px;padding-top:12px}
.st-row{display:flex;gap:10px;justify-content:center}
.st-hint{text-align:center;font-size:14px;color:#DCE6FF;min-height:18px}
.st-heard{text-align:center;font-size:15px;color:#DCE6FF;font-family:'Gowun Dodum',sans-serif;line-height:1.5;padding:6px 8px}
.st-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.st-input{width:100%;box-sizing:border-box;font-size:16px;line-height:1.5;padding:12px 14px;border:3px solid ${INK};border-radius:16px;background:#FFFFFF;color:${INK};outline:none;resize:none;font-family:'Gowun Dodum',sans-serif}
.st-input:focus{box-shadow:0 0 0 3px #FFD23F}
.st-card{background:#FFF6E5;border:3px solid ${INK};border-radius:22px;box-shadow:0 5px 0 ${INK};padding:14px 16px;display:flex;flex-direction:column;gap:8px;animation:st-pop .35s cubic-bezier(.3,1.5,.5,1) both}
.st-card-cap{font-size:13px;color:#4A4458}
.st-answer{font-size:19px;line-height:1.45;word-break:keep-all;white-space:pre-line}
.st-recall{margin-top:4px;padding-top:8px;border-top:2px dashed rgba(27,22,48,.18);font-size:13px;line-height:1.5;color:#4A4458;font-family:'Gowun Dodum',sans-serif;animation:st-fade .5s ease both}
.st-notice{text-align:center;font-size:20px;color:#FFF6E5;white-space:pre-line;padding:6px 0;animation:st-pop .35s cubic-bezier(.3,1.5,.5,1) both}
.st-btn{flex:1;height:52px;font-size:16px;color:${INK};background:#FFF6E5;border:3px solid ${INK};border-radius:16px;box-shadow:0 4px 0 ${INK};cursor:pointer;font-family:inherit}
.st-btn-yellow{background:#FFD23F}
.st-btn-small{flex:0 0 auto;height:44px;padding:0 16px;font-size:14px;box-shadow:0 3px 0 ${INK}}

@keyframes st-fade{from{opacity:0}to{opacity:1}}
@keyframes st-pop{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
@keyframes st-bob{from{transform:translateY(0)}to{transform:translateY(-6px)}}
@keyframes st-breathe{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes st-shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
@keyframes st-tug{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}
@keyframes st-dudung{0%{opacity:0;transform:scale(.6)}30%{opacity:1;transform:scale(1.1)}55%{transform:scale(1)}100%{opacity:1}}
@keyframes st-giggle{from{transform:rotate(-6deg)}to{transform:rotate(6deg) translateY(-2px)}}
@keyframes st-stretch{0%{opacity:0;transform:scale(.15)}55%{opacity:1;transform:scale(1.1)}78%{transform:scale(.96)}100%{opacity:1;transform:none}}
@keyframes st-qbob{from{transform:translateY(0)}to{transform:translateY(-4px)}}
@keyframes st-ray{from{transform:rotate(12deg);opacity:.7}to{transform:rotate(20deg);opacity:1}}
@keyframes st-snow{from{transform:translateY(0)}to{transform:translateY(-120px)}}
@keyframes st-sway{from{transform:rotate(-3deg)}to{transform:rotate(4deg)}}
@keyframes st-reach{from{opacity:0;transform:translate(-60px,200px) scale(.25) rotate(-30deg)}to{opacity:1;transform:none}}
@keyframes st-facein{from{opacity:0;transform:translateY(120px) scale(.6)}to{opacity:1;transform:none}}
@keyframes st-zzu{0%{opacity:0;transform:rotate(10deg) translateX(-20px)}30%{opacity:1}70%{opacity:1}100%{opacity:0;transform:rotate(10deg) translateX(10px)}}
@keyframes st-sha{0%{opacity:0;transform:scale(.8)}30%{opacity:1;transform:scale(1.05)}80%{opacity:1}100%{opacity:0}}
@keyframes st-bubup{0%{opacity:0;transform:translate(0,0) scale(.6)}20%{opacity:1}100%{opacity:0;transform:translate(-14px,-90px) scale(1.1)}}
@media (prefers-reduced-motion: reduce){.st-bob,.st-shake,.st-halo-on,.st-rope-ready svg,.st-giggle,.st-held-in,.st-face,.st-zzu,.st-bub{animation:none}.st-arm-g,.st-rays span,.st-snow,.st-kelp{animation:none}}
`;
