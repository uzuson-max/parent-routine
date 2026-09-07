
"use client";

// 참견이 강아지 마스코트 — 하나의 컴포넌트로 관리하고, pose만 바꿔서 여러 화면에서 재사용한다.
// 실제 일러스트 파일은 public/mascot/*.png 로 들어간다 (이미지 바이너리라 코드블록으로는 못 옮기니
// 별도 파일로 전달받은 걸 그 경로에 넣어주면 됨). 지금은 홈 화면에서 쓸 포즈 2개만 준비했고,
// 나중에 다른 화면을 옮길 때 이 MASCOT_POSES에 필요한 포즈를 계속 추가하면 된다.
const MASCOT_POSES = {
  기본: "/mascot/default.png",
  말을거는: "/mascot/talking.png",
} as const;

export type MascotPose = keyof typeof MASCOT_POSES;

interface MascotProps {
  pose?: MascotPose;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Mascot({ pose = "기본", size = 88, className, style }: MascotProps) {
  return (
    <img
      src={MASCOT_POSES[pose]}
      alt="참견이"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: "auto", display: "block", ...style }}
    />
  );
}
