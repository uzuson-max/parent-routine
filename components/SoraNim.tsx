// components/SoraNim.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OtterFace, OtterSwim, type OtterExpression } from "@/components/Otter";
import { authed, useVoicePlayer } from "@/lib/voicePlayer";
import { readTone } from "@/lib/tone";

// ============================================================================
// 소라님 — 심해를 둥둥 떠다니는 이웃. (2026-10-19, 바닥 고정 → 떠다니기로 변경)
// ----------------------------------------------------------------------------
// 1. 정해진 자리 없이 아주 천천히 떠다닌다. 벽에 닿으면 살짝 튕긴다(핑퐁보다 훨씬 느리게 — 물고기보다 눈에 안 띄게).
// 2. 누르면 참견이가 슝 헤엄쳐 가서 낚아챈다(그동안 진짜 참견이는 DeepSea에서 잠깐 숨는다 — onCatch).
// 3. 참견이가 화면 앞까지 다가와 팔을 쭉 늘려 소라를 니 쪽으로 내민다.
//    물어봄 → 줄 당김 → (조용) 두둥 → 그때 니 목소리 3초 → 참견이 킥킥
// 4. 끝나면 참견이 자리에서 소라를 휙 던진다. 소라님은 다시 둥둥.
// 소라님은 말로 털지 않는다. 니 목소리가 대답이다. 참견이는 옆에서 반응만 하는 관객.
// 꺼낼 말이 없으면 시큰둥하게 넘긴다("몰라.").
// 기억 찾기: POST /api/sora/ask · 목소리: /api/stage/voice?entry=<id> (본인 녹음만, 10분 링크)
// ============================================================================

const INK = "#1B1630";

const CONCH_W = 64; // 떠다닐 때 크기
const CONCH_H = (CONCH_W * 180) / 200;
const TOP_KEEP = 200; // 로고·버튼 아래로만(DeepSea TOP_KEEP과 맞춤)
const FLOOR_KEEP = 140; // 바닥 장식 위로만
const DRIFT = 13; // px/초 — 아주 느리게
const DASH_MS = 950;
const THROW_MS = 1200;

type Stage = "drift" | "dash" | "held" | "throw";
interface Pt {
  x: number;
  y: number;
}

function randVel(): Pt {
  const a = Math.random() * Math.PI * 2;
  return { x: Math.cos(a) * DRIFT, y: Math.sin(a) * DRIFT * 0.7 };
}

