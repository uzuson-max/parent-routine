
import type { CSSProperties } from "react";

// ============================================================================
// 참견이 디자인 시스템 v2 — "cute + sophisticated + tactile"
// ----------------------------------------------------------------------------
// 이전 시스템(neo-brutalist: 검정 하드 보더 + 동색 오프셋 섀도우 + 900 weight 남발)에서
// 벗어나, 캐릭터/일러스트의 그래픽 언어는 그대로 두고 "UI 표면"만 물성 있는 오브젝트처럼
// 보이게 바꾼다. 화면 파일들은 BRAND(색) + surface(표면 톤) + shadow(ambient 그림자) +
// radius + tactile(버튼/카드/인풋 완성 스타일)를 가져다 쓴다.
//
// 원칙:
// 1) 검정색 하드 보더+하드 섀도우로 계층을 만들지 않는다 — surface 톤 차이 + ambient shadow로 만든다.
// 2) 버튼은 단색 도형이 아니라 "얹힌 오브젝트"다 — inner highlight + translucent border + soft shadow.
// 3) 화면 하나에 강한 accent 색은 1개만 — 나머지는 neutral surface.
// 4) 캐릭터(마스코트)와 "참견이 등장" 같은 스탬프류는 예외적으로 진한 라인/스티커 느낌을 유지해도 된다
//    (character = expressive graphic, UI = refined tactile object).
// ============================================================================

// --- 브랜드 팔레트 -----------------------------------------------------------
export const BRAND = {
  // 표면 계층(surface hierarchy) — 색상 대비 대신 이 4단계 톤 차이로 화면의 층을 만든다.
  bg: "#FBF5E8", // 가장 아래 레이어 — warm cream 배경
  surface: "#FFFCF5", // 배경 위에 얹힌 일반 표면(말풍선/섹션 배경) — 배경보다 살짝 밝음
  card: "#FFFFFF", // surface보다 한 단계 더 위로 떠 있는 카드
  input: "#F2ECDD", // card보다 한 단계 가라앉은(sunken) 입력 표면
  // (레거시 값 — 아직 참조하는 곳이 있으면 card와 동일하게 취급)
  primary: "#4D3F73",

  // 포인트 컬러 — 화면 하나당 1개만 강하게 쓴다. 나머지는 옅은(Pale) 배지/도트에만.
  pink: "#EFA9C7",
  pinkPale: "#FBEAF2",
  yellow: "#EFB94E",
  yellowPale: "#FBF0DC",
  mint: "#63BEA0",
  mintPale: "#E7F5EE",

  // 검정 — 스티커 스타일(마스코트 말풍선 스탬프, 캐릭터 아웃라인) 전용. 일반 UI 표면에는 쓰지 않는다.
  border: "#171219",

  ink: "#221C2C", // 기본 텍스트
  lavender: "#8977B8", // 앱 전체의 유일한 primary accent
  lavenderPale: "#EDE6F7",
  lavenderDeep: "#4D3F73",
  lavenderSoft: "#A497C9", // lavender보다 한 톤 밝은 값 — 그라데이션/하이라이트용
} as const;

// --- 반투명 텍스트 컬러 ------------------------------------------------------
export const textAlpha = {
  soft: "rgba(77, 63, 115, 0.75)",
  muted: "rgba(77, 63, 115, 0.65)",
  faint: "rgba(77, 63, 115, 0.55)",
  hairline: "rgba(77, 63, 115, 0.15)",
} as const;

export const inkAlpha = {
  soft: "rgba(34, 28, 44, 0.78)",
  muted: "rgba(34, 28, 44, 0.62)",
  faint: "rgba(34, 28, 44, 0.46)",
  hairline: "rgba(34, 28, 44, 0.10)",
} as const;

// --- Radius 스케일 -----------------------------------------------------------
// pill(999)/원형은 마이크 버튼 같은 "의도된" 오브젝트에만 남기고, 나머지는 완만한 라운드로 낮춘다.
export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

