// components/OtterCueView.tsx
"use client";

import { OtterFace } from "@/components/Otter";
import type { OtterCue } from "@/lib/otterCues";

// ============================================================================
// 참견이 반응 하나를 그린다 — 무엇을 할지는 lib/otterCues.ts가 정하고, 여기는 그림/움직임만.
// 말이 없는 반응(line=null)은 표정과 짧은 움직임(끄덕/깡총/두리번)만 보인다.
// ============================================================================

export default function OtterCueView({
  cue,
  cueKey,
  idleExpression = "base",
  size = 54,
  side = "right",
}: {
  cue: OtterCue | null;
  cueKey: number;
  idleExpression?: OtterCue["expression"];
  size?: number;
  side?: "right" | "left"; // 말풍선이 얼굴의 어느 쪽에 뜨는지
}) {
  const expr = cue?.expression ?? idleExpression;
  const motion = cue?.motion ? `oc-${cue.motion}` : "";
  return (
    <div className="oc-root" style={{ flexDirection: side === "right" ? "row" : "row-reverse" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <span key={"f" + cueKey} className={`oc-face ${motion}`} aria-hidden>
        <OtterFace expression={expr} size={size} />
      </span>
      {cue?.line && (
        <span key={"s" + cueKey} className={`oc-say oc-say-${side}`} role="status">
          {cue.line}
        </span>
      )}
    </div>
  );
}

const CSS = `
.oc-root{display:flex;align-items:center;gap:6px;min-width:0}
.oc-face{display:block;flex-shrink:0}
.oc-face svg{display:block}
.oc-nod{animation:oc-nod .5s ease-in-out 2}
@keyframes oc-nod{0%,100%{transform:none}50%{transform:translateY(4px) rotate(-4deg)}}
.oc-hop{animation:oc-hop .6s cubic-bezier(.3,1.6,.5,1)}
@keyframes oc-hop{0%{transform:translateY(0)}40%{transform:translateY(-12px) rotate(6deg)}100%{transform:none}}
.oc-peek{animation:oc-peek .6s cubic-bezier(.3,1.5,.5,1) both}
@keyframes oc-peek{from{transform:translateY(16px) scale(.6);opacity:0}to{transform:none;opacity:1}}
.oc-look{animation:oc-look 1.2s ease-in-out}
@keyframes oc-look{0%,100%{transform:none}30%{transform:rotate(-10deg)}65%{transform:rotate(8deg)}}
.oc-say{min-width:0;max-width:240px;padding:7px 12px;background:#fff;border:2.5px solid #1B1630;border-radius:16px;box-shadow:2px 2px 0 #1B1630;font-size:15px;line-height:1.35;word-break:keep-all;animation:oc-say .3s cubic-bezier(.3,1.5,.5,1) both}
@keyframes oc-say{from{transform:scale(.7);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion: reduce){.oc-nod,.oc-hop,.oc-peek,.oc-look,.oc-say{animation:none}}
`;
