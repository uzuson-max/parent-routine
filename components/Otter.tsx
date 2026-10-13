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

export const OTTER = {
  INK: "#1B1630",
  // 2026-10-13 새 수달 그림(public/otter/*.webp)의 털색에 맞췄다 — 앞발 같은 SVG 조각이 그림과 같은 색으로 보이게.
  FUR: "#BB633F",
  FUR_DARK: "#9C4E30",
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

// ============================================================================
// 2026-10-13 — 참견이 수달 그림 교체.
// 앱에 보이는 수달은 이제 손그림 일러스트(public/otter/*.webp)다. 아래 세 컴포넌트는 예전과 같은 이름·props를
// 그대로 받아서(부르는 화면은 손대지 않아도 되게) 그림 파일을 보여준다.
//   얼굴 8장: face_happy(반가움·기본) / face_sly(능청) / face_stare(빤히·짝눈) / face_smug(킹받는 웃음)
//             face_surprise(놀람) / face_tilt(갸우뚱) / face_angry(발끈) / face_sleep(졸림)
//   자세 4장: pose_front(정면, 서 있기) / pose_float(배 위로 둥둥, 조약돌) / pose_swim(헤엄) / pose_closeup(쪽지 든 큰 얼굴)
// 예전 SVG 수달(otterFaceG)은 녹음 화면 등에서 쓸 수 있게 남겨둔다.
// holding/kelp/wave 같은 소품 props는 지금 그림에 없어서 받기만 하고 그리지 않는다.
// ============================================================================

const FACE_FILE: Record<OtterExpression, string> = {
  base: "face_happy",
  remember: "face_happy",
  tilt: "face_tilt",
  surprise: "face_surprise",
  laugh: "face_smug",
  proud: "face_sly",
  sleep: "face_sleep",
  sly: "face_sly",
  stare: "face_stare",
  angry: "face_angry",
};

export function otterFaceSrc(expression: OtterExpression): string {
  return `/otter/${FACE_FILE[expression] ?? "face_happy"}.webp`;
}

/** 얼굴 — size×size 칸 가운데에 얼굴 그림(가로가 조금 더 긴 그림이라 폭을 size에 맞춘다). */
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
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, ...style }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={otterFaceSrc(expression)} alt="" width={size} style={{ display: "block", width: size, height: "auto" }} draggable={false} />
    </span>
  );
}

// 살아 있는 느낌 — 그림이 한 장이라 팔다리는 못 움직이지만, 몸 전체로 숨쉬기·흔들림·기울기를 준다.
// 바깥(SeaOtter/DeepSea)이 이미 위치를 움직이므로 여기선 제자리 움직임만. 그림 뒤집기는 안쪽 img가, 움직임은 바깥 span이 맡는다.
const LIVE_CSS = `
.otr-live{display:block;transform-origin:50% 90%;will-change:transform}
.otr-breathe{animation:otr-breathe 2.6s ease-in-out infinite}
@keyframes otr-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.025,.975)}}
.otr-rock{animation:otr-rock 3.4s ease-in-out infinite}
@keyframes otr-rock{0%,100%{transform:rotate(-4deg) translateY(0)}50%{transform:rotate(3deg) translateY(-3px)}}
.otr-paddle{animation:otr-paddle 1.1s ease-in-out infinite;transform-origin:30% 50%}
@keyframes otr-paddle{0%,100%{transform:rotate(-3deg) scale(1,1)}50%{transform:rotate(4deg) scale(1.04,.96)}}
.otr-img{display:block;height:auto;filter:drop-shadow(0 6px 5px rgba(10,40,80,.28))}
@media (prefers-reduced-motion: reduce){.otr-breathe,.otr-rock,.otr-paddle{animation:none}}
`;

function LiveImg({ src, width, flip, motion, className, style }: { src: string; width: number; flip?: boolean; motion: "otr-breathe" | "otr-rock" | "otr-paddle"; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`otr-live ${motion} ${className ?? ""}`} style={{ width, ...style }} aria-hidden>
      <style dangerouslySetInnerHTML={{ __html: LIVE_CSS }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} className="otr-img" style={{ width: "100%", transform: flip ? "scaleX(-1)" : undefined }} />
    </span>
  );
}

/** 전신 — float: 배 위로 둥둥(조약돌을 안고, 살랑살랑 흔들림), upright: 정면으로 앉아 숨쉬기. 오른쪽을 보도록 맞춘다. */
export function OtterBody({
  pose = "float",
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
  return pose === "upright" ? (
    <LiveImg src="/otter/pose_front.webp" width={width} motion="otr-breathe" className={className} style={style} />
  ) : (
    <LiveImg src="/otter/pose_float.webp" width={width} flip motion="otr-rock" className={className} style={style} />
  );
}

/** 헤엄 — 오른쪽으로 헤엄치는 모습(그림은 왼쪽을 보고 있어서 뒤집는다). 몸을 출렁이며 나아간다. */
export function OtterSwim({
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
  return <LiveImg src="/otter/pose_swim.webp" width={width} flip motion="otr-paddle" className={className} style={style} />;
}
