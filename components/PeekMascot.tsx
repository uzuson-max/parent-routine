// components/PeekMascot.tsx
// ============================================================================
// 어항 세계 안에서 쓰는 참견이 얼굴. 2026-10-11부터 참견이는 수달이다 — 그림은 components/Otter.tsx 한 곳에 있다.
// 이 파일은 예전 이름(PeekMascot)과 표정 이름을 그대로 받아서, 쓰는 화면들을 하나도 안 고쳐도 되게 한다.
//   base 기본 / tilt 갸우뚱 / surprise 놀람 / laugh 웃음
//   (+ remember 기억남 / proud 뿌듯 / sleep 쿨쿨 — 수달에서 새로 생긴 표정)
// ============================================================================

import { OtterFace, type OtterExpression } from "@/components/Otter";

export type PeekExpression = OtterExpression;

export default function PeekMascot({
  expression = "base",
  size = 96,
  className,
  style,
}: {
  expression?: PeekExpression;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return <OtterFace expression={expression} size={size} className={className} style={style} />;
}
