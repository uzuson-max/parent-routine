// components/PeekMascot.tsx
// ============================================================================
// 어항 세계 전용 "엿보는 참견이" 간략 얼굴.
// 평소에는 안 보이고, 할 말이 있을 때만 어항 가장자리에서 고개를 내민다.
// 전신/대사가 있는 12포즈 PNG(Mascot.tsx)는 문자·편지·홍보 같은 어항 밖에서 쓰고,
// 어항 안에서는 외곽선 굵기·색이 어항과 같은 이 SVG만 쓴다.
//   base     기본    — 물고기를 눌렀을 때 질문 하나
//   tilt     갸우뚱  — 궁금한 게 생겼을 때
//   surprise 놀람    — 숨었던 물고기가 돌아올 때
//   laugh    웃음    — 웃긴 말을 들었을 때
// ============================================================================

export type PeekExpression = "base" | "tilt" | "surprise" | "laugh";

const INK = "#1B1630";
const FUR = "#F4DDB8";
const PINK = "#F9C7DC";
const CREAM = "#FFF6E5";

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
  const tall = expression === "surprise";
  const tilt = expression === "tilt";
  const earL = tall ? "M15 48 L19 0 L47 34 Z" : "M14 50 L22 4 L48 36 Z";
  const earLi = tall ? "M22 39 L22 11 L40 33 Z" : "M22 40 L25 15 L40 35 Z";
  const earR = tilt ? "M86 50 L94 14 L56 36 Z" : tall ? "M85 48 L81 0 L53 34 Z" : "M86 50 L78 4 L52 36 Z";
  const earRi = tilt ? "M80 41 L88 22 L64 36 Z" : tall ? "M78 39 L78 11 L60 33 Z" : "M78 40 L75 15 L60 35 Z";
  const cheek = expression === "laugh" ? 6.5 : 5;
  const line = { stroke: INK, strokeLinecap: "round" as const, fill: "none" };

  const face = (
    <>
      <path d={earL} fill={FUR} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d={earLi} fill={PINK} />
      <path d={earR} fill={FUR} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d={earRi} fill={PINK} />
      <ellipse cx={50} cy={62} rx={36} ry={29} fill={FUR} stroke={INK} strokeWidth={3} />
      <ellipse cx={50} cy={74} rx={16} ry={10.5} fill={CREAM} stroke={INK} strokeWidth={2} />

      {expression === "base" && (
        <>
          <path d="M33 49 L42 51 M58 51 L67 49" {...line} strokeWidth={2.4} />
          <ellipse cx={38} cy={58} rx={3.2} ry={4} fill={INK} />
          <ellipse cx={62} cy={58} rx={3.2} ry={4} fill={INK} />
          <path d="M45 77 Q50 81 55 77" {...line} strokeWidth={2} />
        </>
      )}
      {tilt && (
        <>
          <path d="M32 47 Q37 42 43 47 M58 51 L67 50" {...line} strokeWidth={2.4} />
          <ellipse cx={38} cy={57} rx={3.6} ry={4.6} fill={INK} />
          <ellipse cx={62} cy={58} rx={2.8} ry={3.2} fill={INK} />
          <path d="M45 78 Q49 76 55 79" {...line} strokeWidth={2} />
        </>
      )}
      {tall && (
        <>
          <path d="M31 45 L42 43 M58 43 L69 45" {...line} strokeWidth={2.4} />
          <circle cx={38} cy={56} r={6.5} fill="#FFFFFF" stroke={INK} strokeWidth={2} />
          <circle cx={62} cy={56} r={6.5} fill="#FFFFFF" stroke={INK} strokeWidth={2} />
          <circle cx={38.5} cy={56.5} r={3} fill={INK} />
          <circle cx={62.5} cy={56.5} r={3} fill={INK} />
          <ellipse cx={50} cy={79} rx={3.6} ry={4.6} fill={INK} />
        </>
      )}
      {expression === "laugh" && (
        <>
          <path d="M32 59 Q38 51 44 59 M56 59 Q62 51 68 59" {...line} strokeWidth={2.8} />
          <path d="M42 75 Q50 88 58 75 Z" fill={INK} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
          <ellipse cx={50} cy={81} rx={4.2} ry={2.6} fill="#F27FA8" />
        </>
      )}

      <ellipse cx={50} cy={68} rx={5} ry={3.4} fill={INK} />
      <circle cx={27} cy={70} r={cheek} fill={PINK} />
      <circle cx={73} cy={70} r={cheek} fill={PINK} />
    </>
  );

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={{ overflow: "visible", ...style }}
      aria-hidden
    >
      {tilt ? <g transform="rotate(-10 50 60)">{face}</g> : face}
      {tilt && (
        <text x={84} y={24} fontFamily="Jua, sans-serif" fontSize={22} fill="#4D3F73">
          ?
        </text>
      )}
      {tall && <path d="M4 20 L10 26 M2 32 L10 33 M96 20 L90 26 M98 32 L90 33" {...line} strokeWidth={2.4} />}
      {expression === "laugh" && <path d="M88 40 q4 -4 8 0 M86 50 q4 -4 8 0" {...line} strokeWidth={2} />}
    </svg>
  );
}
