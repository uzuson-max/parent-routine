// components/SoraNim.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OtterFace, type OtterExpression } from "@/components/Otter";
import { authed, useVoicePlayer } from "@/lib/voicePlayer";
import { readTone } from "@/lib/tone";

// ============================================================================
// 소라님 — 심해 바닥, 수달네 아지트 옆에 사는 이웃. (2026-10-19)
// ----------------------------------------------------------------------------
// 앱 끄기 전에 바닥까지 내려와서 한 번 물어보고 줄 당기는 "의식".
//   물어봄 → 줄 당김 → (조용) 두둥 → 그때 니 목소리 3초 → 참견이 킥킥
// 소라님은 말로 털지 않는다. 니 목소리가 대답이다. 참견이는 옆에서 반응만 하는 관객.
// 꺼낼 말이 없으면 시큰둥하게 넘긴다("몰라.") — 원래 소라는 그래서 웃긴 거다.
// 기억 찾기: POST /api/sora/ask · 목소리: /api/stage/voice?entry=<id> (본인 녹음만, 10분 링크)
// ============================================================================

const INK = "#1B1630";

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

// 심해 바닥에 놓이는 소라님(components/DeepSea.tsx 안). 누르면 의식 화면이 열린다.
export default function SoraNim({ night = false }: { night?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <button className="sn-floor" onClick={() => setOpen(true)} aria-label="소라님한테 물어보기">
        <span className="sn-floor-glow" style={{ opacity: night ? 0.9 : 0.6 }} />
        <span className="sn-floor-body">
          <ConchArt width={70} />
        </span>
        <svg className="sn-floor-rope" width="18" height="34" viewBox="0 0 18 34" aria-hidden>
          <path d="M6 0 C 12 10, 2 18, 8 26" fill="none" stroke="#FFF6E5" strokeWidth={2.6} strokeLinecap="round" />
          <circle cx="9" cy="29" r="4.5" fill="#FFF6E5" stroke={INK} strokeWidth={2.4} />
        </svg>
        <span className="sn-floor-tag">소라님</span>
      </button>
      {open && mounted && createPortal(<Ritual onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

// ── 의식 화면 ────────────────────────────────────────────────
function Ritual({ onClose }: { onClose: () => void }) {
  const tone = useRef(readTone()).current;
  const player = useVoicePlayer();
  const [phase, setPhase] = useState<Phase>("ask");
  const [question, setQuestion] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [voiceOk, setVoiceOk] = useState<boolean | null>(null);
  const [otter, setOtter] = useState<{ face: OtterExpression; line: string }>({ face: "tilt", line: "소라님한테 물어볼 거 있어?" });
  const [emptyLine, setEmptyLine] = useState("");
  const [pullY, setPullY] = useState(0);
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
    later(onClose, 1500);
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
    <div className={`sn-overlay ${busy ? "sn-dark" : ""}`} role="dialog" aria-label="소라님">
      <button className="sn-x" onClick={onClose} aria-label="닫기">
        ×
      </button>

      {/* 참견이 — 옆에서 반응만 한다 */}
      <div className="sn-otter">
        <OtterFace expression={otter.face} size={56} className={otter.face === "laugh" ? "sn-giggle" : undefined} />
        {otter.line && (
          <div key={otter.line} className="sn-otter-say">
            {otter.line}
          </div>
        )}
      </div>

      {/* 소라님 + 줄 */}
      <div className="sn-stage">
        <div className={`sn-halo ${busy ? "sn-halo-on" : ""} ${phase === "answer" ? "sn-halo-soft" : ""}`} />
        <div className={busy ? "sn-shake" : "sn-bob"}>
          <ConchArt width={170} glow={busy || phase === "answer"} />
        </div>
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
              <button className="sn-btn" onClick={onClose}>
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
.sn-floor{position:absolute;left:22%;bottom:20px;z-index:3;transform:translateX(-50%);padding:0;margin:0;border:0;background:none;cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent;display:flex;flex-direction:column;align-items:center}
.sn-floor-glow{position:absolute;left:50%;top:50%;width:120px;height:120px;margin:-66px 0 0 -60px;border-radius:50%;background:radial-gradient(circle,rgba(255,243,176,.55),rgba(255,243,176,0) 70%);animation:sn-breathe 3.6s ease-in-out infinite;pointer-events:none}
.sn-floor-body{position:relative;display:block;animation:sn-bob 4.2s ease-in-out infinite alternate}
.sn-floor-rope{position:absolute;left:14px;top:52px}
.sn-floor-tag{position:absolute;top:-22px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:12px;font-weight:700;color:${INK};background:#FFF6E5;border:2px solid ${INK};border-radius:999px;padding:2px 8px}
.sn-floor:active .sn-floor-body{transform:scale(.94)}

.sn-overlay{position:fixed;inset:0;z-index:9999;background:rgba(12,24,52,.9);display:flex;flex-direction:column;align-items:center;padding:calc(env(safe-area-inset-top) + 18px) 18px calc(env(safe-area-inset-bottom) + 20px);box-sizing:border-box;overflow-y:auto;color:${INK};transition:background 1s ease;animation:sn-fade .35s ease both;touch-action:manipulation}
.sn-dark{background:rgba(4,8,22,.97)}
.sn-x{position:absolute;right:14px;top:calc(env(safe-area-inset-top) + 12px);width:44px;height:44px;border-radius:50%;border:2.5px solid ${INK};background:#FFF6E5;font-size:24px;line-height:1;color:${INK};cursor:pointer}
.sn-otter{align-self:flex-start;display:flex;align-items:center;gap:8px;min-height:60px;margin-right:56px}
.sn-otter-say{background:#FFF6E5;border:2.5px solid ${INK};border-radius:16px;padding:7px 12px;font-size:15px;font-weight:700;word-break:keep-all;animation:sn-pop .3s cubic-bezier(.3,1.5,.5,1) both}
.sn-giggle{animation:sn-giggle .35s ease-in-out infinite alternate}
.sn-stage{position:relative;display:flex;flex-direction:column;align-items:center;margin-top:18px;min-height:280px}
.sn-halo{position:absolute;left:50%;top:-10px;width:240px;height:240px;margin-left:-120px;border-radius:50%;background:radial-gradient(circle,rgba(255,243,176,.35),rgba(255,243,176,0) 70%);transition:opacity 1s ease,transform 1s ease;opacity:.6}
.sn-halo-on{opacity:1;transform:scale(1.25);animation:sn-breathe 1.1s ease-in-out infinite}
.sn-halo-soft{opacity:.8}
.sn-bob{position:relative;animation:sn-bob 4s ease-in-out infinite alternate}
.sn-shake{position:relative;animation:sn-shake .5s ease-in-out .6s 2}
.sn-rope{position:relative;margin-top:-34px;margin-left:-70px;cursor:grab;touch-action:none;display:flex;flex-direction:column;align-items:center;outline:none}
.sn-rope-ready svg{animation:sn-tug 1.2s ease-in-out infinite}
.sn-rope-hint{font-size:14px;font-weight:700;color:#FFF6E5;min-height:18px}
.sn-dudung{margin-top:18px;font-size:32px;font-weight:800;color:#FFF6E5;text-shadow:2px 2px 0 ${INK};animation:sn-dudung 1.6s ease both}
.sn-bottom{width:100%;max-width:380px;margin-top:auto;display:flex;flex-direction:column;align-items:stretch;gap:10px;padding-top:12px}
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
@keyframes sn-breathe{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes sn-shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
@keyframes sn-tug{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}
@keyframes sn-dudung{0%{opacity:0;transform:scale(.6)}30%{opacity:1;transform:scale(1.1)}55%{transform:scale(1)}100%{opacity:1}}
@keyframes sn-giggle{from{transform:rotate(-6deg) translateY(0)}to{transform:rotate(6deg) translateY(-2px)}}
@keyframes sn-wave{from{transform:scaleY(.5)}to{transform:scaleY(1.1)}}
@media (prefers-reduced-motion: reduce){.sn-floor-glow,.sn-floor-body,.sn-bob,.sn-shake,.sn-halo-on,.sn-rope-ready svg,.sn-giggle,.sn-wave-on span{animation:none}}
`;
