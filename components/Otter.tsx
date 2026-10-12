// components/Otter.tsx
// ============================================================================
// 참견이 = 수달. 얼굴(OtterFace)과 전신(OtterBody) 두 가지만 있고, 앱 어디서나 같은 수달이다.
// ----------------------------------------------------------------------------
// 색·비율은 녹음 화면에서 헤엄치던 수달(TankRecordingScreen)과 같다 — 같은 캐릭터로 보이게.
// 성격: 장난스럽고 능청맞다. 눈썹이 살짝 안으로 기울어 "뭐 숨기는 거 있지?" 하는 얼굴이 기본.
// 수달은 마음에 드는 조약돌을 겨드랑이 주머니에 넣고 다닌다 — 참견이는 니가 한 말을 조약돌처럼 갖고 있다가
// 기억이 날 때 꺼낸다(remember 표정 = 조약돌을 꺼내 든 얼굴).
//
// 표정
//   base     기본 — 능청
//   tilt     갸우뚱 — 궁금
//   surprise 놀람 — 사용자 발견, 오랜만에 돌아온 생각
//   laugh    웃음
//   remember 기억남 — 조약돌을 들고 반짝 (실제로 기억을 꺼냈을 때만 쓴다)
//   proud    뿌듯 — 심해가 실제로 자랐을 때
//   sleep    쿨쿨 — 밤, 대기
// ============================================================================

export type OtterExpression = "base" | "tilt" | "surprise" | "laugh" | "remember" | "proud" | "sleep";
export type OtterHolding = "none" | "pebble" | "shell" | "pearl" | "note"; // note = 물 위 쪽지(알람/메모 얘기할 때)

export const OTTER = {
  INK: "#1B1630",
  FUR: "#B88458",
  FUR_DARK: "#9A6A45",
  FACE: "#E6C7A0",
  MUZZLE: "#F7EBD8",
  PINK: "#FF8FB3",
  PEBBLE: "#9CC9EC",
  PEBBLE_DARK: "#6FA6D6",
};

