
import type { CSSProperties } from "react";

// 참견이 앱 전체가 공유하는 브랜드 컬러 토큰.
// 무드보드 레퍼런스(크림 배경 + 딥퍼플 + 핑크/옐로우/민트 포인트) 기준으로 전체 팔레트를 교체.
// 이전엔 온보딩에서만 쓰던 하늘색 팔레트를 앱 전체로 확장했었는데, 이번엔 그 팔레트 자체를
// 이 무드보드 색으로 통째로 바꿨다. 화면 파일들은 전부 이 BRAND 하나만 보고 색을 가져다 쓴다.
export const BRAND = {
  bg: "#FFF6E5", // 크림 — 모든 화면의 기본 배경
  card: "#FFFFFF", // 카드/입력창/뱃지 등 콘텐츠 영역 배경 (크림 위에서 도드라지도록 흰색)
  primary: "#4D3F73", // 딥퍼플 — (레거시) 아직 마이그레이션 전인 화면들의 메인 텍스트 컬러. 신규 화면은 ink/lavenderDeep을 쓴다
  pink: "#F9C7DC", // 포인트 핑크 — 말풍선/제한적 강조 전용
  pinkPale: "#FDEBF2", // 핑크 카드/뱃지 배경용 옅은 톤
  yellow: "#FFD26F", // 포인트 옐로우 — 버튼/스탬프/강조
  yellowPale: "#FFF3D9", // 옐로우 카드/뱃지 배경용 옅은 톤
  mint: "#74D3B4", // 포인트 민트 — 작은 뱃지/도트 등 보조 강조
  mintPale: "#E4F7F0", // 민트 카드/뱃지 배경용 옅은 톤
  border: "#111", // 스티커 스타일 테두리/그림자 — 팔레트와 무관하게 항상 검정 계열 유지
  // --- 마스코트/브랜드북(참견이 손그림 디자인 시스템) 신규 토큰 ---
  // 화면을 새 디자인 시스템으로 옮길 때부터는 primary 대신 아래 값들을 쓴다.
  ink: "#1E1A26", // 신규 기본 텍스트 + 손그림 선 컬러 (거의 블랙)
  lavender: "#8977B8", // 신규 핵심 포인트 컬러 (버튼/아이콘 강조)
  lavenderPale: "#EDE6F7", // 라벤더 카드/말풍선 배경용 옅은 톤
  lavenderDeep: "#4D3F73", // 진한 라벤더 — 라벨/강조 텍스트 (기존 primary와 같은 값)
} as const;

// 자주 쓰는 BRAND.primary 반투명 버전들 — 화면마다 rgba 값을 따로 계산하지 않도록.
// #4D3F73 = rgb(77, 63, 115)
// (레거시 — 마이그레이션 전 화면들이 계속 사용. 신규 화면은 아래 inkAlpha를 쓴다)
export const textAlpha = {
  soft: "rgba(77, 63, 115, 0.75)",
  muted: "rgba(77, 63, 115, 0.65)",
  faint: "rgba(77, 63, 115, 0.55)",
  hairline: "rgba(77, 63, 115, 0.15)",
} as const;

// BRAND.ink(#1E1A26 = rgb(30, 26, 38)) 반투명 버전들 — 신규 디자인 시스템 화면용.
export const inkAlpha = {
  soft: "rgba(30, 26, 38, 0.78)",
  muted: "rgba(30, 26, 38, 0.65)",
  faint: "rgba(30, 26, 38, 0.5)",
  hairline: "rgba(30, 26, 38, 0.15)",
} as const;

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
    "radial-gradient(rgba(77,63,115,0.05) 1px, transparent 1.5px), " +
    "linear-gradient(165deg, #FFFBF3 0%, #FFF6E5 55%, #FFF0DA 100%)",
  backgroundSize: "7px 7px, 100% 100%",
};
