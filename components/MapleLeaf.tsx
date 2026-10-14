// components/MapleLeaf.tsx
// ============================================================================
// 단풍잎 하나 — 가을 바다(lib/season.ts)에서 하늘·수면·심해·참견이 손에 같은 잎이 쓰인다.
// 24×24 좌표, 가운데 (12, 12). 선은 앱 바다와 같은 남색 잉크.
// ============================================================================

const INK = "#1B1630";

export const MAPLE_PATH =
  "M12 1.5 L13.9 6 L17.6 4.2 L16.8 8.8 L21.6 8.6 L18.2 12.4 L20.2 14.6 L14.4 14.8 L13.2 18.4 L12.8 22.6 L11.2 22.6 L10.8 18.4 L9.6 14.8 L3.8 14.6 L5.8 12.4 L2.4 8.6 L7.2 8.8 L6.4 4.2 L10.1 6 Z";
export const MAPLE_VEINS = "M12 18 L12 6 M12 13 L6.5 9.5 M12 13 L17.5 9.5";

// 빨강 / 주황 / 노랑 / 진한 빨강
export const LEAF_COLORS = ["#E8572E", "#F29A35", "#F6C945", "#C8452E"];

/** svg 안에 넣는 잎 — (cx, cy) 가운데, s 배율 */
export function mapleG(color: string, cx = 12, cy = 12, s = 1, rot = 0, sw = 1.6) {
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s}) translate(-12 -12)`}>
      <path d={MAPLE_PATH} fill={color} stroke={INK} strokeWidth={sw / s} strokeLinejoin="round" />
      <path d={MAPLE_VEINS} fill="none" stroke={INK} strokeWidth={(sw * 0.6) / s} strokeLinecap="round" opacity={0.55} />
    </g>
  );
}

export default function MapleLeaf({
  color = LEAF_COLORS[0],
  size = 24,
  className,
  style,
}: {
  color?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={{ overflow: "visible", display: "block", ...style }} aria-hidden>
      {mapleG(color, 12, 12, 1, 0, 1.8)}
    </svg>
  );
}