// --- Ambient shadow ----------------------------------------------------------
// 강한 drop shadow(하드 오프셋) 대신, opacity 낮고 blur 넓고 거리 짧은 "표면 높이 차이" 그림자.
export const shadow = {
  none: "none",
  hairline: "0 1px 2px rgba(34,28,44,0.05)",
  // 표면 위에 얹힌 카드/입력창
  sm: "0 1px 1px rgba(34,28,44,0.04), 0 3px 8px rgba(34,28,44,0.05)",
  md: "0 1px 2px rgba(34,28,44,0.05), 0 6px 16px rgba(34,28,44,0.07)",
  lg: "0 2px 4px rgba(34,28,44,0.05), 0 14px 28px rgba(34,28,44,0.09)",
  // 버튼 전용 — 눌렀을 때 더 짧아지는 짝(pressed)과 세트로 쓴다
  button: "0 1px 1px rgba(34,28,44,0.05), 0 8px 18px rgba(34,28,44,0.10)",
  buttonPressed: "0 1px 1px rgba(34,28,44,0.05), 0 2px 6px rgba(34,28,44,0.08)",
  // lavender 톤 그림자(라벤더 배경 카드/버튼 위에 얹을 때 검은 그림자보다 자연스럽다)
  lavender: "0 2px 4px rgba(77,63,115,0.10), 0 10px 22px rgba(77,63,115,0.16)",
  // 캐릭터/스탬프 전용 — 유일하게 남겨두는 "스티커" 느낌(섹션 4 예외)
  sticker: "2px 3px 0px rgba(23,18,25,0.9)",
} as const;

// --- 얇은 테두리 --------------------------------------------------------------
// 검정 하드 보더 대신 표면과 거의 같은 톤의 얇은 라인 + 카드 상단의 옅은 inner highlight.
export const border = {
  onCream: `1px solid rgba(34,28,44,0.08)`,
  onCard: `1px solid rgba(34,28,44,0.07)`,
  onLavender: `1px solid rgba(255,255,255,0.30)`,
  hairlineInk: `1px solid ${inkAlpha.hairline}`,
} as const;

const innerHighlight = "inset 0 1px 0 rgba(255,255,255,0.55)";
const innerHighlightOnLavender = "inset 0 1px 0 rgba(255,255,255,0.22)";

// --- Tactile 컴포넌트 스타일 팩토리 -------------------------------------------
// 화면마다 버튼/카드/인풋을 손으로 다시 그리지 않도록, 공통 "만질 수 있는 오브젝트" 스타일을
// 여기서 만들어 내보낸다. 화면은 이 값에 색/크기만 spread해서 얹는다.

export const tactile = {
  // 메인 CTA — 유일하게 강한 accent(lavender)를 쓰는 버튼
  primaryButton: {
    border: border.onLavender,
    borderRadius: radius.lg,
    background: `linear-gradient(180deg, ${BRAND.lavenderSoft} 0%, ${BRAND.lavender} 100%)`,
    color: "#fff",
    boxShadow: `${innerHighlightOnLavender}, ${shadow.lavender}`,
    cursor: "pointer",
  } as CSSProperties,

  // 보조 버튼 — neutral surface 위에 얹힌 오브젝트
  secondaryButton: {
    border: border.onCard,
    borderRadius: radius.md,
    background: `linear-gradient(180deg, #FFFFFF 0%, ${BRAND.surface} 100%)`,
    color: BRAND.ink,
    boxShadow: `${innerHighlight}, ${shadow.sm}`,
    cursor: "pointer",
  } as CSSProperties,

  // 텍스트만 있는 조용한 버튼(취소/뒤로 등) — 표면 없이 톤으로만 존재
  ghostButton: {
    border: "1px solid transparent",
    borderRadius: radius.md,
    background: "transparent",
    color: inkAlpha.muted,
    cursor: "pointer",
  } as CSSProperties,

  // 카드(surface 위에 얹힌 콘텐츠 영역)
  card: {
    background: BRAND.surface,
    border: border.onCream,
    borderRadius: radius.lg,
    boxShadow: `${innerHighlight}, ${shadow.md}`,
  } as CSSProperties,

  // 강조 카드(라벤더 톤) — 검정 보더 대신 lavender 자체 톤 안에서 진하기 차이로 강조
  cardAccent: {
    background: BRAND.lavenderPale,
    border: `1px solid rgba(77,63,115,0.18)`,
    borderRadius: radius.lg,
    boxShadow: `${innerHighlight}, ${shadow.lavender}`,
  } as CSSProperties,

  // 입력창 — card보다 가라앉은(sunken) 표면. 튀어나온 버튼과 반대 방향의 그림자(안쪽)로 "패인" 느낌.
  input: {
    background: BRAND.input,
    border: border.onCream,
    borderRadius: radius.md,
    boxShadow: "inset 0 1px 3px rgba(34,28,44,0.07)",
    color: BRAND.ink,
  } as CSSProperties,

  // 뱃지/칩 — pill 남발 방지를 위해 완만한 radius 기본값. 정말 작은 스탬프류만 pill 유지.
  badge: {
    background: BRAND.lavenderPale,
    color: BRAND.lavenderDeep,
    border: `1px solid rgba(77,63,115,0.16)`,
    borderRadius: radius.sm,
  } as CSSProperties,

  // "참견이 등장" 같은 캐릭터 스탬프 — 유일하게 스티커 느낌(진한 라인+하드 섀도우)을 허용하는 자리.
  stamp: {
    background: BRAND.yellow,
    color: BRAND.ink,
    border: `1.5px solid ${BRAND.border}`,
    boxShadow: shadow.sticker,
    borderRadius: radius.sm,
  } as CSSProperties,
} as const;

