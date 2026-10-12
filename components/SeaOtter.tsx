// components/SeaOtter.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { OtterBody, OtterSwim } from "@/components/Otter";
import type { Visit } from "@/lib/otterCues";

// ============================================================================
// 첫 화면에 놀러 온 참견이(수달). 언제·왜 오는지는 lib/otterCues.ts pickVisit이 정하고, 여기는 움직임만.
// ----------------------------------------------------------------------------
//   1) 화면 아래(심해 쪽)에서 헤엄쳐 올라온다
//   2) 목표 물고기 옆에 멈춰 서서(콕 찌르고) 할 말이 있으면 한마디 — 없으면 조약돌 굴리며 잠깐 놀기
//   3) 다시 아래로 헤엄쳐 집에 간다
// 머무는 동안 누르면 onTap(알람이면 알람 탭, 오래된 생각이면 그 생각 카드).
// 움직임 줄이기 설정이면 헤엄 없이 그 자리에 나타났다 사라진다.
// ============================================================================

type Phase = "in" | "stay" | "out";

const SWIM_W = 112;
const STAND_W = 74;

export default function SeaOtter({
  visit,
  containerRef,
  onPoke,
  onTap,
  onDone,
}: {
  visit: Visit & { seq: number };
  containerRef: React.RefObject<HTMLElement>;
  onPoke: (fishId: string) => void;
  onTap: (v: Visit) => void;
  onDone: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; ms: number }>({ x: 0, y: 0, ms: 0 });
  const [facing, setFacing] = useState<1 | -1>(1);
  const [phase, setPhase] = useState<Phase>("in");
  const [say, setSay] = useState<string | null>(null);
  const [tapped, setTapped] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const box = containerRef.current;
    if (!box) {
      doneRef.current();
      return;
    }
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* 못 읽으면 보통대로 */
    }
    const W = box.clientWidth || 375;
    const H = box.clientHeight || 700;

    // 목표 지점 — 물고기가 있으면 그 옆(물고기 쪽을 보게), 없으면 화면 가운데쯤 아무 데나
    let tx = W * (0.25 + Math.random() * 0.5);
    let ty = H * (0.42 + Math.random() * 0.2);
    let face: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const fishEl = visit.targetFishId ? (box.querySelector(`[data-lid="${CSS.escape(visit.targetFishId)}"]`) as HTMLElement | null) : null;
    if (fishEl) {
      const b = box.getBoundingClientRect();
      const f = fishEl.getBoundingClientRect();
      const fx = f.left - b.left + f.width / 2;
      const fy = f.top - b.top + f.height / 2;
      // 물고기가 오른쪽에 있으면 왼쪽에 서서 오른쪽을 보고, 반대도 마찬가지
      face = fx > W / 2 ? 1 : -1;
      tx = Math.min(W - STAND_W / 2 - 8, Math.max(STAND_W / 2 + 8, fx - face * (f.width / 2 + STAND_W / 2 + 4)));
      ty = Math.min(H - 150, Math.max(130, fy + 10));
    }
    // 말풍선이 화면 위 헤더/말풍선 자리와 겹치지 않게
    ty = Math.max(ty, visit.line ? 200 : 140);

    const startX = Math.min(W - 60, Math.max(60, tx + (Math.random() - 0.5) * 120));
    const startY = H + 70;
    const swimIn = reduce ? 0 : Math.min(3800, Math.max(2200, Math.hypot(tx - startX, ty - startY) * 6));
    const stay = visit.line ? 5200 : visit.kind === "wander" && !visit.targetFishId ? 4200 : 2600;
    const swimOut = reduce ? 0 : 2600;

    setFacing(tx >= startX ? 1 : -1);
    setPos({ x: startX, y: startY, ms: 0 });
    // 한 프레임 뒤에 출발해야 transition이 걸린다
    later(() => setPos({ x: tx, y: ty, ms: swimIn }), 40);
    later(() => {
      setFacing(face);
      setPhase("stay");
      if (visit.targetFishId) onPoke(visit.targetFishId);
      if (visit.line) setSay(visit.line);
    }, swimIn + 60);
    later(() => {
      setSay(null);
      setPhase("out");
      const ex = Math.min(W - 60, Math.max(60, tx + (Math.random() - 0.5) * 160));
      setFacing(ex >= tx ? 1 : -1);
      setPos({ x: ex, y: H + 90, ms: swimOut });
    }, swimIn + 60 + stay);
    later(() => doneRef.current(), swimIn + 60 + stay + swimOut + 80);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.seq]);

  const swimming = phase !== "stay";
  const expr = tapped ? "laugh" : visit.expression;
  const sayLeft = pos.x < 150; // 말풍선이 화면 밖으로 안 나가게

  return (
    <div
      className="so-root"
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: pos.ms ? `transform ${pos.ms}ms cubic-bezier(.42,.05,.32,1)` : "none",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: OTTER_VISIT_CSS }} />
      {say && (
        <div key={say} className={`so-say ${sayLeft ? "so-say-r" : ""}`} role="status">
          {say}
        </div>
      )}
      <button
        className={`so-body ${swimming ? "so-swim" : "so-stand"}`}
        style={{ transform: `scaleX(${facing})` }}
        aria-label={visit.kind === "alarm" ? "참견이 — 곧 울릴 알람 보기" : visit.kind === "old_fish" ? "참견이 — 그 생각 보기" : "참견이"}
        tabIndex={phase === "stay" ? 0 : -1}
        onClick={() => {
          if (phase !== "stay") return;
          setTapped(true);
          onTap(visit);
        }}
      >
        {swimming ? (
          <OtterSwim width={SWIM_W} expression="base" holding={visit.holding === "note" ? "note" : "none"} />
        ) : visit.kind === "wander" && !visit.targetFishId ? (
          <span className="so-play">
            <OtterBody pose="float" width={120} expression={expr === "base" ? "laugh" : expr} holding="pebble" />
          </span>
        ) : (
          <span className="so-pop">
            <OtterBody pose="upright" width={STAND_W} expression={expr} holding={visit.holding === "note" ? "note" : "none"} wave={visit.kind === "alarm"} />
          </span>
        )}
      </button>
    </div>
  );
}