// 소라 몸통 — 아래 큰 몸 + 뾰족한 위쪽 + 왼쪽 아래 입구
function ConchArt({ width, glow = false }: { width: number; glow?: boolean }) {
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

// 심해 안에서 떠다니는 소라님 + 잡으러 가는 참견이(components/DeepSea.tsx 안)
export default function SoraNim({
  night = false,
  otterAt,
  disabled = false,
  onCatch,
}: {
  night?: boolean;
  otterAt: Pt; // 지금 참견이 몸 가운데(심해 안 px) — 여기서 출발하고, 여기서 다시 던진다
  disabled?: boolean; // 참견이가 바쁘거나 위로 올라가 있을 땐 못 잡는다
  onCatch: (busy: boolean) => void; // true = 진짜 참견이 잠깐 숨김
}) {
  const [stage, setStage] = useState<Stage>("drift");
  const [mounted, setMounted] = useState(false);
  const [dash, setDash] = useState<{ from: Pt; to: Pt; go: boolean; facing: 1 | -1; caught: boolean } | null>(null);
  const [whoosh, setWhoosh] = useState<{ at: Pt; key: number } | null>(null);
  const conchEl = useRef<HTMLButtonElement>(null);
  const pos = useRef<Pt>({ x: -1, y: -1 });
  const vel = useRef<Pt>(randVel());
  const stageRef = useRef<Stage>("drift");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  useEffect(() => setMounted(true), []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const bounds = () => {
    const parent = conchEl.current?.offsetParent as HTMLElement | null;
    const W = parent?.clientWidth ?? 360;
    const H = parent?.clientHeight ?? 700;
    return {
      x0: CONCH_W / 2 + 6,
      x1: Math.max(CONCH_W, W - CONCH_W / 2 - 6),
      y0: TOP_KEEP,
      y1: Math.max(TOP_KEEP + 40, H - FLOOR_KEEP),
    };
  };

  const place = (p: Pt) => {
    const el = conchEl.current;
    if (el) el.style.transform = `translate(${p.x - CONCH_W / 2}px, ${p.y - CONCH_H / 2}px)`;
  };

  // 둥둥 — 매 프레임 조금씩. 벽에 닿으면 그 방향만 뒤집는다.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (stageRef.current === "drift" && conchEl.current) {
        const b = bounds();
        if (pos.current.x < 0) {
          pos.current = { x: b.x0 + Math.random() * (b.x1 - b.x0), y: b.y0 + Math.random() * (b.y1 - b.y0) };
        }
        let { x, y } = pos.current;
        x += vel.current.x * dt;
        y += vel.current.y * dt;
        if (x < b.x0 || x > b.x1) {
          vel.current.x *= -1;
          x = Math.min(b.x1, Math.max(b.x0, x));
        }
        if (y < b.y0 || y > b.y1) {
          vel.current.y *= -1;
          y = Math.min(b.y1, Math.max(b.y0, y));
        }
        pos.current = { x, y };
        place(pos.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 누르면 — 참견이가 슝
  const catchIt = () => {
    if (stage !== "drift" || disabled) return;
    const to = { ...pos.current };
    const from = { ...otterAt };
    const facing: 1 | -1 = to.x >= from.x ? 1 : -1;
    setStage("dash");
    onCatch(true);
    setDash({ from, to: { x: to.x - facing * 46, y: to.y + 8 }, go: false, facing, caught: false });
    requestAnimationFrame(() => requestAnimationFrame(() => setDash((d) => (d ? { ...d, go: true } : d))));
    later(() => setDash((d) => (d ? { ...d, caught: true } : d)), DASH_MS);
    later(() => setStage("held"), DASH_MS + 280);
  };

  // 끝나면 — 참견이 자리에서 휙
  const release = () => {
    setDash(null);
    onCatch(false);
    const b = bounds();
    const start = { x: Math.min(b.x1, Math.max(b.x0, otterAt.x)), y: Math.min(b.y1, Math.max(b.y0, otterAt.y)) };
    const target = { x: b.x0 + Math.random() * (b.x1 - b.x0), y: b.y0 + Math.random() * Math.min(160, b.y1 - b.y0) };
    const el = conchEl.current;
    setStage("throw");
    setWhoosh({ at: start, key: Date.now() });
    if (el) {
      el.style.transition = "none";
      place(start);
      void el.offsetWidth;
      el.style.transition = `transform ${THROW_MS}ms cubic-bezier(.2,.8,.3,1), opacity .25s ease`;
      place(target);
    }
    later(() => {
      if (el) el.style.transition = "";
      pos.current = target;
      vel.current = randVel();
      setWhoosh(null);
      setStage("drift");
    }, THROW_MS + 50);
  };

  const hidden = stage === "held" || (stage === "dash" && !!dash?.caught);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* 떠다니는 소라님 */}
      <button
        ref={conchEl}
        className={`sn-float ${disabled && stage === "drift" ? "sn-float-off" : ""}`}
        style={{ opacity: hidden ? 0 : 1 }}
        onClick={catchIt}
        aria-label="소라님 — 누르면 참견이가 잡아다 줌"
        tabIndex={stage === "drift" ? 0 : -1}
      >
        <span className="sn-float-glow" style={{ opacity: night ? 0.95 : 0.65 }} />
        <span className={`sn-float-body ${stage === "throw" ? "sn-spin" : ""}`}>
          <ConchArt width={CONCH_W} glow={stage === "dash"} />
        </span>
      </button>

      {/* 휙! */}
      {whoosh && (
        <div key={whoosh.key} className="sn-whoosh" style={{ left: whoosh.at.x, top: whoosh.at.y - 60 }} aria-hidden>
          휙!
        </div>
      )}

      {/* 잡으러 가는 참견이 */}
      {dash && (
        <div
          className="sn-dash"
          style={{
            transform: `translate(${dash.go ? dash.to.x : dash.from.x}px, ${dash.go ? dash.to.y : dash.from.y}px)`,
            transition: dash.go ? `transform ${DASH_MS}ms cubic-bezier(.3,.05,.2,1)` : "none",
          }}
          aria-hidden
        >
          <div style={{ transform: `translate(-50%, -50%) scaleX(${dash.facing}) rotate(${dash.go && !dash.caught ? -6 : 0}deg)` }}>
            <OtterSwim expression={dash.caught ? "laugh" : "surprise"} holding={dash.caught ? "shell" : "none"} width={140} />
          </div>
          {!dash.caught && <div className="sn-dash-say">슝—</div>}
        </div>
      )}

      {stage === "held" && mounted && createPortal(<Ritual onClose={release} />, document.body)}
    </>
  );
}

// ── 의식 화면 — 참견이가 팔을 쭉 늘려 소라를 내민다 ──────────────────
type Phase = "ask" | "dudung" | "answer" | "empty" | "bye";
interface Found {
  entryId: string | null;
  quote: string;
  at: string;
}

const CHIPS = ["오늘 운동 가야 돼?", "나 요즘 뭐 한다고 했더라?", "이번 주 나 괜찮을까?"];

const EMPTY_LINES = {
  mild: ["몰라.", "다시 물어봐.", "니가 알잖아.", "소라님이 들은 게 없대. 니 얘기 좀 더 해봐."],
  spicy: ["몰라ㅋ", "다시 물어봐 이 바보야", "그걸 소라님이 어떻게 알아ㅋㅋ", "니가 말을 안 했잖아ㅋㅋ"],
};

function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

function ago(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (!Number.isFinite(d) || d <= 0) return "오늘";
  if (d === 1) return "어제";
  if (d < 7) return `${d}일 전`;
  if (d < 30) return `${Math.floor(d / 7)}주 전`;
  return `${Math.floor(d / 30)}달 전`;
}

function Ritual({ onClose }: { onClose: () => void }) {
  const tone = useRef(readTone()).current;
  const player = useVoicePlayer();
  const [phase, setPhase] = useState<Phase>("ask");
  const [question, setQuestion] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [voiceOk, setVoiceOk] = useState<boolean | null>(null);
  const [otter, setOtter] = useState<{ face: OtterExpression; line: string }>({ face: "laugh", line: "소라님한테 물어봐." });
  const [emptyLine, setEmptyLine] = useState("");
  const [pullY, setPullY] = useState(0);
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ y0: number; moved: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
      player.stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const close = () => {
    if (closing) return;
    player.stop();
    setClosing(true);
    later(onClose, 320);
  };

  const listen = async (f: Found) => {
    if (!f.entryId) return;
    setOtter({ face: "laugh", line: "킥킥" });
    const ok = await player.playClip(`entry=${encodeURIComponent(f.entryId)}`, f.quote);
    if (!alive.current) return;
    setVoiceOk(ok);
    setOtter({ face: ok ? "sly" : "tilt", line: ok ? "…라고 하셨습니다." : "목소리가 안 들려. 글로 봐." });
  };

  const pull = async () => {
    if (phase !== "ask") return;
    const q = question.trim();
    if (!q) {
      setOtter({ face: "stare", line: "먼저 물어봐야 소라님이 듣지." });
      return;
    }
    player.unlock();
    player.dudung();
    setPhase("dudung");
    setOtter({ face: "surprise", line: "" });

    const wait = new Promise<void>((r) => later(r, 1700));
    let result: Found | null = null;
    try {
      const res = await authed("/api/sora/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const body = await res.json();
      if (body?.success && body.data?.found) result = { entryId: body.data.entryId ?? null, quote: String(body.data.quote), at: String(body.data.at) };
    } catch {
      result = null;
    }
    // 목소리를 미리 받아 둔다(두둥 동안) — 끝나자마자 바로 나오게
    if (result?.entryId) await player.load(`entry=${encodeURIComponent(result.entryId)}`);
    await wait;
    if (!alive.current) return;

    if (!result) {
      setEmptyLine(pick(EMPTY_LINES[tone]));
      setOtter({ face: "base", line: "소라님 원래 저래." });
      setPhase("empty");
      return;
    }
    setFound(result);
    setVoiceOk(null);
    setPhase("answer");
    if (result.entryId) listen(result);
    else setOtter({ face: "sly", line: "…라고 하셨습니다." });
  };

  const again = () => {
    player.stop();
    setFound(null);
    setVoiceOk(null);
    setQuestion("");
    setPhase("ask");
    setOtter({ face: "tilt", line: "또 뭐." });
  };

  const bye = (doIt: boolean) => {
    player.stop();
    setPhase("bye");
    setOtter(
      doIt
        ? { face: "proud", line: tone === "spicy" ? "오 진짜? 지켜본다ㅋ" : "오 진짜? 지켜본다." }
        : { face: "laugh", line: tone === "spicy" ? "그럴 줄 알았다 이 바보야ㅋㅋ" : "ㅋㅋ 그럴 줄 알았어." }
    );
    later(close, 1500);
  };

  // 줄 당기기 — 아래로 끌어서 놓거나, 그냥 눌러도 된다
  const onDown = (e: React.PointerEvent) => {
    if (phase !== "ask") return;
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

  const busy = phase === "dudung";
  const ready = phase === "ask" && question.trim().length > 0;

  return (
    <div className={`sn-overlay ${busy ? "sn-dark" : ""} ${closing ? "sn-closing" : ""}`} role="dialog" aria-label="소라님">
      <button className="sn-x" onClick={close} aria-label="닫기">
        ×
      </button>

      {/* 참견이 말 — 아래 얼굴에서 나오는 말풍선 */}
      <div className="sn-say-row">
        {otter.line && (
          <div key={otter.line} className="sn-otter-say">
            {otter.line}
          </div>
        )}
      </div>

      {/* 참견이가 팔을 쭉 늘려 내민 소라님 */}
      <div className="sn-stage">
        <div className={`sn-halo ${busy ? "sn-halo-on" : ""} ${phase === "answer" ? "sn-halo-soft" : ""}`} />

        {/* 팔 — 얼굴에서 소라까지 쭈욱 */}
        <svg className="sn-arm" width="300" height="360" viewBox="0 0 300 360" aria-hidden>
          <path className="sn-arm-line" d="M70 300 C 140 300, 186 240, 172 160" fill="none" stroke={INK} strokeWidth={34} strokeLinecap="round" />
          <path className="sn-arm-line" d="M70 300 C 140 300, 186 240, 172 160" fill="none" stroke="#A9744F" strokeWidth={25} strokeLinecap="round" />
          <circle className="sn-paw" cx="172" cy="152" r="17" fill="#A9744F" stroke={INK} strokeWidth={4} />
        </svg>

        {/* 소라님 */}
        <div className="sn-held-pos">
          <div className="sn-held-in">
            <div className={busy ? "sn-shake" : "sn-bob"}>
              <ConchArt width={170} glow={busy || phase === "answer"} />
            </div>
          </div>
        </div>
        <div className="sn-zzu" aria-hidden>
          쭈욱—
        </div>

        {/* 줄 */}
        {phase === "ask" && (
          <div
            className={`sn-rope ${ready ? "sn-rope-ready" : ""}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => {
              drag.current = null;
              setPullY(0);
            }}
            role="button"
            tabIndex={0}
            aria-label="줄 당기기"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") pull();
            }}
          >
            <svg width="40" height={70 + pullY} viewBox={`0 0 40 ${70 + pullY}`} style={{ overflow: "visible", display: "block" }} aria-hidden>
              <path d={`M14 0 C 26 ${18 + pullY / 4}, 6 ${34 + pullY / 2}, 20 ${52 + pullY}`} fill="none" stroke="#FFF6E5" strokeWidth={4} strokeLinecap="round" />
              <circle cx="20" cy={60 + pullY} r="12" fill="#FFF6E5" stroke={INK} strokeWidth={3.5} />
              <circle cx="20" cy={60 + pullY} r="5" fill="#8FD3F4" stroke={INK} strokeWidth={2.5} />
            </svg>
            <span className="sn-rope-hint">{ready ? "↓ 당겨" : ""}</span>
          </div>
        )}
        {busy && <div className="sn-dudung">두둥…</div>}

        {/* 참견이 얼굴 — 화면 앞까지 다가옴 */}
        <div className="sn-face">
          <OtterFace expression={otter.face} size={128} className={otter.face === "laugh" ? "sn-giggle" : undefined} />
        </div>
      </div>

      {/* 아래 — 단계별 */}
      <div className="sn-bottom">
        {phase === "ask" && (
          <>
            <div className="sn-chips">
              {CHIPS.map((c) => (
                <button key={c} className="sn-chip" onClick={() => setQuestion(c)}>
                  {c}
                </button>
              ))}
            </div>
            <form
              className="sn-ask"
              onSubmit={(e) => {
                e.preventDefault();
                pull();
              }}
            >
              <label className="sn-sr" htmlFor="sn-q">
                소라님한테 물어볼 것
              </label>
              <input id="sn-q" className="sn-input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="소라님, 나 오늘…" maxLength={120} autoComplete="off" />
            </form>
            <div className="sn-hint">물어보고 줄을 당겨봐</div>
          </>
        )}

        {phase === "answer" && found && (
          <>
            <div className="sn-card">
              <div className="sn-card-cap">
                {found.entryId && voiceOk !== false ? "그때 니 목소리" : "그때 니가 한 말"} · {ago(found.at)}
              </div>
              {found.entryId && voiceOk !== false && (
                <div className="sn-play-row">
                  <button className="sn-play" onClick={() => listen(found)} aria-label="다시 듣기" disabled={player.state !== "idle"}>
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                      <path d="M7 4l13 8-13 8z" fill="#FFF6E5" />
                    </svg>
                  </button>
                  <div className={`sn-wave ${player.state === "playing" ? "sn-wave-on" : ""}`} aria-hidden>
                    {[12, 24, 34, 20, 30, 38, 22, 14, 28, 36, 18, 26, 12, 20].map((h, i) => (
                      <span key={i} style={{ height: h, animationDelay: `${i * 0.06}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div className="sn-quote">“{found.quote.length > 80 ? found.quote.slice(0, 80) + "…" : found.quote}”</div>
            </div>
            <div className="sn-btns">
              <button className="sn-btn sn-btn-mint" onClick={() => bye(true)}>
                오늘은 한다
              </button>
              <button className="sn-btn" onClick={() => bye(false)}>
                또 안 한다ㅋㅋ
              </button>
            </div>
            <button className="sn-link" onClick={again}>
              다른 거 물어보기
            </button>
          </>
        )}

        {phase === "empty" && (
          <>
            <div className="sn-empty">{emptyLine}</div>
            <div className="sn-btns">
              <button className="sn-btn" onClick={again}>
                다시 물어보기
              </button>
              <button className="sn-btn" onClick={close}>
                됐어
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const CSS = `
.sn-float{position:absolute;left:0;top:0;z-index:4;width:${CONCH_W}px;height:${CONCH_H}px;padding:0;margin:0;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:opacity .25s ease;will-change:transform}
.sn-float::before{content:"";position:absolute;inset:-18px}
.sn-float-off{cursor:default}
.sn-float-glow{position:absolute;left:50%;top:50%;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;background:radial-gradient(circle,rgba(255,243,176,.5),rgba(255,243,176,0) 70%);animation:sn-breathe 3.6s ease-in-out infinite;pointer-events:none}
.sn-float-body{position:relative;display:block;animation:sn-wobble 5s ease-in-out infinite alternate}
.sn-float:active .sn-float-body{transform:scale(.9)}
.sn-spin{animation:sn-spin .6s linear 2}
.sn-whoosh{position:absolute;z-index:8;transform:translateX(-50%);font-size:24px;font-weight:800;color:#FFF6E5;text-shadow:2px 2px 0 ${INK};pointer-events:none;animation:sn-whoosh 1.1s ease-out both}
.sn-dash{position:absolute;left:0;top:0;width:0;height:0;z-index:6;pointer-events:none;will-change:transform}
.sn-dash-say{position:absolute;left:-30px;top:-74px;font-size:18px;font-weight:800;color:#FFF6E5;text-shadow:2px 2px 0 ${INK};white-space:nowrap}

.sn-overlay{position:fixed;inset:0;z-index:9999;background:rgba(12,24,52,.9);display:flex;flex-direction:column;align-items:center;padding:calc(env(safe-area-inset-top) + 18px) 18px calc(env(safe-area-inset-bottom) + 20px);box-sizing:border-box;overflow-y:auto;overflow-x:hidden;color:${INK};transition:background 1s ease,opacity .3s ease;animation:sn-fade .3s ease both;touch-action:manipulation}
.sn-dark{background:rgba(4,8,22,.97)}
.sn-closing{opacity:0}
.sn-x{position:absolute;right:14px;top:calc(env(safe-area-inset-top) + 12px);z-index:3;width:44px;height:44px;border-radius:50%;border:2.5px solid ${INK};background:#FFF6E5;font-size:24px;line-height:1;color:${INK};cursor:pointer}
.sn-say-row{align-self:stretch;min-height:44px;margin-right:56px;display:flex;align-items:center}
.sn-otter-say{background:#FFF6E5;border:2.5px solid ${INK};border-radius:16px;padding:7px 12px;font-size:16px;font-weight:700;word-break:keep-all;animation:sn-pop .3s cubic-bezier(.3,1.5,.5,1) both}
.sn-stage{position:relative;width:300px;height:360px;flex:none;margin-top:6px}
.sn-halo{position:absolute;left:130px;top:-20px;width:240px;height:240px;margin-left:-120px;border-radius:50%;background:radial-gradient(circle,rgba(255,243,176,.35),rgba(255,243,176,0) 70%);transition:opacity 1s ease,transform 1s ease;opacity:.6}
.sn-halo-on{opacity:1;transform:scale(1.25);animation:sn-breathe 1.1s ease-in-out infinite}
.sn-halo-soft{opacity:.85}
.sn-arm{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.sn-arm-line{stroke-dasharray:260;stroke-dashoffset:260;animation:sn-draw .55s cubic-bezier(.3,1.3,.5,1) .25s forwards}
.sn-paw{opacity:0;animation:sn-pawin .2s ease .7s forwards}
.sn-held-pos{position:absolute;left:45px;top:10px}
.sn-held-in{transform-origin:20% 90%;animation:sn-reach .7s cubic-bezier(.3,1.5,.5,1) .3s both}
.sn-bob{animation:sn-bob 4s ease-in-out infinite alternate}
.sn-shake{animation:sn-shake .5s ease-in-out .6s 2}
.sn-zzu{position:absolute;right:-6px;top:120px;font-size:20px;font-weight:800;color:#FFF6E5;transform:rotate(10deg);opacity:0;animation:sn-zzu 1.2s ease .3s both;pointer-events:none}
.sn-rope{position:absolute;left:52px;top:132px;cursor:grab;touch-action:none;display:flex;flex-direction:column;align-items:center;outline:none;z-index:2}
.sn-rope-ready svg{animation:sn-tug 1.2s ease-in-out infinite}
.sn-rope-hint{font-size:14px;font-weight:700;color:#FFF6E5;min-height:18px}
.sn-dudung{position:absolute;left:0;right:0;top:168px;text-align:center;font-size:32px;font-weight:800;color:#FFF6E5;text-shadow:2px 2px 0 ${INK};animation:sn-dudung 1.6s ease both;z-index:2}
.sn-face{position:absolute;left:-20px;bottom:-8px;animation:sn-facein .45s cubic-bezier(.3,1.5,.5,1) both}
.sn-giggle{animation:sn-giggle .35s ease-in-out infinite alternate}
.sn-bottom{width:100%;max-width:380px;margin-top:auto;display:flex;flex-direction:column;align-items:stretch;gap:10px;padding-top:14px}
.sn-chips{display:flex;flex-wrap:wrap;gap:8px}
.sn-chip{font-size:14px;color:${INK};background:#FFF6E5;border:2.5px solid ${INK};border-radius:999px;padding:8px 12px;cursor:pointer}
.sn-ask{display:flex}
.sn-input{flex:1;min-width:0;height:52px;font-size:16px;padding:0 16px;border:3px solid ${INK};border-radius:16px;background:#FFFFFF;color:${INK};outline:none}
.sn-input:focus{box-shadow:0 0 0 3px #FFD23F}
.sn-hint{text-align:center;font-size:13px;color:#DCE6FF}
.sn-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.sn-card{background:#FFF6E5;border:3px solid ${INK};border-radius:22px;box-shadow:0 5px 0 ${INK};padding:14px 16px;display:flex;flex-direction:column;gap:10px;animation:sn-pop .4s cubic-bezier(.3,1.5,.5,1) both}
.sn-card-cap{font-size:13px;color:#4A4458}
.sn-play-row{display:flex;align-items:center;gap:12px}
.sn-play{width:46px;height:46px;flex:none;border-radius:50%;background:#4D3F73;border:3px solid ${INK};display:flex;align-items:center;justify-content:center;cursor:pointer}
.sn-play:disabled{opacity:.6}
.sn-wave{flex:1;display:flex;align-items:center;gap:3px;height:40px}
.sn-wave span{display:block;width:4px;border-radius:2px;background:#B7ADD6}
.sn-wave-on span{background:#4D3F73;animation:sn-wave .5s ease-in-out infinite alternate}
.sn-quote{font-size:20px;font-weight:800;line-height:1.35;word-break:keep-all}
.sn-btns{display:flex;gap:10px}
.sn-btn{flex:1;height:52px;font-size:16px;font-weight:800;color:${INK};background:#FFF6E5;border:3px solid ${INK};border-radius:16px;box-shadow:0 4px 0 ${INK};cursor:pointer}
.sn-btn-mint{background:#74D3B4}
.sn-link{align-self:center;background:none;border:0;color:#DCE6FF;font-size:14px;text-decoration:underline;padding:10px;cursor:pointer}
.sn-empty{text-align:center;font-size:24px;font-weight:800;color:#FFF6E5;padding:10px 0 6px;animation:sn-pop .4s cubic-bezier(.3,1.5,.5,1) both}

@keyframes sn-fade{from{opacity:0}to{opacity:1}}
@keyframes sn-pop{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
@keyframes sn-bob{from{transform:translateY(0)}to{transform:translateY(-6px)}}
@keyframes sn-wobble{from{transform:rotate(-10deg)}to{transform:rotate(8deg) translateY(-4px)}}
@keyframes sn-spin{to{transform:rotate(360deg)}}
@keyframes sn-breathe{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes sn-shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
@keyframes sn-tug{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}
@keyframes sn-dudung{0%{opacity:0;transform:scale(.6)}30%{opacity:1;transform:scale(1.1)}55%{transform:scale(1)}100%{opacity:1}}
@keyframes sn-giggle{from{transform:rotate(-6deg) translateY(0)}to{transform:rotate(6deg) translateY(-2px)}}
@keyframes sn-wave{from{transform:scaleY(.5)}to{transform:scaleY(1.1)}}
@keyframes sn-draw{to{stroke-dashoffset:0}}
@keyframes sn-pawin{to{opacity:1}}
@keyframes sn-reach{from{opacity:0;transform:translate(-60px,200px) scale(.25) rotate(-30deg)}to{opacity:1;transform:none}}
@keyframes sn-facein{from{opacity:0;transform:translateY(120px) scale(.6)}to{opacity:1;transform:none}}
@keyframes sn-zzu{0%{opacity:0;transform:rotate(10deg) translateX(-20px)}30%{opacity:1}70%{opacity:1}100%{opacity:0;transform:rotate(10deg) translateX(10px)}}
@keyframes sn-whoosh{0%{opacity:0;transform:translate(-50%,10px) scale(.7)}25%{opacity:1;transform:translate(-50%,0) scale(1.1)}100%{opacity:0;transform:translate(-50%,-30px) scale(1)}}
@media (prefers-reduced-motion: reduce){.sn-float-glow,.sn-float-body,.sn-spin,.sn-bob,.sn-shake,.sn-halo-on,.sn-rope-ready svg,.sn-giggle,.sn-wave-on span,.sn-held-in,.sn-face,.sn-zzu{animation:none}.sn-arm-line{animation:none;stroke-dashoffset:0}.sn-paw{animation:none;opacity:1}}
`;
