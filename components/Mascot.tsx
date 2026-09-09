
"use client";

// 참견이 강아지 마스코트 — 하나의 컴포넌트로 관리하고, pose만 바꿔서 여러 화면에서 재사용한다.
// 실제 일러스트 파일은 public/mascot/*.png 로 들어간다 (이미지 바이너리라 코드블록으로는 못 옮기니
// 별도 파일로 전달받은 걸 그 경로에 넣어주면 됨).
// 2026-09-09: 마스코트 디자인이 새 캐릭터(참견이 표정 시트)로 교체되면서 기본/말을거는 파일도
// 새 이미지로 바뀌었고, 나머지 10개 표정도 함께 추가함. 배경은 전부 투명 PNG.
const MASCOT_POSES = {
  기본: "/mascot/00_today.png",       // "오늘도 여기 있어."
  말을거는: "/mascot/01_question.png", // "니가 아까 뭐라고 했더라?"
  갸우뚱: "/mascot/02_confused.png",   // "그게 무슨 말이야?"
  궁금: "/mascot/03_curious.png",      // "근데 그거 어떻게 됐어?"
  기억남: "/mascot/04_remember.png",   // "니가 저번에 말했잖아."
  확인: "/mascot/05_checking.png",     // "약속한 거, 확인해볼까?"
  진지: "/mascot/06_serious.png",      // "그거... 진심이야?"
  새침: "/mascot/07_shy.png",          // "흥. 아무것도 아니야."
  조언: "/mascot/08_advice.png",       // "내 스타일대로 조언해줄까?"
  놀람: "/mascot/09_surprised.png",    // "어! 깜짝이야."
  웃음: "/mascot/10_laughing.png",     // "하하하! 재미있네."
  자신감: "/mascot/11_confident.png",  // "다 계획이 있어!"
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
