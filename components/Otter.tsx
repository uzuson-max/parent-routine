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

export type OtterExpression = "base" | "tilt" | "surprise" | "laugh" | "remember" | "proud" | "sleep" | "sly" | "stare" | "angry";
export type OtterHolding = "none" | "pebble" | "shell" | "pearl" | "note"; // note = 물 위 쪽지(알람/메모 얘기할 때)
// 심해에서 혼자 노는 동작(누운 자세 전용) — 움직임은 바깥 CSS(.otr-act-*)가 맡는다. components/DeepSea.tsx
//   crack 배 위 돌에 조개 탁탁 / eat 조개 오물오물 / juggle 조약돌 저글링 / groom 세수 / pocket 겨드랑이 주머니에서 돌 꺼내 보기
export type OtterAct = "none" | "crack" | "eat" | "juggle" | "groom" | "pocket";

export const OTTER = {
  INK: "#1B1630",
  // 2026-10-14 얼굴/몸을 2등신 + 크고 동그란 눈 + 아래 절반 크림색 얼굴로 다듬으면서 털색도 조금 더 따뜻하게.
  FUR: "#C26A44",
  FUR_DARK: "#94502F",
  FACE: "#FFF0D6",
  MUZZLE: "#FFF0D6",
  PINK: "#F6A0A8",
  PEBBLE: "#9CC9EC",
  PEBBLE_DARK: "#6FA6D6",
  PUPIL: "#3A1C12",
};

const INK = OTTER.INK;
const line = { stroke: INK, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

/** 손에 든 것 — 조약돌/조개/진주. (cx, cy) 가운데, s 크기 배율 */
function paw(cx: number, cy: number) {
  return <ellipse cx={cx} cy={cy} rx={7} ry={5.5} fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.4} />;
}

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

/** 얼굴 — 100×100 좌표. 얼굴 가운데 (50, 56).
 * 2026-10-14: 넓적한 콩 모양 머리, 얼굴 아래 절반이 크림색, 크고 동그란 눈(갈색 눈동자 + 하이라이트), 작은 w 입.
 * 표정은 눈·눈썹·입만 바꾼다. 선은 앱 바다와 같은 남색 잉크.
 */
