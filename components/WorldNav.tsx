// components/WorldNav.tsx
"use client";

import { IconHome, IconRecord, IconLetter, IconGear, IconBottle } from "@/components/icons";
import { playFx } from "@/lib/fx";

// ============================================================================
// 어항 세계 공통 틀 — 홈과 같은 노란 도트 벽, 잉크색 굵은 외곽선, Jua.
//
// 하단 탭은 "사용자가 앱을 여는 이유" 3가지로 나눈다:
//   어항      — 지금 내 어항 어떻게 됐지?
//   소라      — 소라 징검다리, 하루에 소라 하나 (2026-10-15 "강" → 10-16 "조개" → 10-17 "소라" — app/screens/RiverScreen.tsx)
//   걱정 병   — 니 걱정, 진짜 몇 %나 맞았어? (2026-10-14 "지난 어항" 자리를 바꿈 — 지난 어항은 MY > 기록 보기에서)
//   편지      — 참견이가 나한테 뭐라고 했지? (편지 + 참견이가 알아챈 거)
// 설정(MY)은 자주 안 쓰니 탭이 아니라 홈 오른쪽 위 작은 아이콘으로 둔다.
// ============================================================================

export const WALL = "#FFE9A8";
export const INK = "#1B1630";
export const YELLOW = "#FFD23F";

export type WorldTab = "home" | "river" | "worries" | "letters" | "archive";

export const worldPage: React.CSSProperties = {
  minHeight: "100dvh",
  boxSizing: "border-box",
  maxWidth: "480px",
  marginLeft: "auto",
  marginRight: "auto",
  overflowX: "hidden",
  fontFamily: "'Jua', sans-serif",
  color: INK,
  backgroundColor: WALL,
  backgroundImage: "radial-gradient(#FFDA78 17%, transparent 18%)",
  backgroundSize: "34px 34px",
  paddingTop: "max(16px, calc(env(safe-area-inset-top, 0px) + 10px))",
  paddingLeft: "20px",
  paddingRight: "20px",
  paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
};

export const stickerCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: `3px solid ${INK}`,
  borderRadius: 22,
  boxShadow: `4px 4px 0 ${INK}`,
};

// 주의: 여기에 @import(폰트 등)를 넣지 말 것. <style> 안에 @import가 있으면 아이폰은 그 파일을 다 받을 때까지
// 이 CSS 전체를 적용하지 않아서, 탭바가 잠깐 회색 기본 버튼으로 깨져 보였다(처음 켤 때 반짝임의 원인).
// Jua 폰트는 app/layout.tsx의 <link>로 한 번만 받는다.
export const WORLD_CSS = `
button { font-family: inherit; }
.wn-nav { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0 10px; border: 0; background: transparent; color: rgba(27,22,48,.5); font-family: 'Jua', sans-serif; font-size: 12px; cursor: pointer; -webkit-tap-highlight-color: transparent; position: relative; }
.wn-nav:disabled { opacity: .4; cursor: default; }
.wn-nav-on { color: ${INK}; }
.wn-nav-on svg { background: ${YELLOW}; border: 2.5px solid ${INK}; border-radius: 12px; padding: 2px 10px; box-sizing: content-box; }
.wn-sticker:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 ${INK} !important; }
.wn-nav:focus-visible, .wn-sticker:focus-visible { outline: 3px dashed ${INK}; outline-offset: 4px; }
`;