const INK = OTTER.INK;
const line = { stroke: INK, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

/** 손에 든 것 — 조약돌/조개/진주. (cx, cy) 가운데, s 크기 배율 */
function heldItem(item: OtterHolding, cx: number, cy: number, s = 1) {
  if (item === "none") return null;
  if (item === "pebble")
    return (
      <g transform={`translate(${cx} ${cy}) scale(${s})`}>
        <ellipse cx={0} cy={0} rx={8} ry={6} fill={OTTER.PEBBLE} stroke={INK} strokeWidth={2.4} />
        <ellipse cx={-2.6} cy={-2} rx={2.4} ry={1.4} fill="#FFFFFF" opacity={0.85} />
      </g>
    );
  if (item === "note")
    return (
      <g transform={`translate(${cx} ${cy}) scale(${s}) rotate(-8)`}>
        <path d="M-9 -11 H7 L10 -8 V9 Q4 6.5 0 9 Q-5 11.5 -9 9 Z" fill="#FFFDF6" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
        <path d="M-5 -5 H5 M-5 -1 H5 M-5 3 H1" {...line} strokeWidth={1.6} />
      </g>
    );
  if (item === "shell")
    return (
      <g transform={`translate(${cx} ${cy}) scale(${s})`}>
        <path d="M-9 4 Q-10 -7 0 -8 Q10 -7 9 4 Z" fill="#FFC2D6" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
        <path d="M-4 3 L-2 -6 M0 3 L0 -7 M4 3 L2 -6" {...line} strokeWidth={1.6} />
      </g>
    );
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s})`}>
      <circle cx={0} cy={0} r={11} fill="#FFF3B0" opacity={0.45} />
      <circle cx={0} cy={0} r={6.5} fill="#FFFDF4" stroke={INK} strokeWidth={2.2} />
      <circle cx={-2} cy={-2} r={1.8} fill="#FFFFFF" />
    </g>
  );
}

/** 얼굴 — 100×100 좌표. 얼굴 가운데 (50, 56). */
export function otterFaceG(expression: OtterExpression, opts: { props?: boolean } = {}) {
  const props = opts.props !== false;
  const e = expression;
  const earUp = e === "surprise" ? -4 : 0;
  const cheekR = e === "laugh" || e === "proud" ? 6.2 : 5.2;
  return (
    <g>
      {/* 귀 — 작고 동그랗게, 머리 양옆 위 */}
      <circle cx={14} cy={42 + earUp} r={7} fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={3} />
      <circle cx={86} cy={42 + earUp} r={7} fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={3} />
      <circle cx={15} cy={43 + earUp} r={2.8} fill="#6E4A2F" />
      <circle cx={85} cy={43 + earUp} r={2.8} fill="#6E4A2F" />
      {/* 머리 — 넓적하고 납작한 수달 머리 */}
      <path
        d="M7 60 C7 38 26 26 50 26 C74 26 93 38 93 60 C93 79 74 90 50 90 C26 90 7 79 7 60 Z"
        fill={OTTER.FUR}
        stroke={INK}
        strokeWidth={3.2}
      />
      {/* 얼굴 밝은 부분 */}
      <path d="M22 62 C22 48 34 42 50 42 C66 42 78 48 78 62 C78 76 66 84 50 84 C34 84 22 76 22 62 Z" fill={OTTER.FACE} />
      {/* 볼록한 주둥이 두 덩이 */}
      <ellipse cx={42.5} cy={70} rx={9.5} ry={8} fill={OTTER.MUZZLE} stroke={INK} strokeWidth={2.2} />
      <ellipse cx={57.5} cy={70} rx={9.5} ry={8} fill={OTTER.MUZZLE} stroke={INK} strokeWidth={2.2} />
      <circle cx={39} cy={69} r={1.1} fill={INK} />
      <circle cx={42} cy={73} r={1.1} fill={INK} />
      <circle cx={61} cy={69} r={1.1} fill={INK} />
      <circle cx={58} cy={73} r={1.1} fill={INK} />
      {/* 수염 */}
      <path d="M33 68 L18 64 M33 72 L18 74 M67 68 L82 64 M67 72 L82 74" {...line} strokeWidth={1.4} />

      {/* 눈·눈썹 — 표정마다 */}
      {e === "base" && (
        <>
          <path d="M28 44 L38 47 M62 47 L72 44" {...line} strokeWidth={2.6} />
          <ellipse cx={35} cy={54} rx={3.4} ry={4} fill={INK} />
          <ellipse cx={65} cy={54} rx={3.4} ry={4} fill={INK} />
          <circle cx={36.2} cy={52.6} r={1.1} fill="#FFFFFF" />
          <circle cx={66.2} cy={52.6} r={1.1} fill="#FFFFFF" />
        </>
      )}
      {e === "tilt" && (
        <>
          <path d="M27 45 Q33 39 39 45 M62 48 L72 47" {...line} strokeWidth={2.6} />
          <ellipse cx={34} cy={54} rx={3.8} ry={4.8} fill={INK} />
          <ellipse cx={65} cy={55} rx={3} ry={3.4} fill={INK} />
          <circle cx={35.3} cy={52.4} r={1.2} fill="#FFFFFF" />
        </>
      )}
      {e === "surprise" && (
        <>
          <path d="M27 41 L38 39 M62 39 L73 41" {...line} strokeWidth={2.6} />
          <circle cx={35} cy={53} r={6.4} fill="#FFFFFF" stroke={INK} strokeWidth={2.2} />
          <circle cx={65} cy={53} r={6.4} fill="#FFFFFF" stroke={INK} strokeWidth={2.2} />
          <circle cx={35.5} cy={53.5} r={3} fill={INK} />
          <circle cx={65.5} cy={53.5} r={3} fill={INK} />
        </>
      )}
      {e === "laugh" && <path d="M29 55 Q35 47 41 55 M59 55 Q65 47 71 55" {...line} strokeWidth={2.8} />}
      {e === "remember" && (
        <>
          {/* 위쪽(기억나는 쪽)을 올려다보는 눈 */}
          <path d="M28 43 Q34 39 40 43 M60 43 Q66 39 72 43" {...line} strokeWidth={2.4} />
          <ellipse cx={36} cy={52} rx={3.4} ry={4.2} fill={INK} />
          <ellipse cx={66} cy={52} rx={3.4} ry={4.2} fill={INK} />
          <circle cx={37.4} cy={50.2} r={1.3} fill="#FFFFFF" />
          <circle cx={67.4} cy={50.2} r={1.3} fill="#FFFFFF" />
        </>
      )}
      {e === "proud" && (
        <>
          <path d="M28 46 L38 44 M62 44 L72 46" {...line} strokeWidth={2.4} />
          <path d="M29 55 Q35 51 41 55 M59 55 Q65 51 71 55" {...line} strokeWidth={2.8} />
        </>
      )}
      {e === "sleep" && <path d="M29 55 Q35 58 41 55 M59 55 Q65 58 71 55" {...line} strokeWidth={2.6} />}

      {/* 코 — 크고 둥근 삼각형 */}
      <path d="M43.5 61 Q50 57.5 56.5 61 Q55 66.5 50 67 Q45 66.5 43.5 61 Z" fill={INK} />
      <ellipse cx={48} cy={60.6} rx={2} ry={1} fill="#FFFFFF" opacity={0.6} />

      {/* 입 */}
      {(e === "base" || e === "remember" || e === "proud") && <path d="M50 67 L50 70 M45 72 Q47.5 75 50 70 Q52.5 75 55 72" {...line} strokeWidth={2} />}
      {e === "tilt" && <path d="M50 67 L50 70 M46 73 Q50 71 55 74" {...line} strokeWidth={2} />}
      {e === "surprise" && <ellipse cx={50} cy={75} rx={3.2} ry={4} fill={INK} />}
      {e === "laugh" && (
        <>
          <path d="M42 71 Q50 86 58 71 Z" fill={INK} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          <ellipse cx={50} cy={78} rx={4} ry={2.4} fill="#F27FA8" />
        </>
      )}
      {e === "sleep" && <path d="M47 72 Q50 74 53 72" {...line} strokeWidth={2} />}

      {/* 볼 */}
      <ellipse cx={24} cy={64} rx={cheekR} ry={cheekR * 0.75} fill={OTTER.PINK} opacity={0.6} />
      <ellipse cx={76} cy={64} rx={cheekR} ry={cheekR * 0.75} fill={OTTER.PINK} opacity={0.6} />

      {/* 기억남 — 앞발로 조약돌을 꺼내 들고 반짝 */}
      {e === "remember" && props && (
        <>
          <g>
            <ellipse cx={80} cy={84} rx={7} ry={6} fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.6} />
            {heldItem("pebble", 82, 74, 1.05)}
          </g>
          <path d="M90 52 L92 58 L98 60 L92 62 L90 68 L88 62 L82 60 L88 58 Z" fill="#FFE066" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
        </>
      )}
      {e === "proud" && props && (
        <path d="M86 20 L88 25 L93 27 L88 29 L86 34 L84 29 L79 27 L84 25 Z" fill="#FFE066" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      )}
    </g>
  );
}

export function OtterFace({
  expression = "base",
  size = 96,
  className,
  style,
}: {
  expression?: OtterExpression;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const tilt = expression === "tilt";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ overflow: "visible", ...style }} aria-hidden>
      {tilt ? <g transform="rotate(-10 50 60)">{otterFaceG(expression)}</g> : otterFaceG(expression)}
      {tilt && (
        <text x={86} y={22} fontFamily="Jua, sans-serif" fontSize={22} fill="#4D3F73">
          ?
        </text>
      )}
      {expression === "surprise" && <path d="M2 22 L9 28 M0 35 L9 36 M98 22 L91 28 M100 35 L91 36" {...line} strokeWidth={2.4} />}
      {expression === "laugh" && <path d="M90 42 q4 -4 8 0 M88 52 q4 -4 8 0" {...line} strokeWidth={2} />}
      {expression === "sleep" && (
        <text x={84} y={26} fontFamily="Jua, sans-serif" fontSize={16} fill="#4D3F73">
          z
        </text>
      )}
    </svg>
  );
}

/**
 * 전신.
 *   float   — 배를 하늘로 하고 둥둥 (수달 하면 이 자세). 대기·쉬는 중·궁금.
 *   upright — 물속에서 서서 이쪽을 본다. 사용자 발견·뿌듯.
 * holding: 배 위/손에 든 것. kelp: 다시마를 몸에 감고 있음(떠내려가지 않게 — 실제 수달 습관).
 * 움직임은 바깥 CSS(.otr-*)가 맡는다 — 여기선 그림만.
 */
export function OtterBody({
  pose = "float",
  expression = "base",
  holding = "none",
  kelp = false,
  wave = false,
  width = 200,
  className,
  style,
}: {
  pose?: "float" | "upright";
  expression?: OtterExpression;
  holding?: OtterHolding;
  kelp?: boolean;
  wave?: boolean;
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (pose === "upright") {
    return (
      <svg viewBox="0 0 140 190" width={width} height={(width * 190) / 140} className={className} style={{ overflow: "visible", ...style }} aria-hidden>
        {/* 꼬리 */}
        <path className="otr-tail" d="M86 160 C110 162 124 152 132 136 C122 140 108 146 88 148 Z" fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        {/* 몸 */}
        <path d="M32 112 C32 86 48 72 70 72 C92 72 108 86 108 112 C108 146 94 172 70 172 C46 172 32 146 32 112 Z" fill={OTTER.FUR} stroke={INK} strokeWidth={3.2} />
        <path d="M46 116 C46 96 56 86 70 86 C84 86 94 96 94 116 C94 142 84 160 70 160 C56 160 46 142 46 116 Z" fill={OTTER.MUZZLE} />
        {/* 발 */}
        <ellipse cx={54} cy={172} rx={11} ry={6} fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.6} />
        <ellipse cx={86} cy={172} rx={11} ry={6} fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.6} />
        {/* 다시마 띠 */}
        {kelp && <path d="M34 128 C52 136 88 136 106 126 L106 136 C88 146 52 146 34 138 Z" fill="#2FAF6A" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />}
        {/* 왼팔: 손에 든 것 */}
        <path d="M40 104 C30 112 30 124 40 128" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
        <ellipse cx={46} cy={122} rx={8} ry={6.5} fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.6} />
        {heldItem(holding, 52, 112, 1.1)}
        {/* 오른팔: 흔들기 */}
        <g className={wave ? "otr-wave" : ""} style={{ transformOrigin: "100px 104px", transformBox: "view-box" }}>
          <path d="M100 104 C114 98 124 88 126 76" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <ellipse cx={127} cy={71} rx={8} ry={7} fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.6} />
        </g>
        {/* 머리 */}
        <g transform="translate(20 0)">{otterFaceG(expression, { props: false })}</g>
        {(expression === "proud" || expression === "remember") && (
          <path d="M122 12 L124 17 L129 19 L124 21 L122 26 L120 21 L115 19 L120 17 Z" fill="#FFE066" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
        )}
      </svg>
    );
  }
  // float — 배를 위로, 머리는 오른쪽에서 이쪽을 본다
  return (
    <svg viewBox="0 0 230 130" width={width} height={(width * 130) / 230} className={className} style={{ overflow: "visible", ...style }} aria-hidden>
      {/* 꼬리 */}
      <path className="otr-tail" d="M44 86 C28 86 14 80 4 70 C16 70 30 72 46 74 Z" fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      {/* 뒷발 — 위로 쏙 */}
      <ellipse cx={50} cy={54} rx={7} ry={10} transform="rotate(-24 50 54)" fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.6} />
      <ellipse cx={66} cy={50} rx={7} ry={10} transform="rotate(-8 66 50)" fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.6} />
      {/* 몸 — 누워서 둥둥 */}
      <path d="M40 80 C40 62 70 56 112 56 C142 56 160 62 162 76 C164 92 140 102 104 102 C66 102 40 96 40 80 Z" fill={OTTER.FUR} stroke={INK} strokeWidth={3.2} />
      {/* 배 */}
      <path d="M58 74 C62 64 88 62 116 62 C138 62 150 66 150 74 C148 82 130 86 104 86 C80 86 58 84 58 74 Z" fill={OTTER.MUZZLE} />
      {/* 다시마 띠 */}
      {kelp && <path d="M86 58 C84 72 86 90 90 104 L100 104 C96 90 94 72 96 57 Z" fill="#2FAF6A" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />}
      {/* 배 위에 올린 것 + 앞발 */}
      {heldItem(holding, 124, 62, 1)}
      <ellipse cx={114} cy={66} rx={7} ry={5.5} fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.4} />
      <ellipse cx={134} cy={66} rx={7} ry={5.5} fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.4} />
      {/* 머리 — 살짝 들어서 이쪽 */}
      <g transform="translate(138 8) scale(0.84) rotate(-8 50 56)">{otterFaceG(expression, { props: false })}</g>
    </svg>
  );
}

/**
 * 헤엄치는 모습 — 배를 아래로, 오른쪽을 보고 쭉 뻗어 간다(녹음 화면에서 헤엄치던 그 수달).
 * 왼쪽으로 갈 땐 바깥에서 scaleX(-1). 꼬리/앞발 움직임은 바깥 CSS(.otr-swim-tail, .otr-swim-paw).
 */
export function OtterSwim({
  expression = "base",
  holding = "none",
  width = 140,
  className,
  style,
}: {
  expression?: OtterExpression;
  holding?: OtterHolding;
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 150 70" width={width} height={(width * 70) / 150} className={className} style={{ overflow: "visible", ...style }} aria-hidden>
      <g className="otr-swim-tail">
        <path d="M30 40 C18 40 8 44 2 50 C10 54 22 52 34 46 Z" fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      </g>
      <path d="M40 52 C34 60 30 64 24 64 C26 58 30 54 36 50 Z" fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      <path d="M26 42 C28 28 50 20 76 20 C96 20 106 26 110 34 C112 46 100 56 78 58 C54 60 30 56 26 42 Z" fill={OTTER.FUR} stroke={INK} strokeWidth={3.2} strokeLinejoin="round" />
      <path d="M48 50 C62 56 84 56 100 48 C94 56 82 58 72 58 C60 58 52 56 48 50 Z" fill="#E9C9A4" />
      {heldItem(holding, 104, 60, 0.9)}
      <g className="otr-swim-paw">
        <ellipse cx="96" cy="54" rx="6" ry="4" fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.4} />
      </g>
      <g transform="translate(93 2) scale(0.54)">{otterFaceG(expression, { props: false })}</g>
    </svg>
  );
}
