// components/SoraTalk.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OtterFace, type OtterExpression } from "@/components/Otter";
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

// ── 소라 그림 ────────────────────────────────────────────────
export function ConchArt({ width, glow = false }: { width: number; glow?: boolean }) {
  return (
    <svg viewBox="20 0 200 180" width={width} height={(width * 180) / 200} style={{ overflow: "visible", display: "block" }} aria-hidden>
      <path d="M36 168 C 18 110, 70 52, 136 36 L 206 10 L 182 76 C 174 132, 118 182, 36 168 Z" fill={glow ? "#FFC9DC" : "#F7B8CF"} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
      <path d="M150 30 L 160 6 L 170 24 Z M 186 70 L 212 62 L 196 84 Z M 120 44 L 122 20 L 136 36 Z" fill={glow ? "#FFC9DC" : "#F7B8CF"} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
      <path d="M62 150 C 74 112, 110 76, 168 54 M 92 158 C 106 128, 136 100, 176 82 M 48 120 C 70 84, 110 58, 156 40" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <ellipse cx="66" cy="148" rx="30" ry="18" transform="rotate(-32 66 148)" fill={glow ? "#FFF3B0" : "#FFE7F0"} stroke={INK} strokeWidth={6} />
      <ellipse cx="70" cy="146" rx="15" ry="8" transform="rotate(-32 70 146)" fill={glow ? "#FFE68A" : "#E79AB8"} />
    </svg>
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

        <svg className={`st-arm ${ear ? "st-gone" : ""}`} width="300" height="340" viewBox="0 0 300 340" aria-hidden>
          <path className="st-arm-line" d="M70 290 C 140 290, 186 230, 172 150" fill="none" stroke={INK} strokeWidth={34} strokeLinecap="round" />
          <path className="st-arm-line" d="M70 290 C 140 290, 186 230, 172 150" fill="none" stroke="#A9744F" strokeWidth={25} strokeLinecap="round" />
          <circle className="st-paw" cx="172" cy="142" r="17" fill="#A9744F" stroke={INK} strokeWidth={4} />
        </svg>

        <div className={`st-held-pos ${ear ? "st-ear" : ""}`}>
          <div className="st-held-in">
            <div className={busy ? "st-shake" : "st-bob"}>
              <ConchArt width={160} glow={busy || mode === "result"} />
            </div>
          </div>
          {/* 말하는 동안 소라 입구에서 보글보글 */}
          {recording &&
            [0, 1, 2, 3].map((k) => <span key={k} className="st-bub" style={{ left: 28 + (k % 2) * 12, animationDelay: `${k * 0.45}s` }} />)}
          {ear && (
            <svg className="st-waves" width="70" height="90" viewBox="0 0 70 90" aria-hidden>
              <path d="M10 20 Q 28 45 10 70" fill="none" stroke="#FFF6E5" strokeWidth={4} strokeLinecap="round" />
              <path d="M28 8 Q 54 45 28 82" fill="none" stroke="#FFF6E5" strokeWidth={4} strokeLinecap="round" opacity={0.6} />
            </svg>
          )}
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

        <div className={`st-face ${ear ? "st-face-ear" : ""}`}>
          <OtterFace expression={otter.face} size={120} className={otter.face === "laugh" && mode === "result" ? "st-giggle" : undefined} />
        </div>
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
.st-overlay{position:fixed;inset:0;z-index:9999;background:rgba(12,24,52,.92);display:flex;flex-direction:column;align-items:center;padding:calc(env(safe-area-inset-top) + 16px) 18px calc(env(safe-area-inset-bottom) + 18px);box-sizing:border-box;overflow-y:auto;overflow-x:hidden;color:${INK};font-family:'Jua',sans-serif;transition:background 1s ease,opacity .3s ease;animation:st-fade .3s ease both;touch-action:manipulation}
.st-dark{background:rgba(4,8,22,.97)}
.st-closing{opacity:0}
.st-x{position:absolute;right:14px;top:calc(env(safe-area-inset-top) + 12px);z-index:3;width:44px;height:44px;border-radius:50%;border:2.5px solid ${INK};background:#FFF6E5;font-size:24px;line-height:1;color:${INK};cursor:pointer;font-family:inherit}
.st-say-row{align-self:stretch;min-height:44px;margin-right:56px;display:flex;align-items:center}
.st-say{background:#FFF6E5;border:2.5px solid ${INK};border-radius:16px;padding:7px 12px;font-size:16px;word-break:keep-all;animation:st-pop .3s cubic-bezier(.3,1.5,.5,1) both}
.st-replyto{align-self:stretch;margin-top:6px;font-size:13px;color:#DCE6FF;font-family:'Gowun Dodum',sans-serif}
.st-stage{position:relative;width:300px;height:330px;flex:none;margin-top:4px}
.st-halo{position:absolute;left:125px;top:-20px;width:230px;height:230px;margin-left:-115px;border-radius:50%;background:radial-gradient(circle,rgba(255,243,176,.35),rgba(255,243,176,0) 70%);transition:opacity 1s ease,transform 1s ease;opacity:.6}
.st-halo-on{opacity:1;transform:scale(1.25);animation:st-breathe 1.1s ease-in-out infinite}
.st-arm{position:absolute;left:0;top:0;overflow:visible;pointer-events:none;transition:opacity .4s ease}
.st-gone{opacity:0}
.st-arm-line{stroke-dasharray:260;stroke-dashoffset:260;animation:st-draw .55s cubic-bezier(.3,1.3,.5,1) .25s forwards}
.st-paw{opacity:0;animation:st-pawin .2s ease .7s forwards}
.st-held-pos{position:absolute;left:48px;top:8px;transition:transform .9s cubic-bezier(.3,1.2,.5,1)}
.st-ear{transform:translate(78px,-6px) rotate(26deg) scale(.82)}
.st-held-in{transform-origin:20% 90%;animation:st-reach .7s cubic-bezier(.3,1.5,.5,1) .3s both}
.st-bob{animation:st-bob 4s ease-in-out infinite alternate}
.st-shake{animation:st-shake .5s ease-in-out .5s 2}
.st-bub{position:absolute;top:118px;width:10px;height:10px;border-radius:50%;border:2.5px solid #FFF6E5;animation:st-bubup 1.8s ease-out infinite;pointer-events:none}
.st-waves{position:absolute;left:150px;top:30px;animation:st-fade .5s ease .5s both}
.st-zzu{position:absolute;right:-4px;top:110px;font-size:20px;color:#FFF6E5;transform:rotate(10deg);opacity:0;animation:st-zzu 1.2s ease .3s both;pointer-events:none}
.st-sha{position:absolute;left:0;right:0;top:200px;text-align:center;font-size:24px;color:#FFF6E5;text-shadow:2px 2px 0 ${INK};animation:st-sha 1.3s ease both;pointer-events:none}
.st-rope{position:absolute;left:54px;top:124px;cursor:grab;touch-action:none;display:flex;flex-direction:column;align-items:center;outline:none;z-index:2}
.st-rope-ready svg{animation:st-tug 1.2s ease-in-out infinite}
.st-rope-hint{font-size:13px;color:${INK};white-space:nowrap;margin-top:4px}
.st-rope-hint:not(:empty){background:#FFF6E5;border:2px solid ${INK};border-radius:999px;padding:2px 9px}
.st-dudung{position:absolute;left:0;right:0;top:160px;text-align:center;font-size:32px;color:#FFF6E5;text-shadow:2px 2px 0 ${INK};animation:st-dudung 1.6s ease both;z-index:2}
.st-face{position:absolute;left:-18px;bottom:-6px;transition:transform .8s ease;animation:st-facein .45s cubic-bezier(.3,1.5,.5,1) both}
.st-face-ear{transform:translateX(30px)}
.st-giggle{animation:st-giggle .35s ease-in-out infinite alternate}
.st-quick .st-arm-line{animation-duration:.25s;animation-delay:0s}
.st-quick .st-paw{animation-delay:.2s}
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
@keyframes st-draw{to{stroke-dashoffset:0}}
@keyframes st-pawin{to{opacity:1}}
@keyframes st-reach{from{opacity:0;transform:translate(-60px,200px) scale(.25) rotate(-30deg)}to{opacity:1;transform:none}}
@keyframes st-facein{from{opacity:0;transform:translateY(120px) scale(.6)}to{opacity:1;transform:none}}
@keyframes st-zzu{0%{opacity:0;transform:rotate(10deg) translateX(-20px)}30%{opacity:1}70%{opacity:1}100%{opacity:0;transform:rotate(10deg) translateX(10px)}}
@keyframes st-sha{0%{opacity:0;transform:scale(.8)}30%{opacity:1;transform:scale(1.05)}80%{opacity:1}100%{opacity:0}}
@keyframes st-bubup{0%{opacity:0;transform:translate(0,0) scale(.6)}20%{opacity:1}100%{opacity:0;transform:translate(-14px,-90px) scale(1.1)}}
@media (prefers-reduced-motion: reduce){.st-bob,.st-shake,.st-halo-on,.st-rope-ready svg,.st-giggle,.st-held-in,.st-face,.st-zzu,.st-bub{animation:none}.st-arm-line{animation:none;stroke-dashoffset:0}.st-paw{animation:none;opacity:1}}
`;
