
import type { CSSProperties } from "react";

// 참견이 앱 전체가 공유하는 브랜드 컬러 토큰.
// 원래 온보딩 화면에서만 쓰던 하늘색/아이보리/노랑/피치 팔레트를 앱 전체로 확장하면서
// 여러 파일에 같은 hex를 중복 선언하지 않도록 여기 한 곳으로 모았다.
export const BRAND = {
  sky: "#86A9D5", // 메인 브랜드 컬러 — 기존 #C71585 대체
  skyDeep: "#7CA0CE", // sky보다 살짝 짙은 톤 — 텍스처/작은 강조용
  skyLight: "#94B6DE", // sky보다 살짝 밝은 톤 — 텍스처용
  ivory: "#FFF9EF", // 콘텐츠/카드 배경
  yellow: "#F5D77E", // 포인트 — 버튼/작은 강조
  peach: "#F2B7A5", // 포인트 — 말풍선/제한적 강조 전용
  text: "#3F3835", // 순수 검정 대신 짙은 브라운
  border: "#111", // 스티커 스타일 테두리/그림자 — 팔레트와 무관하게 항상 검정 유지
} as const;

// 자주 쓰는 BRAND.text 반투명 버전들 — 화면마다 rgba 값을 따로 계산하지 않도록.
export const textAlpha = {
  soft: "rgba(63, 56, 53, 0.75)",
  muted: "rgba(63, 56, 53, 0.65)",
  faint: "rgba(63, 56, 53, 0.55)",
  hairline: "rgba(63, 56, 53, 0.15)",
} as const;

// 하늘색 단색 배경 — TWICE 채널 배너처럼 완전한 플랫 컬러로 두면 "똑같이 따라했다"는 느낌이 나서,
// 은은한 대각선 그라데이션과 촘촘한 도트 패턴을 얹어 살짝 다른 질감을 준다.
// 구조/레이아웃에는 영향 없는 순수 배경 스타일이라 모든 화면 컨테이너에 그대로 spread해서 쓴다.
export const texturedSkyBackground: CSSProperties = {
  backgroundColor: BRAND.sky,
  backgroundImage:
    "radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1.5px), " +
    `linear-gradient(165deg, ${BRAND.skyLight} 0%, ${BRAND.sky} 55%, ${BRAND.skyDeep} 100%)`,
  backgroundSize: "7px 7px, 100% 100%",
};
