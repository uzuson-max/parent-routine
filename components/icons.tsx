
// 참견이 브랜드북(손그림/Y2K 톤앤매너)에 맞춘 픽토그램 세트.
// 전부 순수 시각 요소 — 클릭 동작이나 데이터 로직은 없고, 쓰는 쪽(TimelineScreen 등)에서
// 버튼/네비 아이템에 끼워 넣어 currentColor로 색을 물려받는다.
// 새 아이콘이 필요해지면 이 파일에만 추가하면 된다 (재사용 가능한 하나의 아이콘 시스템).

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function IconHome(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" {...props}>
      <path d="M8 24 L24 10 L40 24" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 21 V38 H35 V21" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M20 30 q4 -4 8 0 v8 h-8 Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconRecord(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" {...props}>
      <rect x="11" y="8" width="26" height="34" rx="4" stroke="currentColor" strokeWidth="3.2" />
      <path d="M17 18 h14 M17 25 h14 M17 32 h8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconMemory(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M9 26 c0 -10 8 -16 15 -16 s15 6 15 16 c0 4 -2 6 -4 8 l-1 6 -20 0 -1 -6 c-2 -2 -4 -4 -4 -8 Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M18 34 h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M24 8 C17 8 13 13 13 20 v8 l-4 6 h30 l-4 -6 v-8 c0 -7 -4 -12 -11 -12 Z"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path d="M20 38 q4 5 8 0" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M14 10 c-3 1 -4 4 -3 7 2 8 10 16 18 18 3 1 6 0 7 -3 l2 -5 -8 -4 -2 4 c-4 -2 -8 -6 -10 -10 l4 -2 -4 -8 Z"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconGear(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" {...props}>
      <circle cx="24" cy="24" r="7" stroke="currentColor" strokeWidth="3.2" />
      <path
        d="M24 8 v6 M24 34 v6 M8 24 h6 M34 24 h6 M12 12 l4 4 M32 32 l4 4 M36 12 l-4 4 M16 32 l-4 4"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconChart(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" {...props}>
      <path d="M9 40 h30" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <rect x="12" y="26" width="7" height="14" stroke="currentColor" strokeWidth="2.6" />
      <rect x="22" y="18" width="7" height="22" stroke="currentColor" strokeWidth="2.6" />
      <rect x="32" y="10" width="7" height="30" stroke="currentColor" strokeWidth="2.6" />
    </svg>
  );
}

export function IconInvite(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" {...props}>
      <circle cx="17" cy="18" r="6" stroke="currentColor" strokeWidth="3.2" />
      <path d="M8 38 c0 -8 6 -12 9 -12 s9 4 9 12" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M33 20 h9 M37.5 15.5 v9" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconMore(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" {...props}>
      <path d="M9 24 q15 -10 30 0 q-15 12 -30 0 Z" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" />
      <circle cx="18" cy="24" r="2.4" fill="currentColor" />
      <circle cx="24" cy="24" r="2.4" fill="currentColor" />
      <circle cx="30" cy="24" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function IconMic(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2.4" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12 18v3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
