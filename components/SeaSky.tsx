// components/SeaSky.tsx
"use client";

// ============================================================================
// 바다 위 — 홈 맨 위에 늘 보이는 하늘과 먼바다.
// ----------------------------------------------------------------------------
// 화면이 위에서 잘린 것처럼 보이지 않게, 물속 세계 위로 "바다 위"를 조금 열어둔다.
//   - 하늘: 낮엔 파란 하늘 + 해 + 천천히 흘러가는 구름, 밤엔 남색 하늘 + 달 + 별
//   - 수평선 위 작은 섬(야자수 두 그루)
//   - 먼바다 위를 조각배 하나가 아주 천천히 노 저으며 왼쪽↔오른쪽 오간다(뱃사공은 밀짚모자)
//   - 맨 아래 흰 물결선이 수면 — 그 아래부터 물속(components/Sea.tsx). 걱정 병은 이 수면에 떠 있다.
// 눌러지는 것은 없다(장식). 움직임 줄이기 설정이면 전부 멈춘다.
// 높이는 Sea.tsx의 SKY_PX — 아래 레이아웃 숫자(수평선/배 위치)는 그 높이 기준이다.
// ============================================================================

const INK = "#1B1630";

export default function SeaSky({ night, height }: { night: boolean; height: number }) {
  return (
    <div
      className={`ssk-root ${night ? "ssk-night" : ""}`}
      style={{
        height: `calc(env(safe-area-inset-top, 0px) + ${height}px)`,
        background: night
          ? "linear-gradient(#0F2148 0%, #1D3B6E 55%, #36639A 100%)"
          : "linear-gradient(#4FB4EE 0%, #8FD3F7 45%, #D4F1FF 100%)",
      }}
      aria-hidden
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* 해 / 달 */}
      {night ? (
        <svg className="ssk-orb" width="30" height="30" viewBox="0 0 30 30">
          <path d="M20 3 A12 12 0 1 0 27 21 A10 10 0 1 1 20 3 Z" fill="#FFF3B8" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
        </svg>
      ) : (
        <svg className="ssk-orb ssk-sun" width="40" height="40" viewBox="0 0 40 40">
          <g className="ssk-rays">
            {Array.from({ length: 8 }).map((_, i) => (
              <path
                key={i}
                d="M20 2 L20 7"
                stroke="#FFB52E"
                strokeWidth={3}
                strokeLinecap="round"
                transform={`rotate(${i * 45} 20 20)`}
              />
            ))}
          </g>
          <circle cx="20" cy="20" r="10" fill="#FFD84A" stroke={INK} strokeWidth={2.4} />
        </svg>
      )}

      {/* 별(밤) */}
      {night &&
        STARS.map(([l, t, s, d], i) => (
          <span key={i} className="ssk-star" style={{ left: `${l}%`, top: `calc(env(safe-area-inset-top, 0px) + ${t}px)`, width: s, height: s, animationDelay: `${d}s` }} />
        ))}

      {/* 구름 — 오른쪽에서 왼쪽으로 아주 천천히 */}
      {CLOUDS.map((c, i) => (
        <svg
          key={i}
          className="ssk-cloud"
          width={c.w}
          height={c.w * 0.5}
          viewBox="0 0 100 50"
          style={{ top: `calc(env(safe-area-inset-top, 0px) + ${c.top}px)`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s`, opacity: night ? 0.45 : 1 }}
        >
          <path
            d="M14 42 C3 42 2 28 13 27 C12 15 28 10 35 19 C39 7 60 5 64 19 C72 12 88 17 84 29 C97 29 97 42 86 42 Z"
            fill="#FFFFFF"
            stroke={INK}
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
          <path d="M24 34 C30 37 38 37 44 34" fill="none" stroke="#C9E8F7" strokeWidth={3} strokeLinecap="round" />
        </svg>
      ))}

      {/* 먼바다 — 수평선부터 수면까지 */}
      <div className="ssk-far" style={{ background: night ? "linear-gradient(#2F6EA8, #3E8FCB)" : "linear-gradient(#3DB3EA, #8BE0FA)" }}>
        {GLINTS.map(([l, b, w, d], i) => (
          <span key={i} className="ssk-glint" style={{ left: `${l}%`, bottom: b, width: w, animationDelay: `${d}s`, opacity: night ? 0.5 : 0.9 }} />
        ))}
      </div>

      {/* 작은 섬 — 수평선 위 */}
      <svg className="ssk-island" width="92" height="58" viewBox="0 0 92 58">
        <path d="M6 54 C16 42 30 38 46 38 C62 38 76 42 86 54 Z" fill={night ? "#C9A35F" : "#F6D589"} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
        {/* 야자수 1 */}
        <path d="M42 41 C41 30 43 20 47 12" fill="none" stroke={INK} strokeWidth={5.5} strokeLinecap="round" />
        <path d="M42 41 C41 30 43 20 47 12" fill="none" stroke="#B8763E" strokeWidth={3} strokeLinecap="round" />
        <g className="ssk-palm">
          <path d="M47 12 C40 5 30 6 25 13 C32 10 39 11 47 14 Z" fill="#3FBF6E" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M47 12 C54 4 66 5 70 13 C62 10 55 11 47 14 Z" fill="#46C985" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M47 12 C45 2 51 -2 58 1 C53 3 50 7 48 13 Z" fill="#2FAF6A" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M47 13 C42 16 37 22 37 28 C41 22 45 18 48 15 Z" fill="#2FAF6A" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        </g>
        {/* 야자수 2 (작은 것) */}
        <path d="M58 43 C58 37 60 32 63 28" fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />
        <path d="M58 43 C58 37 60 32 63 28" fill="none" stroke="#B8763E" strokeWidth={2.2} strokeLinecap="round" />
        <g className="ssk-palm" style={{ animationDelay: "-1.3s" }}>
          <path d="M63 28 C58 23 51 24 48 29 C53 27 58 28 63 30 Z" fill="#46C985" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
          <path d="M63 28 C68 22 76 23 79 29 C74 27 68 28 63 30 Z" fill="#3FBF6E" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
        </g>
        <circle cx="49" cy="15" r="2.4" fill="#8A5A3C" stroke={INK} strokeWidth={1.2} />
      </svg>

      {/* 조각배 — 먼바다를 천천히 오간다 */}
      <div className="ssk-boat-track">
        <div className="ssk-boat-flip">
          <div className="ssk-boat-rock">{boatSvg(night)}</div>
        </div>
      </div>
    </div>
  );
}

function boatSvg(night: boolean) {
  return (
    <svg width="64" height="44" viewBox="0 0 64 44" style={{ overflow: "visible", display: "block" }}>
      {/* 노(뒤쪽) */}
      <g className="ssk-oar ssk-oar-back">
        <path d="M30 22 L50 40" stroke={INK} strokeWidth={4} strokeLinecap="round" />
        <path d="M30 22 L50 40" stroke="#C89B6D" strokeWidth={2} strokeLinecap="round" />
        <ellipse cx="51" cy="41" rx="5" ry="2.6" transform="rotate(42 51 41)" fill="#C89B6D" stroke={INK} strokeWidth={1.6} />
      </g>
      {/* 사람 */}
      <path d="M24 30 C24 22 27 18 32 18 C37 18 40 22 40 30 Z" fill="#FF8FB3" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      <circle cx="32" cy="12" r="6" fill="#FFD9B8" stroke={INK} strokeWidth={2.2} />
      {night ? (
        <path d="M33.5 12 Q35 13.5 36.5 12" fill="none" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      ) : (
        <circle cx="35" cy="12" r="1.2" fill={INK} />
      )}
      <ellipse cx="32" cy="7.5" rx="10" ry="2.6" fill="#FFD26F" stroke={INK} strokeWidth={2} />
      <path d="M26.5 7 C27 2 37 2 37.5 7 Z" fill="#FFD26F" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <path d="M27 6 L37 6" stroke="#FF5E7E" strokeWidth={1.6} />
      {/* 배 */}
      <path d="M4 28 L60 28 C57 37 50 40 32 40 C14 40 7 37 4 28 Z" fill="#C8834A" stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      <path d="M8 32 L56 32" stroke="#A0632F" strokeWidth={2} strokeLinecap="round" />
      {/* 노(앞쪽) */}
      <g className="ssk-oar">
        <path d="M34 22 L54 40" stroke={INK} strokeWidth={4.2} strokeLinecap="round" />
        <path d="M34 22 L54 40" stroke="#E2B07A" strokeWidth={2.2} strokeLinecap="round" />
        <ellipse cx="55" cy="41" rx="5.5" ry="2.8" transform="rotate(42 55 41)" fill="#E2B07A" stroke={INK} strokeWidth={1.8} />
      </g>
      {/* 배 아래 물결 */}
      <path className="ssk-wake" d="M0 41 Q8 37 16 41 T32 41 T48 41 T64 41" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" opacity={night ? 0.5 : 0.9} />
    </svg>
  );
}

const CLOUDS = [
  { w: 92, top: 26, dur: 150, delay: -40 },
  { w: 64, top: 58, dur: 190, delay: -120 },
  { w: 78, top: 12, dur: 170, delay: -95 },
];
// [left %, top px, size, delay]
const STARS: [number, number, number, number][] = [
  [8, 20, 3, 0],
  [22, 46, 2, -1.2],
  [36, 14, 3, -2.1],
  [52, 52, 2, -0.6],
  [64, 24, 3, -1.7],
  [86, 50, 2, -2.6],
  [94, 18, 3, -0.9],
];
// [left %, bottom px, width px, delay]
const GLINTS: [number, number, number, number][] = [
  [10, 30, 14, 0],
  [28, 14, 20, -1.1],
  [46, 32, 10, -2.3],
  [60, 10, 16, -0.7],
  [80, 26, 12, -1.8],
  [92, 8, 18, -2.9],
];

const CSS = `
.ssk-root{position:absolute;left:0;right:0;top:0;z-index:5;overflow:hidden;pointer-events:none}
.ssk-orb{position:absolute;left:22%;top:calc(env(safe-area-inset-top,0px) + 66px)}
.ssk-rays{transform-box:fill-box;transform-origin:50% 50%;animation:ssk-spin 30s linear infinite}
@keyframes ssk-spin{to{transform:rotate(360deg)}}
.ssk-star{position:absolute;border-radius:50%;background:#FFF6D8;animation:ssk-twinkle 3s ease-in-out infinite}
@keyframes ssk-twinkle{0%,100%{opacity:.25}50%{opacity:1}}
.ssk-cloud{position:absolute;left:100%;overflow:visible;animation:ssk-drift linear infinite}
@keyframes ssk-drift{from{transform:translateX(30px)}to{transform:translateX(calc(-100vw - 160px))}}
.ssk-far{position:absolute;left:0;right:0;bottom:0;height:46px;border-top:2.5px solid rgba(27,22,48,.55)}
.ssk-glint{position:absolute;height:3px;border-radius:3px;background:#FFFFFF;animation:ssk-glint 3.4s ease-in-out infinite}
@keyframes ssk-glint{0%,100%{transform:scaleX(.4);opacity:.2}50%{transform:scaleX(1)}}
.ssk-island{position:absolute;right:9%;bottom:42px;overflow:visible}
.ssk-palm{transform-box:fill-box;transform-origin:50% 100%;animation:ssk-palm 3.6s ease-in-out infinite alternate}
@keyframes ssk-palm{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}
.ssk-boat-track{position:absolute;bottom:10px;left:4%;width:64px;animation:ssk-row 110s ease-in-out infinite}
@keyframes ssk-row{0%{left:4%}48%{left:calc(96% - 64px)}52%{left:calc(96% - 64px)}100%{left:4%}}
.ssk-boat-flip{animation:ssk-flip 110s step-end infinite}
@keyframes ssk-flip{0%{transform:scaleX(1)}50%{transform:scaleX(-1)}100%{transform:scaleX(1)}}
.ssk-boat-rock{transform-origin:50% 90%;animation:ssk-rock 2.8s ease-in-out infinite alternate}
@keyframes ssk-rock{from{transform:translateY(-1px) rotate(-3deg)}to{transform:translateY(2px) rotate(3deg)}}
.ssk-oar{transform-box:view-box;transform-origin:32px 22px;animation:ssk-oar 1.7s ease-in-out infinite}
@keyframes ssk-oar{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(16deg)}}
.ssk-wake{animation:ssk-wake 1.7s ease-in-out infinite}
@keyframes ssk-wake{0%,100%{opacity:.2}50%{opacity:.9}}
.ssk-night .ssk-boat-track,.ssk-night .ssk-boat-flip{animation-duration:160s}
.ssk-night .ssk-oar,.ssk-night .ssk-wake{animation-duration:2.6s}
@media (prefers-reduced-motion: reduce){
  .ssk-rays,.ssk-star,.ssk-cloud,.ssk-glint,.ssk-palm,.ssk-boat-track,.ssk-boat-flip,.ssk-boat-rock,.ssk-oar,.ssk-wake{animation:none}
  .ssk-cloud{transform:translateX(-50vw)}
  .ssk-boat-track{left:18%}
}
`;
