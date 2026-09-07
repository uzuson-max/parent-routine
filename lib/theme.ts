
import type { CSSProperties } from "react";

// 참견이 앱 전체가 공유하는 브랜드 컬러 토큰.
// 무드보드 레퍼런스(크림 배경 + 딥퍼플 + 핑크/옐로우/민트 포인트) 기준으로 전체 팔레트를 교체.
// 이전엔 온보딩에서만 쓰던 하늘색 팔레트를 앱 전체로 확장했었는데, 이번엔 그 팔레트 자체를
// 이 무드보드 색으로 통째로 바꿨다. 화면 파일들은 전부 이 BRAND 하나만 보고 색을 가져다 쓴다.
export const BRAND = {
  bg: "#FFF6E5", // 크림 — 모든 화면의 기본 배경
  card: "#FFFFFF", // 카드/입력창/뱃지 등 콘텐츠 영역 배경 (크림 위에서 도드라지도록 흰색)
  primary: "#4D3F73", // 딥퍼플 — 헤드라인/본문 텍스트 + 라벨 + 아이콘 등 메인 브랜드 컬러
  pink: "#F9C7DC", // 포인트 핑크 — 말풍선/제한적 강조 전용
  yellow: "#FFD26F", // 포인트 옐로우 — 버튼/스탬프/강조
  mint: "#74D3B4", // 포인트 민트 — 작은 뱃지/도트 등 보조 강조
  border: "#111", // 스티커 스타일 테두리/그림자 — 팔레트와 무관하게 항상 검정 계열 유지
} as const;

// 자주 쓰는 BRAND.primary 반투명 버전들 — 화면마다 rgba 값을 따로 계산하지 않도록.
// #4D3F73 = rgb(77, 63, 115)
export const textAlpha = {
  soft: "rgba(77, 63, 115, 0.75)",
  muted: "rgba(77, 63, 115, 0.65)",
  faint: "rgba(77, 63, 115, 0.55)",
  hairline: "rgba(77, 63, 115, 0.15)",
} as const;

// 크림 배경 — 완전 플랫 컬러로 두면 밋밋해서, 아주 은은한 대각선 그라데이션과
// 촘촘한 도트 패턴을 얹어 살짝 질감을 준다. 구조/레이아웃에는 영향 없는 순수 배경 스타일이라
// 모든 화면 컨테이너에 그대로 spread해서 쓴다.
export const pageBackground: CSSProperties = {
  backgroundColor: BRAND.bg,
  backgroundImage:
    "radial-gradient(rgba(77,63,115,0.05) 1px, transparent 1.5px), " +
    "linear-gradient(165deg, #FFFBF3 0%, #FFF6E5 55%, #FFF0DA 100%)",
  backgroundSize: "7px 7px, 100% 100%",
};
