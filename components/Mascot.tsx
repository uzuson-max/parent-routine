// components/Mascot.tsx
// ============================================================================
// 참견이 포즈 — 예전엔 사막여우 일러스트 PNG 12장(public/mascot/*.png)이었다.
// 2026-10-11부터 참견이는 수달이라, 같은 포즈 이름을 수달 얼굴 표정(components/Otter.tsx)에 연결한다.
// PNG 파일은 지우지 않고 남겨둔다(되돌릴 때 이 파일만 예전 버전으로 바꾸면 된다).
// ============================================================================

import { OtterFace, type OtterExpression } from "@/components/Otter";

export const MASCOT_POSES = {
  기본: "base",
  말을거는: "base",
  갸우뚱: "tilt",
  궁금: "tilt",
  기억남: "remember",
  확인: "base",
  진지: "base",
  새침: "proud",
  조언: "base",
  놀람: "surprise",
  웃음: "laugh",
  자신감: "proud",
} as const satisfies Record<string, OtterExpression>;

export type MascotPose = keyof typeof MASCOT_POSES;

interface MascotProps {
  pose?: MascotPose;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Mascot({ pose = "기본", size = 88, className, style }: MascotProps) {
  return (
    <span role="img" aria-label="참견이" className={className} style={{ display: "block", width: size, ...style }}>
      <OtterFace expression={MASCOT_POSES[pose]} size={size} />
    </span>
  );
}
