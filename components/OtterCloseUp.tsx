// components/OtterCloseUp.tsx
// ============================================================================
// 참견하러 온 수달 — 화면 앞으로 얼굴을 들이밀고 쪽지를 내미는 큰 수달.
// ----------------------------------------------------------------------------
// 평소 수달(Otter.tsx OtterBody/OtterSwim)은 작고 화면을 보지 않는다.
// 사용자가 예전에 한 말을 돌려줄 때만 이 큰 얼굴로 정면을 빤히 본다.
//   stare — 빤히(한쪽 눈썹만 올린 의심하는 눈). 다가와서 첫 마디 할 때.
//   smug  — 킹받는 웃음. "거봐. 또 빗나감."
//   wow   — 놀람. "헐 진짜 맞았네."
//   hmm   — 갸우뚱. "반만 쳐줄게."
// 색·선 굵기는 Otter.tsx와 같다(같은 수달). 좌표는 300×300, 얼굴 가운데 (150, 150).
// ============================================================================
"use client";
import { useEffect, useRef, useState } from "react";
import { OTTER } from "@/components/Otter";

export type CloseUpExpression = "stare" | "smug" | "wow" | "hmm";

const INK = OTTER.INK;
const ln = { stroke: INK, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

export default function OtterCloseUp({ expression = "stare", width = 320 }: { expression?: CloseUpExpression; width?: number }) {
  const e = expression;
  return (
    <svg viewBox="0 0 300 330" width={width} height={(width * 330) / 300} style={{ display: "block", overflow: "visible" }} aria-hidden>
      {/* 어깨 — 화면 아래로 이어진다 */}
      <path d="M18 330 C22 268 70 238 150 238 C230 238 278 268 282 330 Z" fill={OTTER.FUR} stroke={INK} strokeWidth={6} />
      <path d="M92 330 C96 290 120 270 150 270 C180 270 204 290 208 330 Z" fill={OTTER.FACE} />

      {/* 귀 */}
      <circle cx="40" cy={e === "wow" ? 92 : 104} r="21" fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={7} />
      <circle cx="260" cy={e === "wow" ? 92 : 104} r="21" fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={7} />
      <circle cx="43" cy={e === "wow" ? 95 : 107} r="8" fill="#6E4A2F" />
      <circle cx="257" cy={e === "wow" ? 95 : 107} r="8" fill="#6E4A2F" />

      {/* 머리 */}
      <path d="M18 160 C18 92 76 56 150 56 C224 56 282 92 282 160 C282 222 224 258 150 258 C76 258 18 222 18 160 Z" fill={OTTER.FUR} stroke={INK} strokeWidth={7} />
      <path d="M62 166 C62 122 98 104 150 104 C202 104 238 122 238 166 C238 208 202 234 150 234 C98 234 62 208 62 166 Z" fill={OTTER.FACE} />

      {/* 눈·눈썹 */}
      {e === "stare" && (
        <>
          {/* 왼쪽 눈썹만 높이 — "어? 뭐라고?" */}
          <path d="M70 96 Q96 70 122 92" {...ln} strokeWidth={7} />
          <path d="M178 120 L232 112" {...ln} strokeWidth={7} />
          {/* 왼쪽 눈은 크게 뜨고, 오른쪽은 반쯤 감고 빤히 */}
          <circle cx="98" cy="136" r="19" fill="#FFFFFF" stroke={INK} strokeWidth={5.5} />
          <circle cx="98" cy="139" r="9.5" fill={INK} />
          <circle cx="94" cy="134" r="3.4" fill="#FFFFFF" />
          <circle cx="202" cy="138" r="19" fill="#FFFFFF" stroke={INK} strokeWidth={5.5} />
          <circle cx="202" cy="141" r="9.5" fill={INK} />
          <path d="M181 138 C181 120 223 120 223 138 Z" fill={OTTER.FACE} stroke={INK} strokeWidth={5.5} strokeLinejoin="round" />
        </>
      )}
      {e === "smug" && (
        <>
          <path d="M72 104 L118 96 M182 96 L228 104" {...ln} strokeWidth={7} />
          <path d="M78 142 Q98 124 118 142" {...ln} strokeWidth={8} />
          <path d="M182 142 Q202 124 222 142" {...ln} strokeWidth={8} />
        </>
      )}
      {e === "wow" && (
        <>
          <path d="M72 88 L120 82 M180 82 L228 88" {...ln} strokeWidth={7} />
          <circle cx="98" cy="136" r="22" fill="#FFFFFF" stroke={INK} strokeWidth={5.5} />
          <circle cx="202" cy="136" r="22" fill="#FFFFFF" stroke={INK} strokeWidth={5.5} />
          <circle cx="98" cy="138" r="8" fill={INK} />
          <circle cx="202" cy="138" r="8" fill={INK} />
        </>
      )}
      {e === "hmm" && (
        <>
          <path d="M70 98 Q96 80 122 98 M180 112 L230 110" {...ln} strokeWidth={7} />
          <circle cx="98" cy="138" r="17" fill="#FFFFFF" stroke={INK} strokeWidth={5.5} />
          <circle cx="104" cy="134" r="8.5" fill={INK} />
          <circle cx="202" cy="140" r="13" fill="#FFFFFF" stroke={INK} strokeWidth={5.5} />
          <circle cx="208" cy="137" r="6.5" fill={INK} />
          <text x="248" y="70" fontFamily="Jua, sans-serif" fontSize="52" fill="#4D3F73" stroke={INK} strokeWidth={1.5}>?</text>
        </>
      )}

      {/* 주둥이 */}
      <ellipse cx="126" cy="200" rx="28" ry="23" fill={OTTER.MUZZLE} stroke={INK} strokeWidth={5.5} />
      <ellipse cx="174" cy="200" rx="28" ry="23" fill={OTTER.MUZZLE} stroke={INK} strokeWidth={5.5} />
      <circle cx="116" cy="196" r="3" fill={INK} />
      <circle cx="124" cy="208" r="3" fill={INK} />
      <circle cx="184" cy="196" r="3" fill={INK} />
      <circle cx="176" cy="208" r="3" fill={INK} />
      <path d="M98 194 L54 182 M98 206 L54 214 M202 194 L246 182 M202 206 L246 214" {...ln} strokeWidth={3.5} />

      {/* 코 */}
      <path d="M130 176 Q150 164 170 176 Q166 192 150 194 Q134 192 130 176 Z" fill={INK} />
      <ellipse cx="143" cy="174" rx="6" ry="3" fill="#FFFFFF" opacity={0.6} />

      {/* 입 */}
      {e === "stare" && <path d="M150 194 L150 204 M134 214 Q150 212 168 207" {...ln} strokeWidth={5} />}
      {e === "smug" && (
        <>
          <path d="M150 194 L150 204 M130 210 Q152 230 172 206" {...ln} strokeWidth={5} />
          <path d="M152 218 Q160 228 166 216" fill="#F27FA8" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
        </>
      )}
      {e === "wow" && <ellipse cx="150" cy="222" rx="10" ry="13" fill={INK} />}
      {e === "hmm" && <path d="M150 194 L150 204 M136 214 Q150 208 166 216" {...ln} strokeWidth={5} />}

      {/* 볼 */}
      <ellipse cx="72" cy="186" rx="16" ry="11" fill={OTTER.PINK} opacity={0.6} />
      <ellipse cx="228" cy="186" rx="16" ry="11" fill={OTTER.PINK} opacity={0.6} />

      {/* 놀람 땀 / 킹받음 반짝 */}
      {e === "wow" && <path d="M258 140 Q268 156 258 164 Q248 156 258 140 Z" fill="#9CDCFF" stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />}
      {e === "smug" && (
        <path d="M262 52 L266 64 L278 68 L266 72 L262 84 L258 72 L246 68 L258 64 Z" fill="#FFE066" stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
      )}
    </svg>
  );
}

// 쪽지를 쥔 두 앞발 — 쪽지(HTML 카드) 양옆 아래에 겹쳐 그린다.
export function OtterPaw({ side, size = 64 }: { side: "left" | "right"; size?: number }) {
  return (
    <svg viewBox="0 0 64 56" width={size} height={(size * 56) / 64} style={{ display: "block", overflow: "visible", transform: side === "right" ? "scaleX(-1)" : undefined }} aria-hidden>
      <path d="M6 54 C2 34 12 12 34 10 C52 8 62 22 58 36 C55 46 40 50 28 54 Z" fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
      <path d="M40 14 C46 18 48 26 46 32 M50 18 C55 22 56 28 54 34" {...ln} strokeWidth={3.5} />
      <ellipse cx="24" cy="34" rx="8" ry="6" fill="#E9A8B8" opacity={0.8} />
    </svg>
  );
}

// ============================================================================
// 걱정 병을 들고 다가온 수달 — 화면 전체 연출.
//   들어올 때: 바다가 어두워지고 → 얼굴이 아래에서 쑥 올라오고 → 대사 → 쪽지를 내민다.
//   답하면: 표정이 바뀌고(빗나감=킹받는 웃음, 맞음=놀람, 반쯤=갸우뚱) 한마디 + 적중률. 조금 뒤 저절로 돌아간다.
//   아무 데나 누르면(버튼 빼고) 바로 작아지며 아래로 돌아간다 — 오래 가리지 않게.
// ============================================================================

export type WorryAnswer = "hit" | "half" | "miss";
export interface WorryCloseUpStats {
  done: number;
  hit: number;
  half: number;
  miss: number;
  rate: number | null;
}

const ANSWER_FACE: Record<WorryAnswer, CloseUpExpression> = { hit: "wow", half: "hmm", miss: "smug" };

export function WorryCloseUp({
  when,
  worry,
  ask,
  done,
  busy,
  error,
  minForRate,
  verdict,
  onAnswer,
  onLeave,
}: {
  when: string; // "어제", "며칠 전" …
  worry: string;
  ask: string; // "야. 니가 이때 망할 것 같다며."
  done: { answer: WorryAnswer; line: string; stats: WorryCloseUpStats | null } | null;
  busy: boolean;
  error: string | null;
  minForRate: number;
  verdict: (rate: number) => string;
  onAnswer: (a: WorryAnswer | "later") => void;
  onLeave: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const leftRef = useRef(false);
  const leave = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    setLeaving(true);
    setTimeout(onLeave, 420);
  };
  // 답한 뒤엔 잠깐 보여주고 저절로 돌아간다
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(leave, 5200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const face: CloseUpExpression = done ? ANSWER_FACE[done.answer] : "stare";

  return (
    <div className={`ocu-root ${leaving ? "ocu-out" : ""}`} role="dialog" aria-label="참견이가 가져온 걱정 병" onClick={leave}>
      <style dangerouslySetInnerHTML={{ __html: CLOSEUP_CSS }} />
      <div className="ocu-dim" aria-hidden />
      <div className="ocu-stage">
        <div key={done ? "d" : "a"} className="ocu-say">
          {done ? done.line : ask}
        </div>
        <div className="ocu-face">
          <OtterCloseUp expression={face} width={340} />
        </div>
        <div className="ocu-note-wrap">
          <div className="ocu-note" onClick={stop}>
            <span className="ocu-when">{when} 니가 한 걱정</span>
            <p className="ocu-quote">“{worry}”</p>
            <span className="ocu-paw ocu-paw-l">
              <OtterPaw side="left" size={70} />
            </span>
            <span className="ocu-paw ocu-paw-r">
              <OtterPaw side="right" size={70} />
            </span>
          </div>
          {!done ? (
            <div className="ocu-actions" onClick={stop}>
              <div className="ocu-answers">
                <button className="ocu-btn ocu-hit" disabled={busy} onClick={() => onAnswer("hit")}>
                  맞았어
                </button>
                <button className="ocu-btn ocu-half" disabled={busy} onClick={() => onAnswer("half")}>
                  반쯤
                </button>
                <button className="ocu-btn ocu-miss" disabled={busy} onClick={() => onAnswer("miss")}>
                  빗나갔어
                </button>
              </div>
              <button className="ocu-later" disabled={busy} onClick={() => onAnswer("later")}>
                아직 몰라
              </button>
            </div>
          ) : (
            <div className="ocu-rate">
              {done.stats && done.stats.rate !== null ? (
                <>
                  <span className="ocu-rate-k">지금까지 니 걱정 적중률</span>
                  <span className="ocu-rate-n">{done.stats.rate}%</span>
                  <span className="ocu-rate-v">{verdict(done.stats.rate)}</span>
                </>
              ) : (
                <span className="ocu-rate-v">{Math.max(1, minForRate - (done.stats?.done ?? 0))}개만 더 열어보면 적중률 나와.</span>
              )}
            </div>
          )}
          {error && (
            <p className="ocu-err" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const CLOSEUP_CSS = `
.ocu-root{position:fixed;inset:0;z-index:160;display:flex;justify-content:center;font-family:'Jua',sans-serif;color:${INK};cursor:pointer;-webkit-tap-highlight-color:transparent}
.ocu-dim{position:absolute;inset:0;background:rgba(8,25,60,.5);animation:ocu-dim-in .35s ease both}
.ocu-out .ocu-dim{animation:ocu-dim-out .42s ease both}
@keyframes ocu-dim-in{from{opacity:0}to{opacity:1}}
@keyframes ocu-dim-out{from{opacity:1}to{opacity:0}}
.ocu-stage{position:relative;width:100%;max-width:440px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:calc(env(safe-area-inset-top,0px) + 70px) 20px calc(env(safe-area-inset-bottom,0px) + 28px)}
.ocu-say{max-width:100%;box-sizing:border-box;margin-bottom:14px;padding:12px 20px;background:#fff;border:3px solid ${INK};border-radius:24px;box-shadow:4px 4px 0 ${INK};font-size:22px;line-height:1.35;text-align:center;word-break:keep-all;animation:ocu-pop .35s cubic-bezier(.3,1.6,.5,1) .55s both}
.ocu-out .ocu-say{animation:ocu-fade .2s ease both}
@keyframes ocu-pop{from{transform:scale(.5);opacity:0}to{transform:none;opacity:1}}
@keyframes ocu-fade{to{opacity:0;transform:scale(.9)}}
.ocu-face{width:min(340px,88vw);animation:ocu-rise .62s cubic-bezier(.2,1.25,.4,1) both}
.ocu-face svg{width:100%!important;height:auto!important}
.ocu-out .ocu-face{animation:ocu-sink .42s cubic-bezier(.5,0,.8,.4) both}
@keyframes ocu-rise{0%{transform:translateY(70vh) scale(.35) rotate(-10deg)}70%{transform:translateY(-10px) scale(1.03) rotate(2deg)}100%{transform:none}}
@keyframes ocu-sink{to{transform:translateY(70vh) scale(.3) rotate(12deg)}}
.ocu-note-wrap{position:relative;width:min(310px,82vw);margin-top:calc(min(340px,88vw) * -0.36);animation:ocu-note .4s cubic-bezier(.3,1.4,.5,1) .8s both}
.ocu-out .ocu-note-wrap{animation:ocu-fade .2s ease both}
@keyframes ocu-note{from{transform:translateY(40px) rotate(6deg);opacity:0}to{transform:none;opacity:1}}
.ocu-note{position:relative;background:#FFFDF6;border:3px solid ${INK};border-radius:10px;box-shadow:4px 4px 0 ${INK};padding:14px 18px 16px;transform:rotate(-2deg);cursor:default}
.ocu-when{font-size:13px;color:rgba(27,22,48,.5)}
.ocu-quote{margin:4px 0 0;font-size:23px;line-height:1.35;word-break:keep-all}
.ocu-paw{position:absolute;bottom:-26px;pointer-events:none}
.ocu-paw-l{left:-38px}
.ocu-paw-r{right:-38px}
.ocu-actions{margin-top:38px;display:flex;flex-direction:column;align-items:center;cursor:default}
.ocu-answers{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}
.ocu-btn{font-family:'Jua',sans-serif;font-size:17px;color:${INK};padding:11px 2px;border:2.5px solid ${INK};border-radius:16px;box-shadow:3px 3px 0 ${INK};cursor:pointer}
.ocu-btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 ${INK}}
.ocu-btn:disabled{opacity:.55;cursor:default}
.ocu-btn:focus-visible,.ocu-later:focus-visible{outline:3px dashed #FFE066;outline-offset:2px}
.ocu-hit{background:#F9C7DC}
.ocu-half{background:#FFD26F}
.ocu-miss{background:#74D3B4}
.ocu-later{margin-top:10px;border:0;background:none;font-family:'Jua',sans-serif;font-size:15px;color:rgba(255,255,255,.85);text-decoration:underline;cursor:pointer;padding:6px}
.ocu-rate{margin-top:36px;display:flex;flex-direction:column;align-items:center;gap:2px;color:#fff;text-shadow:0 2px 0 ${INK};text-align:center;animation:ocu-pop .35s cubic-bezier(.3,1.6,.5,1) .15s both}
.ocu-rate-k{font-size:14px;opacity:.85}
.ocu-rate-n{font-size:48px;line-height:1.05;font-variant-numeric:tabular-nums;color:#FFE066;-webkit-text-stroke:1.5px ${INK}}
.ocu-rate-v{font-size:17px;line-height:1.4;word-break:keep-all}
.ocu-err{margin:10px 0 0;text-align:center;font-size:14px;color:#FFD0D6}
@media (prefers-reduced-motion: reduce){
  .ocu-dim,.ocu-say,.ocu-face,.ocu-note-wrap,.ocu-rate{animation:none!important}
}
`;
