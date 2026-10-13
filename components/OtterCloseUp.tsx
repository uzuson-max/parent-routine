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
  // 2026-10-13: 손그림 수달 얼굴(public/otter/*.webp)을 크게 쓴다. 아래 어깨만 같은 색 도형으로 받쳐서 화면 아래와 이어지게.
  const face = { stare: "face_stare", smug: "face_smug", wow: "face_surprise", hmm: "face_tilt" }[expression];
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: width, display: "flex", flexDirection: "column", alignItems: "center" }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/otter/${face}.webp`} alt="" draggable={false} style={{ position: "relative", zIndex: 1, display: "block", width: "100%", height: "auto" }} />
      <svg viewBox="0 0 300 90" width="100%" style={{ display: "block", marginTop: -26 }}>
        <path d="M40 90 C44 40 90 14 150 14 C210 14 256 40 260 90 Z" fill={OTTER.FUR} stroke="#45150F" strokeWidth={6} />
        <path d="M100 90 C104 58 124 44 150 44 C176 44 196 58 200 90 Z" fill="#FFF0D6" />
      </svg>
    </div>
  );
}

// 쪽지를 쥔 두 앞발 — 쪽지(HTML 카드) 양옆 아래에 겹쳐 그린다.
export function OtterPaw({ side, size = 64 }: { side: "left" | "right"; size?: number }) {
  return (
    <svg viewBox="0 0 64 56" width={size} height={(size * 56) / 64} style={{ display: "block", overflow: "visible", transform: side === "right" ? "scaleX(-1)" : undefined }} aria-hidden>
      <path d="M6 54 C2 34 12 12 34 10 C52 8 62 22 58 36 C55 46 40 50 28 54 Z" fill={OTTER.FUR} stroke="#45150F" strokeWidth={4.5} strokeLinejoin="round" />
      <path d="M40 14 C46 18 48 26 46 32 M50 18 C55 22 56 28 54 34" {...ln} stroke="#45150F" strokeWidth={3.5} />
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
.ocu-out .ocu-face{animation:ocu-sink .42s cubic-bezier(.5,0,.8,.4) both}
@keyframes ocu-rise{0%{transform:translateY(70vh) scale(.35) rotate(-10deg)}70%{transform:translateY(-10px) scale(1.03) rotate(2deg)}100%{transform:none}}
@keyframes ocu-sink{to{transform:translateY(70vh) scale(.3) rotate(12deg)}}
.ocu-note-wrap{position:relative;width:min(310px,82vw);margin-top:calc(min(340px,88vw) * -0.2);animation:ocu-note .4s cubic-bezier(.3,1.4,.5,1) .8s both}
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