export function otterFaceG(expression: OtterExpression, opts: { props?: boolean } = {}) {
  const props = opts.props !== false;
  const e = expression;
  const earUp = e === "surprise" ? -3 : 0;
  const cheekR = e === "laugh" || e === "proud" ? 7 : 6;
  const HEAD = "M7 60 C7 37 26 25 50 25 C74 25 93 37 93 60 C93 80 74 91 50 91 C26 91 7 80 7 60 Z";

  // 눈 하나 — r: 크기, px/py: 눈동자 위치, pr: 눈동자 크기, lid: 위 눈꺼풀을 반쯤 내림
  const eye = (cx: number, o: { r?: number; px?: number; py?: number; pr?: number; lid?: boolean } = {}) => {
    const r = o.r ?? 11.5;
    const pr = o.pr ?? 6.4;
    const x = cx + (o.px ?? 0.6);
    const y = 52 + (o.py ?? 0.8);
    return (
      <g>
        <circle cx={cx} cy={52} r={r} fill="#FFFFFF" stroke={INK} strokeWidth={2.8} />
        <circle cx={x} cy={y} r={pr} fill={OTTER.PUPIL} />
        <circle cx={x - pr * 0.38} cy={y - pr * 0.42} r={pr * 0.36} fill="#FFFFFF" />
        <circle cx={x + pr * 0.42} cy={y + pr * 0.4} r={pr * 0.16} fill="#FFFFFF" />
        {o.lid && (
          <path d={`M${cx - r - 1.2} 52 C${cx - r - 1.2} ${52 - r * 1.4} ${cx + r + 1.2} ${52 - r * 1.4} ${cx + r + 1.2} 52 Z`} fill={OTTER.FUR} stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
        )}
      </g>
    );
  };

  return (
    <g>
      {/* 귀 */}
      <circle cx={17} cy={34 + earUp} r={7.5} fill={OTTER.FUR} stroke={INK} strokeWidth={3} />
      <circle cx={83} cy={34 + earUp} r={7.5} fill={OTTER.FUR} stroke={INK} strokeWidth={3} />
      <circle cx={17.5} cy={35 + earUp} r={3.4} fill={OTTER.FUR_DARK} />
      <circle cx={82.5} cy={35 + earUp} r={3.4} fill={OTTER.FUR_DARK} />
      {/* 머리 + 아래 절반 크림색 */}
      <path d={HEAD} fill={OTTER.FUR} />
      <path d="M9 66 C16 57 33 55 50 59 C67 55 84 57 91 66 C88 81 72 90 50 90 C28 90 12 81 9 66 Z" fill={OTTER.FACE} />
      <path d={HEAD} fill="none" stroke={INK} strokeWidth={3.2} />
      {/* 볼 */}
      <ellipse cx={21} cy={67} rx={cheekR} ry={cheekR * 0.62} fill={OTTER.PINK} opacity={0.75} />
      <ellipse cx={79} cy={67} rx={cheekR} ry={cheekR * 0.62} fill={OTTER.PINK} opacity={0.75} />
      {/* 수염 */}
      <path d="M30 67 L12 63 M30 71 L12 73 M70 67 L88 63 M70 71 L88 73" {...line} strokeWidth={1.3} />

      {/* 눈·눈썹 */}
      {e === "base" && (
        <>
          {eye(33)}
          {eye(67)}
          <path d="M27 35.5 Q33 33 39 35 M61 35 Q67 33 73 35.5" {...line} strokeWidth={2.2} />
        </>
      )}
      {e === "remember" && (
        <>
          {eye(33, { py: -3, px: 1.5 })}
          {eye(67, { py: -3, px: 1.5 })}
          <path d="M27 37 Q33 33 39 36 M61 36 Q67 33 73 37" {...line} strokeWidth={2.2} />
        </>
      )}
      {e === "tilt" && (
        <>
          {eye(33, { px: -2.2, py: -2.4 })}
          {eye(67, { r: 9.5, pr: 5, px: -2, py: -2 })}
          <path d="M26 39 Q33 33 40 38 M61 41 L71 40" {...line} strokeWidth={2.2} />
        </>
      )}
      {e === "surprise" && (
        <>
          {eye(33, { r: 12.5, pr: 4, px: 0, py: 0 })}
          {eye(67, { r: 12.5, pr: 4, px: 0, py: 0 })}
          <path d="M26 35 L39 33 M61 33 L74 35" {...line} strokeWidth={2.2} />
          <path d="M92 44 Q97 52 92 56 Q87 52 92 44 Z" fill="#BDE8FF" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
        </>
      )}
      {e === "laugh" && (
        <>
          <path d="M25 54 Q33 43 41 54 M59 54 Q67 43 75 54" {...line} strokeWidth={3} />
          <path d="M27 40 L38 38 M62 38 L73 40" {...line} strokeWidth={2.2} />
        </>
      )}
      {(e === "proud" || e === "sly") && (
        <>
          {eye(33, { px: 3, py: 2, pr: 5.6, lid: true })}
          {eye(67, { px: 3, py: 2, pr: 5.6, lid: true })}
        </>
      )}
      {e === "stare" && (
        <>
          {eye(33, { r: 12.5, pr: 5, px: 0.4, py: 0.4 })}
          {eye(67, { px: 0.4, py: 2, pr: 5.6, lid: true })}
          <path d="M23 36 Q33 26 43 35 M60 40 L75 37" {...line} strokeWidth={2.6} />
        </>
      )}
      {e === "angry" && (
        <>
          {eye(33, { pr: 5.6 })}
          {eye(67, { pr: 5.6 })}
          <path d="M24 37 L40 42 M76 37 L60 42" {...line} strokeWidth={2.8} />
          <g transform="translate(88 30)" stroke="#E5484D" strokeWidth={2.2} strokeLinecap="round" fill="none">
            <path d="M-5 -1 Q-1 -1 -1 -5 M5 -1 Q1 -1 1 -5 M-5 1 Q-1 1 -1 5 M5 1 Q1 1 1 5" />
          </g>
        </>
      )}
      {e === "sleep" && <path d="M25 53 Q33 59 41 53 M59 53 Q67 59 75 53" {...line} strokeWidth={2.6} />}

      {/* 코 */}
      <path d="M45 62 Q50 58.5 55 62 Q54 67 50 67.5 Q46 67 45 62 Z" fill={INK} />
      <ellipse cx={48.2} cy={61.6} rx={1.6} ry={0.9} fill="#FFFFFF" opacity={0.65} />

      {/* 입 */}
      {(e === "base" || e === "remember" || e === "proud" || e === "sly") && (
        <path d="M50 67.5 L50 70 M42.5 71 Q46.5 75 50 70 Q53.5 75 57.5 71" {...line} strokeWidth={2} />
      )}
      {e === "tilt" && <path d="M50 67.5 L50 70 M46 74 Q50 71.5 55 74.5" {...line} strokeWidth={2} />}
      {e === "stare" && <path d="M50 67.5 L50 70.5 M44 75 Q51 74 57 71.5" {...line} strokeWidth={2} />}
      {e === "angry" && <path d="M50 67.5 L50 70 M44 76 Q50 71 56 76" {...line} strokeWidth={2} />}
      {e === "surprise" && <ellipse cx={50} cy={76} rx={3.6} ry={4.4} fill={INK} />}
      {e === "laugh" && (
        <>
          <path d="M42 70 Q50 84 58 70 Z" fill={INK} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          <path d="M50 77 Q54 82 57 74 Q53 75 50 77 Z" fill="#F27FA8" />
        </>
      )}
      {e === "sleep" && <path d="M47 73 Q50 75 53 73" {...line} strokeWidth={2} />}

      {/* 기억남 — 앞발로 조약돌을 꺼내 들고 반짝 */}
      {e === "remember" && props && (
        <>
          <g>
            <ellipse cx={80} cy={86} rx={7} ry={6} fill={OTTER.FUR} stroke={INK} strokeWidth={2.6} />
            {heldItem("pebble", 82, 76, 1.05)}
          </g>
          <path d="M92 50 L94 56 L100 58 L94 60 L92 66 L90 60 L84 58 L90 56 Z" fill="#FFE066" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
        </>
      )}
      {e === "proud" && props && (
        <path d="M88 18 L90 23 L95 25 L90 27 L88 32 L86 27 L81 25 L86 23 Z" fill="#FFE066" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
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
  act = "none",
  width = 200,
  className,
  style,
}: {
  pose?: "float" | "upright";
  act?: OtterAct;
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
        <path d="M36 128 C36 102 50 86 70 86 C90 86 104 102 104 128 C104 154 90 170 70 170 C50 170 36 154 36 128 Z" fill={OTTER.FUR} stroke={INK} strokeWidth={3.2} />
        <path d="M50 132 C50 112 58 102 70 102 C82 102 90 112 90 132 C90 150 82 162 70 162 C58 162 50 150 50 132 Z" fill={OTTER.MUZZLE} />
        {/* 발 */}
        <ellipse cx={55} cy={170} rx={11} ry={6.5} fill={OTTER.FUR} stroke={INK} strokeWidth={2.6} />
        <ellipse cx={85} cy={170} rx={11} ry={6.5} fill={OTTER.FUR} stroke={INK} strokeWidth={2.6} />
        {/* 다시마 띠 */}
        {kelp && <path d="M34 128 C52 136 88 136 106 126 L106 136 C88 146 52 146 34 138 Z" fill="#2FAF6A" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />}
        {/* 왼팔: 손에 든 것 */}
        {heldItem(holding, 70, 122, 1.1)}
        <ellipse cx={58} cy={128} rx={8} ry={6.5} fill={OTTER.FUR} stroke={INK} strokeWidth={2.6} />
        <ellipse cx={82} cy={128} rx={8} ry={6.5} fill={OTTER.FUR} stroke={INK} strokeWidth={2.6} />
        {/* 오른팔: 흔들기 */}
        <g className={wave ? "otr-wave" : ""} style={{ transformOrigin: "100px 104px", transformBox: "view-box" }}>
          {wave && (
            <>
              <path d="M100 112 C112 104 120 94 122 84" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
              <ellipse cx={123} cy={79} rx={8} ry={7} fill={OTTER.FUR} stroke={INK} strokeWidth={2.6} />
            </>
          )}
        </g>
        {/* 머리 */}
        <g transform="translate(14 -6) scale(1.12)">{otterFaceG(expression, { props: false })}</g>
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
      {/* 배 위에 올린 것 + 앞발 — 노는 중이면 그 동작으로 */}
      {act === "none" && (
        <>
          {heldItem(holding, 124, 62, 1)}
          {paw(114, 66)}
          {paw(134, 66)}
        </>
      )}
      {act === "crack" && (
        <>
          {/* 배 위 돌 — 진짜 수달처럼 */}
          <ellipse cx={123} cy={63} rx={14} ry={6.5} fill="#A9B4C2" stroke={INK} strokeWidth={2.4} />
          <g className="otr-act-crack">
            {heldItem("shell", 123, 40, 1.45)}
            {paw(110, 47)}
            {paw(136, 47)}
          </g>
        </>
      )}
      {act === "juggle" && (
        <>
          <g className="otr-act-juggle-stone">{heldItem("pebble", 114, 54, 1.15)}</g>
          <g className="otr-act-juggle-l">{paw(114, 64)}</g>
          <g className="otr-act-juggle-r">{paw(134, 64)}</g>
        </>
      )}
      {act === "pocket" && (
        <>
          {paw(134, 66)}
          <g className="otr-act-pocket">
            {heldItem(holding === "none" ? "pebble" : holding, 104, 60, 1)}
            {paw(104, 66)}
          </g>
          <path className="otr-act-pocket-shine" d="M160 18 L162 23 L167 25 L162 27 L160 32 L158 27 L153 25 L158 23 Z" fill="#FFE066" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
        </>
      )}
      {/* 머리 — 살짝 들어서 이쪽 */}
      <g transform="translate(138 8) scale(0.84) rotate(-8 50 56)">{otterFaceG(expression, { props: false })}</g>
      {/* 머리 앞에 오는 손 */}
      {act === "eat" && (
        <g className="otr-act-eat">
          <g transform="translate(154 60) rotate(-20) scale(1.45)">
            <path d="M-9 4 Q-10 -7 0 -8 Q10 -7 9 4 Z" fill="#FFF0E0" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
            <ellipse cx={0} cy={-1} rx={4.5} ry={3} fill="#F6A0A8" />
          </g>
          {paw(146, 70)}
          {paw(162, 72)}
        </g>
      )}
      {act === "groom" && (
        <>
          <g className="otr-act-groom-l">{paw(158, 60)}</g>
          <g className="otr-act-groom-r">{paw(200, 58)}</g>
        </>
      )}
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
      <path d="M48 50 C62 56 84 56 100 48 C94 56 82 58 72 58 C60 58 52 56 48 50 Z" fill={OTTER.MUZZLE} />
      {heldItem(holding, 104, 60, 0.9)}
      <g className="otr-swim-paw">
        <ellipse cx="96" cy="54" rx="6" ry="4" fill={OTTER.FUR_DARK} stroke={INK} strokeWidth={2.4} />
      </g>
      <g transform="translate(93 2) scale(0.54)">{otterFaceG(expression, { props: false })}</g>
    </svg>
  );
}