const OTTER_VISIT_CSS = `
.so-root{position:absolute;left:0;top:0;z-index:16;width:0;height:0;pointer-events:none;will-change:transform}
.so-body{position:absolute;left:0;top:0;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent;transform-origin:center}
.so-swim{margin-left:-${SWIM_W / 2}px;margin-top:-30px;animation:so-bob 1.1s ease-in-out infinite alternate}
.so-stand{margin-left:-${STAND_W / 2}px;margin-top:-70px}
.so-body svg{display:block;overflow:visible}
.so-body:focus-visible{outline:3px dashed #fff;outline-offset:4px;border-radius:20px}
.so-pop{display:block;animation:so-pop .45s cubic-bezier(.3,1.6,.5,1) both}
@keyframes so-pop{from{transform:translateY(16px) scale(.8)}to{transform:none}}
.so-play{display:block;margin-left:-23px;animation:so-roll 2.2s ease-in-out infinite alternate}
@keyframes so-roll{from{transform:rotate(-6deg) translateY(-3px)}to{transform:rotate(5deg) translateY(4px)}}
@keyframes so-bob{from{translate:0 -4px}to{translate:0 4px}}
.so-root .otr-swim-tail{transform-box:fill-box;transform-origin:100% 50%;animation:so-wag .45s ease-in-out infinite alternate}
.so-root .otr-swim-paw{transform-box:fill-box;transform-origin:50% 0%;animation:so-paw .4s ease-in-out infinite alternate}
.so-root .otr-wave{animation:so-wave .5s ease-in-out 6 alternate}
.so-root .otr-tail{transform-box:fill-box;transform-origin:100% 50%;animation:so-wag 1.6s ease-in-out infinite alternate}
@keyframes so-wag{from{transform:rotate(-12deg)}to{transform:rotate(12deg)}}
@keyframes so-paw{from{transform:rotate(-20deg)}to{transform:rotate(20deg)}}
@keyframes so-wave{from{transform:rotate(-16deg)}to{transform:rotate(18deg)}}
.so-say{position:absolute;left:0;bottom:84px;transform:translateX(-82%);width:max-content;max-width:min(240px,70vw);padding:8px 13px;background:#fff;border:3px solid #1B1630;border-radius:18px;box-shadow:3px 3px 0 #1B1630;font-family:'Jua',sans-serif;font-size:16px;line-height:1.35;color:#1B1630;word-break:keep-all;pointer-events:none;animation:so-say .35s cubic-bezier(.3,1.5,.5,1) both}
.so-say-r{transform:translateX(-18%)}
@keyframes so-say{from{opacity:0;scale:.7}to{opacity:1;scale:1}}
@media (prefers-reduced-motion: reduce){.so-swim,.so-pop,.so-play,.so-say,.so-root .otr-swim-tail,.so-root .otr-swim-paw,.so-root .otr-wave,.so-root .otr-tail{animation:none}}
`;