export function BottomNav({
  active,
  onNavigate,
  unreadLetterCount = 0,
  disabled = false,
}: {
  active: WorldTab;
  onNavigate: (tab: WorldTab) => void;
  unreadLetterCount?: number;
  disabled?: boolean;
}) {
  const items: { tab: WorldTab; label: string; icon: JSX.Element }[] = [
    { tab: "home", label: "어항", icon: <IconHome style={{ width: 22, height: 22 }} /> },
    { tab: "river", label: "소라", icon: <IconConch style={{ width: 22, height: 22 }} /> },
    { tab: "worries", label: "걱정이", icon: <IconBottle style={{ width: 22, height: 22 }} /> },
    { tab: "letters", label: "편지", icon: <IconLetter style={{ width: 22, height: 22 }} /> },
  ];
  return (
    <nav style={navStyle} aria-label="주요 메뉴">
      <style dangerouslySetInnerHTML={{ __html: WORLD_CSS }} />
      {items.map((it) =>
        it.tab === active ? (
          <div key={it.tab} className="wn-nav wn-nav-on" aria-current="page">
            {it.icon}
            <span>{it.label}</span>
          </div>
        ) : (
          <button
            key={it.tab}
            className="wn-nav"
            disabled={disabled}
            onClick={() => {
              playFx("buttonPress");
              onNavigate(it.tab);
            }}
            aria-label={
              it.tab === "letters" && unreadLetterCount > 0 ? `편지, 안 읽은 편지 ${unreadLetterCount}통` : it.label
            }
          >
            {it.icon}
            <span>{it.label}</span>
            {it.tab === "letters" && unreadLetterCount > 0 && (
              <span style={badgeStyle} aria-hidden>
                {unreadLetterCount > 9 ? "9+" : unreadLetterCount}
              </span>
            )}
          </button>
        )
      )}
    </nav>
  );
}

/** 소라 탭 아이콘 — 소라 하나(위로 작아지는 단 + 입구) */
function IconConch(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="translate(4 5) scale(0.84) rotate(24 24 26)">
        <path d="M10 28 Q12 17 24 16 Q36 17 38 28 Q38 42 24 44 Q10 42 10 28 Z" stroke="currentColor" strokeWidth="3.4" strokeLinejoin="round" />
        <path d="M15 18 Q18 9 24 8 Q30 9 33 18" stroke="currentColor" strokeWidth="3.4" strokeLinejoin="round" />
        <path d="M19 9 Q21 3 24 2 Q27 3 29 9" stroke="currentColor" strokeWidth="3.4" strokeLinejoin="round" />
        <path d="M24 27 Q35 25 37 34 Q36 42 27 42 Q22 36 24 27 Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** 탭 화면 머리 — 제목 하나. 홈만 로고 + MY 아이콘을 따로 그린다. */
export function WorldTitle({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: 48, marginBottom: 12 }}>
      {onBack && (
        <button className="wn-sticker" style={backStyle} onClick={onBack} aria-label="뒤로">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path d="M11 3 L5 9 L11 15" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 400, letterSpacing: "-0.5px", textShadow: "3px 3px 0 #FFFFFF" }}>
        {children}
      </h1>
    </div>
  );
}

export function MyButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className="wn-sticker"
      style={roundButton}
      disabled={disabled}
      onClick={() => {
        playFx("buttonPress");
        onClick();
      }}
      aria-label="MY 설정"
    >
      <IconGear style={{ width: 30, height: 30 }} />
    </button>
  );
}

const navStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: "50%",
  // translate3d + backfaceVisibility: 탭바를 자기만의 레이어로 띄워서, 뒤에서 움직이는 바다(물고기·기포·햇빛)가
  // 아이폰에서 탭바 위로 비쳐 반짝거리지 않게 한다.
  transform: "translate3d(-50%, 0, 0)",
  WebkitBackfaceVisibility: "hidden",
  backfaceVisibility: "hidden",
  isolation: "isolate",
  width: "100%",
  maxWidth: "480px",
  background: "#FFFFFF",
  borderTop: `3px solid ${INK}`,
  display: "flex",
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  zIndex: 100,
};

const badgeStyle: React.CSSProperties = {
  position: "absolute",
  top: 4,
  left: "calc(50% + 10px)",
  minWidth: 18,
  height: 18,
  padding: "0 4px",
  boxSizing: "border-box",
  borderRadius: 999,
  background: "#FF5B4A",
  border: `2px solid ${INK}`,
  color: "#fff",
  fontSize: 10,
  lineHeight: "14px",
  textAlign: "center",
};

const roundButton: React.CSSProperties = {
  position: "relative",
  width: 46,
  height: 46,
  borderRadius: "50%",
  border: `3px solid ${INK}`,
  background: "#FFFFFF",
  boxShadow: `3px 3px 0 ${INK}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  color: INK,
  cursor: "pointer",
};

const backStyle: React.CSSProperties = {
  ...roundButton,
  width: 40,
  height: 40,
  flexShrink: 0,
};