// --- Typography 스케일 --------------------------------------------------------
// 전역 900 weight 남발 대신 위계별로 weight를 분리한다. 캐릭터 말풍선 대사는 예외적으로
// 더 개성 있게(700~800) 남겨도 되지만, 화면 전체 타이틀/라벨을 다 굵게 만들지 않는다.
export const typography = {
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" } as CSSProperties,
  headline: { fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" } as CSSProperties,
  heroNumber: { fontSize: 44, fontWeight: 700, letterSpacing: "0.02em" } as CSSProperties,
  body: { fontSize: 15, fontWeight: 500 } as CSSProperties,
  bodyStrong: { fontSize: 15, fontWeight: 700 } as CSSProperties,
  sub: { fontSize: 13, fontWeight: 500 } as CSSProperties,
  ctaLabel: { fontSize: 16, fontWeight: 700 } as CSSProperties,
  bubbleLine: { fontSize: 15, fontWeight: 700 } as CSSProperties, // 캐릭터 대사 — 살짝 더 personality
} as const;

// --- 자주 쓰는 press 클래스 이름(globals.css에 정의) ---------------------------
// 버튼/카드에 className="tactile-press"만 얹으면 tap 시 짧은 depth 변화가 생긴다.
export const TACTILE_PRESS_CLASS = "tactile-press";
export const TACTILE_LIFT_CLASS = "tactile-lift-in";

// --- 페이지 배경 ---------------------------------------------------------------
// 크림 배경 — 완전 플랫 컬러로 두면 밋밋해서, 아주 은은한 대각선 그라데이션과
// 촘촘한 도트 패턴을 얹어 살짝 질감을 준다. 구조/레이아웃에는 영향 없는 순수 배경 스타일이라
// 모든 화면 컨테이너에 그대로 spread해서 쓴다.
// 2026-09: 홈 등 여러 화면이 시계/상단 아이콘과 겹치고 화면이 세로로 길어져 스크롤되는
// 문제 수정. app/globals.css의 body가 이미 padding-top/bottom: env(safe-area-inset-*)로
// 노치·홈 인디케이터 영역을 확보해두고 있는데, 모든 화면 컨테이너가 여기에 다시 100dvh
// (기기 화면 전체 높이, 안전영역 포함)를 그대로 요구해서 "body 여백 + 100dvh"만큼
// 실제 화면보다 커져 버렸던 게 원인 — 그래서 상단 마스코트가 밀려 내려오지 못해 시계와
// 겹치는 것처럼 보이고, 하단은 화면 밖으로 밀려나 스크롤이 생겼다. body가 이미 확보한
// 안전영역만큼을 여기서 빼줘서 "body 여백 + 이 minHeight"가 정확히 화면 한 장 높이가
// 되게 맞춘다. 모든 화면이 이 pageBackground를 그대로 spread해서 쓰기 때문에 여기 한 곳만
// 고치면 전체 화면에 다 적용된다.
export const pageBackground: CSSProperties = {
  minHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))",
  backgroundColor: BRAND.bg,
  backgroundImage:
    "radial-gradient(rgba(77,63,115,0.04) 1px, transparent 1.5px), " +
    "linear-gradient(165deg, #FFFCF4 0%, #FBF5E8 55%, #F7EEDC 100%)",
  backgroundSize: "7px 7px, 100% 100%",
};
