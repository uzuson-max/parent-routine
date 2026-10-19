// components/DeepSea.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { OtterBody, OtterSwim, type OtterAct, type OtterExpression, type OtterHolding } from "@/components/Otter";
import { otterSound, plop, type OtterSound } from "@/lib/seaSound";
import { decideCue, deepTapCue, loadOtterMemory, saveOtterMemory } from "@/lib/otterCues";
import { useSeason } from "@/lib/season";
import { LEAF_COLORS, mapleG } from "@/components/MapleLeaf";
// ============================================================================
// 심해 — 지금 어항 바로 아래, 참견이(수달)가 사는 곳.
// ----------------------------------------------------------------------------
// 지난달 물고기를 다시 늘어놓는 곳이 아니다(그건 "지난 어항" 탭). 여기엔 참견이와 참견이의 집만 있다.
// 집은 성장 단계(lib/seaGrowth.ts — 기록한 날 + 다시 꺼낸 생각)로만 달라진다. 단계가 그대로면 그림도 그대로.
//   0 새로 이사 옴 — 모래, 조약돌 몇 개, 바닥 해초 두 무더기(항상 있음 — 참견이가 건드리고 노는 곳)
//   1 다시마 싹
//   2 조약돌 더미 — 참견이가 배 위에 조약돌을 올려두고 논다
//   3 다시마 숲 — 참견이가 다시마를 몸에 감고 쉰다(떠내려가지 않게)
//   4 조개 정원 — 진주 품은 조개
//   5 보물 굴
//
// 참견이 상태
//   idle      혼자 지낸다(아래 "하루"). 밤엔 친구랑 손잡고 쿨쿨.
//   discover  내려온 걸 알아채고 일어나서 손 흔들기 — 6시간에 한 번 이하(lib/otterCues.ts deep_arrive).
//   growth    실제로 단계가 올라갔고 아직 못 봤을 때만 — 뿌듯하게 보여주고, 본 걸로 기록(onSeen)
//   curious   누르면 그 자리에 멈춰서 갸우뚱하고 한마디 — 실제 상태로만(lib/otterCues.ts deepTapCue).
//
// 하루(2026-10-15 — "동물의숲처럼 지켜만 봐도 시간이 가는" 쪽으로)
//   - 기본은 느리다. 사용자가 대신 지켜보는 거니까 둥둥 천천히 다른 곳으로 떠간다(좌우 왕복 X, 심해 전체).
//   - 방향을 바꿀 땐 순간 뒤집기 대신 몸을 굴리듯 돈다. 가끔 몸을 세워 두리번.
//   - 가끔만 빠르다 — 위에서 바닥까지 "슝" 다이빙해서 해초를 톡톡 건드리고, 천천히 올라온다.
//   - 친구 수달이 같이 산다. 말은 안 한다(말 거는 건 참견이 하나뿐). 둘은 연인이 아니라 단짝 — 하트 같은 연애 기호는 쓰지 않는다.
//     각자 놀다가 가끔 같이 논다: 술래잡기(콩 부딪히면 반짝 별) / 조약돌 캐치볼 / 거품 고리(참견이가 후 불면 친구가 톡 터뜨림).
//     저녁 아지트에선 가끔 빛 플랑크톤 불꽃놀이를 같이 구경한다.
//   - 아지트에 앉으면 안경 쓰고 책을 본다(오래 — 수십 초~1분 넘게). 가끔 책장 넘기고, 피식 웃고, 꾸벅 졸다 깬다.
//     친구도 떠다니기만 하지 않고 자주 아지트에 와서 책을 본다. 친구가 책 보고 있으면 참견이도 옆에 와서 같이 본다.
//   - 놀이도 짧게 끝내지 않는다(2026-10-15 "봐도 힐링되게 오래, 천천히").
//   - 쉬는 동안엔 조개 까기 / 냠냠 / 조약돌 저글링 / 세수 / 겨드랑이 주머니.
//   - 실제 시간과 같이 흐른다 — 아침엔 기지개부터, 밤엔 둘이 손잡고 잔다(진짜 수달처럼 떠내려가지 않게).
//   - 해초·친구는 눌러볼 수 있다(몇 초짜리 작은 손짓). 물속 소리가 켜져 있으면 작은 소리도 난다.
//   - 가을(lib/season.ts)엔 단풍잎이 수면에서 심해까지 천천히 가라앉고 바닥에도 몇 장 쌓여 있다. 빛도 조금 노을빛.
//     참견이가 바닥에 내려가 잎을 주워 배 위에 올려두고 다니다가, 친구한테 주거나 다음에 내려갈 때 내려놓는다.
//     가라앉는 잎은 눌러볼 수 있다(빙글).
//   - 아지트(2026-10-15) — 바닥 가운데 바위 턱(둘이 앉는 자리) + 오른쪽 열수구(물속 아궁이: 주황빛이 일렁이고
//     방울이 끊임없이 올라온다, 물속 소리를 켜면 타닥타닥) + 바위 턱 위에 떠 있는 해파리 등.
//     눈이 머물 기준점이다. 낮엔 돌아다니다 가끔 들르고, 저녁(17~21시)엔 둘이 아지트에 돌아와 앉아서
//     조개를 열수구에 구워 먹고, 밤엔 바위 턱에 나란히 앉아 기대어 존다. 저녁엔 물빛도 조금 어둑해진다.
//   - 위쪽 한 칸(TOP_KEEP)은 비워둔다 — 로고·소라·메모 버튼을 가리지 않게.
//   - 사용자를 쳐다보지 않고 자기 일에 빠져 있다. 이쪽을 보는 건 말할 때(discover/growth/curious)뿐.
//   수달은 홈 위로 그냥 놀러 올라오지 않는다 — 걱정이를 데려올 때만(components/OtterCloseUp.tsx).
//   올라가 있는 동안(away)에도 친구는 남아서 논다 — 집이 텅 비지 않게.
// 기억 회상은 여기서 하지 않는다 — 그건 홈 위쪽 말풍선/기억 캡슐이 기존 데이터로만 한다.
// ============================================================================

export interface SeaGrowth {
  stage: number;
  seen: number;
  fresh: boolean; // 서버에서 방금 받은 값인지(기기에 남아 있던 옛 값이면 "새 변화" 연출을 하지 않는다)
}

type Mode = "idle" | "discover" | "growth" | "curious";
type Pose = "float" | "upright" | "swim";
type PlayAct = Exclude<OtterAct, "none">;

interface Body {
  x: number; // 몸 가운데(심해 안 px)
  y: number;
  ms: number; // 이 위치까지 걸리는 시간
  ease: string;
  facing: 1 | -1; // 1 = 오른쪽
  pose: Pose;
  tilt: number; // 헤엄칠 때 몸 기울기(deg)
  face: OtterExpression | null;
  act: OtterAct;
  lean: number; // 해초 톡톡 — 바뀔 때마다 한 번 기울인다
  carry: OtterHolding | null; // 잠깐 들고 있는 것(구우려는 조개 등) — 없으면 평소 것
  book: boolean; // 안경 쓰고 책 보는 중
  page: number; // 책장 넘김 — 바뀔 때마다 한 장
}

type DayPart = "morning" | "day" | "evening";
function dayPartAt(d: Date = new Date()): DayPart {
  const h = d.getHours();
  if (h >= 6 && h < 10) return "morning";
  if (h >= 17 && h < 21) return "evening";
  return "day";
}

// 혼자 놀기 — 길이(ms), 표정, 소리(시작 후 언제 무슨 소리). 소리 박자는 아래 CSS 애니메이션 주기와 맞춘다.
const ACTS: Record<PlayAct, { ms: number; face: OtterExpression; sounds: [number, OtterSound][] }> = {
  // .otr-act-crack 0.6초 주기, 40% 지점에서 돌에 닿는다
  crack: { ms: 5400, face: "base", sounds: Array.from({ length: 8 }, (_, i) => [240 + i * 600, "tok"] as [number, OtterSound]) },
  eat: { ms: 4400, face: "laugh", sounds: [300, 700, 1100, 1900, 2300, 2700, 3500].map((t) => [t, "munch"] as [number, OtterSound]) },
  // .otr-act-juggle-stone 0.7초마다 반대 손에 떨어진다
  juggle: { ms: 4900, face: "laugh", sounds: Array.from({ length: 6 }, (_, i) => [700 + i * 700, "tik"] as [number, OtterSound]) },
  groom: { ms: 3800, face: "sleep", sounds: [] },
  pocket: { ms: 4200, face: "surprise", sounds: [[1100, "ting"]] },
};
const ACT_NAMES = Object.keys(ACTS) as PlayAct[];
const FRIEND_ACTS: PlayAct[] = ["eat", "groom", "juggle"];

const GROWTH_LINES: Record<number, string> = {
  1: "NEW 다시마 싹\n니 말 쌓이는 중",
  2: "NEW 조약돌\n다시 꺼낸 얘기들",
  3: "NEW 다시마 숲\n이제 안 떠내려감",
  4: "NEW 진주 존\n니 얘기 꽤 쌓임",
  5: "NEW 보물 굴\n전부 니 얘기로 만듦",
};

// 크기 — 친구는 조금 작다
const W_FLOAT = 190;
const W_UP = 112;
const W_SWIM = 140;
const FRIEND_K = 0.8;
const UP_H = (W_UP * 190) / 140;
const FLOOR_BASE = 56; // 바닥 장식이 서는 높이(아래에서)

// 속도 — 기본은 느리게(px/초), 다이빙만 빠르게
const DRIFT_SPEED = 11;
const FRIEND_DRIFT_SPEED = 9;
const SWIM_SPEED = 50;
const EASE_SLOW = "cubic-bezier(.45,.05,.55,.95)";
const EASE_DIVE = "cubic-bezier(.55,0,.8,1)";
const EASE_DART = "cubic-bezier(.2,.7,.3,1)";

// 바닥 해초 — 항상 있다. x는 폭 대비 위치
const WEEDS = [
  { x: 0.07, h: 108, c1: "#3FBF8A", c2: "#2A9C6E" },
  { x: 0.67, h: 88, c1: "#55C9A0", c2: "#2FA57A" },
];

// 위쪽 한 칸 — 몸 가운데가 이보다 위로 가지 않는다(로고·소라·메모 버튼을 가리지 않게)
const TOP_KEEP = 190;

// 아지트 — 바위 턱(앉는 자리) / 열수구(물속 아궁이) / 해파리 등. x는 폭 대비
const DEN_X = 0.4;
const VENT_X = 0.85;
const BENCH_BOTTOM = 48;
const benchW = (W: number) => Math.min(240, W * 0.6);
/** 바위 턱 위 앉는 면 — 아래에서 px */
const benchTop = (W: number) => BENCH_BOTTOM + 48 * (benchW(W) / 240);
const VENT_W = 84;
const VENT_BOTTOM = 46;
const VENT_MOUTH = VENT_BOTTOM + 58; // 열수구 입구 — 아래에서 px
const FIRE_COLORS = ["#FFE066", "#8BE0C0", "#FF9EC4", "#B9A7F2", "#9CD8FF"];

// 가을 — 천천히 가라앉는 잎(심해 위→아래)과 바닥에 쌓인 잎
const FALL_LEAVES = [
  { left: 14, size: 32, dur: 30, delay: -6, c: 0 },
  { left: 46, size: 26, dur: 38, delay: -21, c: 2 },
  { left: 70, size: 30, dur: 34, delay: -13, c: 1 },
  { left: 88, size: 24, dur: 42, delay: -32, c: 3 },
];
const GROUND_LEAVES = [
  { x: 0.2, c: 0, rot: -28 },
  { x: 0.56, c: 2, rot: 24 },
  { x: 0.95, c: 1, rot: 70 },
];

function holdingFor(stage: number): OtterHolding {
  if (stage >= 5) return "pearl";
  if (stage >= 4) return "shell";
  if (stage >= 2) return "pebble";
  return "none";
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 헤엄 방향으로 몸 기울기 — 그림은 오른쪽을 보고, 왼쪽이면 바깥에서 뒤집는다 */
function swimTilt(facing: 1 | -1, dx: number, dy: number) {
  const deg = facing === 1 ? (Math.atan2(dy, dx) * 180) / Math.PI : (Math.atan2(-dy, -dx) * 180) / Math.PI;
  return clamp(deg, -70, 70);
}

function faceToward(from: number, to: number, cur: 1 | -1): 1 | -1 {
  if (Math.abs(to - from) < 8) return cur;
  return to > from ? 1 : -1;
}

/** 지금 실제로 그려진 위치(움직이는 중이어도) */
function readPos(el: HTMLElement | null): { x: number; y: number } | null {
  if (!el || typeof window === "undefined") return null;
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return null;
  try {
    const m = new DOMMatrixReadOnly(t);
    return { x: m.m41, y: m.m42 };
  } catch {
    return null;
  }
}

/** 물속 가운데 아무 곳 — 너무 가깝지도, 화면 끝에서 끝까지도 아니게 */
function waterPoint(W: number, H: number, from?: { x: number; y: number }, band: [number, number] = [0.12, 0.64]) {
  const mx = Math.min(105, W * 0.28);
  let best = { x: W / 2, y: Math.max(H * 0.35, TOP_KEEP) };
  for (let i = 0; i < 8; i++) {
    const y0 = Math.max(H * band[0], TOP_KEEP);
    const p = { x: rand(mx, W - mx), y: rand(y0, Math.max(H * band[1], y0 + 40)) };
    best = p;
    if (!from) break;
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d > 80 && d < Math.max(260, H * 0.45)) break;
  }
  return best;
}

const START: Body = { x: 0, y: 0, ms: 0, ease: EASE_SLOW, facing: 1, pose: "float", tilt: 0, face: null, act: "none", lean: 0, carry: null, book: false, page: 0 };

/** 방향을 바꾸면 잠깐 몸을 굴린다(순간 뒤집기 대신) */
function useTurning(facing: 1 | -1) {
  const [turning, setTurning] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setTurning(true);
    const id = setTimeout(() => setTurning(false), 900);
    return () => clearTimeout(id);
  }, [facing]);
  return turning;
}

export default function DeepSea({
  night,
  topColor,
  growth,
  fishCount,
  busy,
  onSeen,
  noteCount = null,
  nextReminder = null,
  away = false,
}: {
  night: boolean;
  topColor: string; // 위 바다의 맨 아래 색 — 이음새 없이 이어지게
  growth: SeaGrowth | null;
  fishCount: number;
  busy: boolean; // 대답 기다리는 중/카드 열림 — 이땐 연출 안 함
  onSeen: (stage: number) => void;
  noteCount?: number | null;
  nextReminder?: { title: string; at: string } | null;
  away?: boolean; // 첫 화면에 놀러 가 있는 중(components/SeaOtter.tsx) — 참견이 자리가 빈다(친구는 남음)
}) {
  const stage = growth?.stage ?? 0;
  const pending = !!growth && growth.fresh && growth.stage > growth.seen;
  const deep = night ? "#0F2E57" : "#14457A";
  const mid = night ? "#173F70" : "#1E5C98";

  const [mode, setMode] = useState<Mode>("idle");
  const [say, setSay] = useState<{ text: string; key: number } | null>(null);
  const [tapN, setTapN] = useState(0);
  const [face, setFace] = useState<OtterExpression | null>(null); // 지금 반응의 표정(lib/otterCues.ts가 정함)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearAll, []);

  // ---- 몸 두 개: 참견이, 친구 ----
  const rootRef = useRef<HTMLElement>(null);
  const mainEl = useRef<HTMLDivElement>(null);
  const friendEl = useRef<HTMLDivElement>(null);
  const [main, setMain] = useState<Body>(START);
  const [friend, setFriend] = useState<Body>({ ...START, facing: -1 });
  const mainNow = useRef(main);
  mainNow.current = main;
  const friendNow = useRef(friend);
  friendNow.current = friend;
  const friendHeld = useRef(false); // 참견이랑 노는 중 — 친구 혼자 놀기를 잠깐 멈춘다
  const friendReading = useRef(false); // 친구가 아지트에서 책 보는 중
  const [ready, setReady] = useState(false);
   const [seen, setSeen] = useState(false); // 심해가 화면에 보이는 중
  const [reduce, setReduce] = useState(false);
  const mainTurning = useTurning(main.facing);
  const friendTurning = useTurning(friend.facing);

  const size = () => {
    const el = rootRef.current;
    return { W: el?.clientWidth || 375, H: el?.clientHeight || 700 };
  };

  useEffect(() => {
    try {
      setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      /* 그대로 */
    }
    const { W, H } = size();
    setMain((b) => ({ ...b, x: W * 0.42, y: Math.max(H * 0.3, TOP_KEEP) }));
    setFriend((b) => ({ ...b, x: W * 0.68, y: H * 0.5 }));
    setReady(true);
  }, []);

  // ---- 해초 / 하트 / 방울 ----
  const [weeds, setWeeds] = useState(WEEDS.map(() => ({ n: 0, on: false })));
  const hitWeed = (i: number) => {
    setWeeds((ws) => ws.map((w, j) => (j === i ? { n: w.n + 1, on: true } : w)));
    later(() => setWeeds((ws) => ws.map((w, j) => (j === i ? { ...w, on: false } : w))), 1300);
  };
  const [boops, setBoops] = useState<{ key: number; x: number; y: number }[]>([]);
  const boopAt = (x: number, y: number) => {
    const key = Date.now() + Math.random();
    setBoops((bs) => [...bs.slice(-3), { key, x, y }]);
    later(() => setBoops((bs) => bs.filter((b) => b.key !== key)), 1600);
  };
  const [friendSpin, setFriendSpin] = useState(0);

  // 캐치볼 조약돌 — 한 번 던질 때마다 새로(key) 그린다
  const [ball, setBall] = useState<{ key: number; x0: number; y0: number; x1: number; y1: number; ms: number; go: boolean } | null>(null);
  const throwBall = (x0: number, y0: number, x1: number, y1: number, ms: number) => {
    const key = Date.now() + Math.random();
    setBall({ key, x0, y0, x1, y1, ms, go: false });
    later(() => setBall((b) => (b && b.key === key ? { ...b, go: true } : b)), 40);
  };
  // 거품 고리
  const [rings, setRings] = useState<{ key: number; x: number; y: number }[]>([]);
  // 빛 플랑크톤 불꽃
  const [fires, setFires] = useState<{ key: number; x: number; y: number; c: string }[]>([]);
  const fireAt = (x: number, y: number) => {
    const key = Date.now() + Math.random();
    const c = FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)];
    setFires((fs) => [...fs.slice(-4), { key, x, y, c }]);
    later(() => setFires((fs) => fs.filter((f) => f.key !== key)), 2200);
  };

  // ---- 가을 ----
  const autumn = useSeason() === "autumn";
  const autumnRef = useRef(autumn);
  autumnRef.current = autumn;
  // 주운 단풍잎 — 누가 들고 있는지(바닥의 몇 번째 잎인지)
  const [leaf, setLeaf] = useState<{ who: "main" | "friend" | null; idx: number | null }>({ who: null, idx: null });
  const leafRef = useRef(leaf);
  leafRef.current = leaf;
  const [leafSpin, setLeafSpin] = useState(FALL_LEAVES.map(() => 0));
  const tapLeaf = (i: number) => {
    plop();
    otterSound("rustle");
    setLeafSpin((ls) => ls.map((n, j) => (j === i ? n + 1 : n)));
  };

  // ---- 하루의 때 — 실제 시계(확인용: localStorage "ganseobi_daypart" = morning/day/evening) ----
  const [dayPart, setDayPart] = useState<DayPart>("day");
  useEffect(() => {
    const read = () => {
      let f: string | null = null;
      try {
        f = localStorage.getItem("ganseobi_daypart");
      } catch {
        /* 그대로 */
      }
      setDayPart(f === "morning" || f === "day" || f === "evening" ? f : dayPartAt());
    };
    read();
    const id = setInterval(read, 60000);
    return () => clearInterval(id);
  }, []);
  const evening = dayPart === "evening" && !night;

  // ---- 아지트 ----
  const den = () => {
    const { W, H } = size();
    return { W, H, bx: W * DEN_X, top: H - benchTop(W), vx: W * VENT_X };
  };
  const [vent, setVent] = useState({ n: 0, on: false }); // 열수구가 확 끓어오름(조개 굽기/누르기)
  const ventPuff = () => {
    setVent((v) => ({ n: v.n + 1, on: true }));
    later(() => setVent((v) => ({ ...v, on: false })), 1400);
  };
  const [lamp, setLamp] = useState(0); // 해파리 등 반짝
  const tapVent = () => {
    plop();
    otterSound("sizzle");
    ventPuff();
  };
  const tapLamp = () => {
    otterSound("ting");
    setLamp((n) => n + 1);
  };
  // 물속 소리가 켜져 있으면 열수구가 타닥타닥 — 아궁이처럼(심해가 보일 때만)
  useEffect(() => {
    if (!seen || reduce) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!alive) return;
      otterSound("crackle");
      t = setTimeout(tick, (night ? 650 : 260) + Math.random() * (night ? 1500 : 820));
    };
    t = setTimeout(tick, 600);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [seen, reduce, night]);

  // ---- 참견이의 하루 ----
  useEffect(() => {
    if (!ready || mode !== "idle" || night || busy || away || !seen || reduce) return;
    let alive = true;
    const ts: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<boolean>((r) => {
        ts.push(setTimeout(() => r(alive), ms));
      });
    const snd = (s: OtterSound, at = 0) => ts.push(setTimeout(() => alive && otterSound(s), at));

    setMain((b) => ({ ...b, pose: "float", tilt: 0, act: "none", face: null }));
    let lastAct: PlayAct | null = null;

    // 둥둥 천천히 다른 곳으로 → 도착하면 쉬면서 반쯤은 혼자 놀기
    const drift = async (band?: [number, number]) => {
      const { W, H } = size();
      const b = mainNow.current;
      const p = waterPoint(W, H, b, band);
      const ms = clamp((Math.hypot(p.x - b.x, p.y - b.y) / DRIFT_SPEED) * 1000, 7000, 20000);
      setMain((o) => ({ ...o, pose: "float", tilt: 0, act: "none", face: null, x: p.x, y: p.y, ms, ease: EASE_SLOW, facing: faceToward(o.x, p.x, o.facing) }));
      if (!(await wait(ms))) return false;
      if (Math.random() < 0.55) {
        const pool = ACT_NAMES.filter((a) => a !== lastAct);
        const a = pool[Math.floor(Math.random() * pool.length)];
        lastAct = a;
        setMain((o) => ({ ...o, act: a }));
        // 한 번 하고 끝내지 않고 두세 번 이어서
        const reps = 2 + Math.floor(Math.random() * 2);
        for (let k = 0; k < reps; k++) {
          ACTS[a].sounds.forEach(([t, s]) => snd(s, t));
          if (!(await wait(ACTS[a].ms))) return false;
        }
        setMain((o) => ({ ...o, act: "none" }));
      }
      return wait(rand(4000, 8000));
    };

    // 몸 세워서 두리번
    const lookAround = async () => {
      setMain((o) => ({ ...o, pose: "upright", act: "none", tilt: 0, face: "tilt" }));
      if (!(await wait(1700))) return false;
      setMain((o) => ({ ...o, face: "sly", facing: (o.facing * -1) as 1 | -1 }));
      if (!(await wait(1500))) return false;
      setMain((o) => ({ ...o, face: null }));
      if (!(await wait(900))) return false;
      setMain((o) => ({ ...o, pose: "float" }));
      return wait(rand(1500, 2500));
    };

    // 아침 — 기지개부터
    const stretch = async () => {
      setMain((o) => ({ ...o, pose: "upright", act: "none", tilt: 0, face: "sleep" }));
      if (!(await wait(1600))) return false;
      setMain((o) => ({ ...o, face: "surprise" }));
      if (!(await wait(900))) return false;
      setMain((o) => ({ ...o, pose: "float", face: "laugh", act: "groom" }));
      if (!(await wait(ACTS.groom.ms))) return false;
      setMain((o) => ({ ...o, act: "none", face: null }));
      return wait(1500);
    };

    // 바닥까지 "슝" → 해초 톡톡 → 천천히 올라오기
    const dive = async () => {
      const { W, H } = size();
      const b = mainNow.current;
      // 가을이고 아무도 잎을 안 들고 있으면, 반쯤은 해초 대신 바닥의 단풍잎을 주우러 간다
      const goLeaf = autumnRef.current && leafRef.current.who === null && Math.random() < 0.5;
      const li = Math.floor(Math.random() * GROUND_LEAVES.length);
      const wi = Math.floor(Math.random() * WEEDS.length);
      const wx = goLeaf ? GROUND_LEAVES[li].x * W : WEEDS[wi].x * W;
      const side = wx < W / 2 ? 1 : -1; // 해초(잎)의 안쪽(화면 가운데 쪽)에 선다
      const tx = clamp(wx + side * (goLeaf ? 34 : 52), W_UP / 2, W - W_UP / 2);
      const ty = H - FLOOR_BASE - UP_H / 2 - 4;
      const f1 = faceToward(b.x, tx, b.facing);
      // 1) 아래로 몸을 기울이고 잠깐 움츠렸다가
      setMain((o) => ({ ...o, pose: "swim", act: "none", face: "base", facing: f1, tilt: swimTilt(f1, tx - o.x, ty - o.y) }));
      if (!(await wait(650))) return false;
      // 2) 슝
      snd("swish");
      setMain((o) => ({ ...o, x: tx, y: ty, ms: 1400, ease: EASE_DIVE }));
      if (!(await wait(1450))) return false;
      // 3) 도착 — 서서 해초를 톡톡
      setMain((o) => ({ ...o, pose: "upright", tilt: 0, facing: wx > tx ? 1 : -1, face: "surprise" }));
      if (!(await wait(700))) return false;
      if (goLeaf) {
        // 잎을 톡 건드려 보고 → 줍는다(배 위에 올려두고 다닌다)
        setMain((o) => ({ ...o, lean: o.lean + 1, face: "tilt" }));
        snd("rustle", 120);
        if (!(await wait(1100))) return false;
        setLeaf({ who: "main", idx: li });
        snd("ting");
        setMain((o) => ({ ...o, face: "laugh" }));
        if (!(await wait(1600))) return false;
      } else if (leafRef.current.who === "main") {
        // 들고 다니던 잎은 여기 내려놓는다
        setLeaf({ who: null, idx: null });
        snd("tik");
        if (!(await wait(600))) return false;
      }
      const pokes = goLeaf ? 0 : 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < pokes; i++) {
        setMain((o) => ({ ...o, lean: o.lean + 1, face: i === 0 ? "tilt" : "laugh" }));
        hitWeed(wi);
        snd("rustle", 120);
        if (!(await wait(i === pokes - 1 ? 1500 : 1000))) return false;
      }
      setMain((o) => ({ ...o, face: null }));
      if (!(await wait(900))) return false;
      // 4) 천천히 올라오기
      const { W: W2, H: H2 } = size();
      const cur = mainNow.current;
      const p = waterPoint(W2, H2, undefined, [0.14, 0.42]);
      const f2 = faceToward(cur.x, p.x, cur.facing);
      setMain((o) => ({ ...o, pose: "swim", facing: f2, tilt: swimTilt(f2, p.x - o.x, p.y - o.y) }));
      if (!(await wait(450))) return false;
      const up = clamp((Math.hypot(p.x - cur.x, p.y - cur.y) / 60) * 1000, 4500, 8000);
      setMain((o) => ({ ...o, x: p.x, y: p.y, ms: up, ease: EASE_SLOW }));
      if (!(await wait(up))) return false;
      setMain((o) => ({ ...o, pose: "float", tilt: 0 }));
      return wait(rand(1800, 3200));
    };

    // 어디로 헤엄쳐 가기(보통 속도)
    const swimTo = async (x: number, y: number, speed = SWIM_SPEED * 0.8) => {
      const b = mainNow.current;
      const f = faceToward(b.x, x, b.facing);
      setMain((o) => ({ ...o, pose: "swim", act: "none", facing: f, tilt: swimTilt(f, x - o.x, y - o.y) }));
      if (!(await wait(400))) return false;
      const ms = clamp((Math.hypot(x - b.x, y - b.y) / speed) * 1000, 1600, 7000);
      setMain((o) => ({ ...o, x, y, ms, ease: EASE_SLOW }));
      return wait(ms);
    };

    // 아지트 바위 턱에 앉아서 안경 쓰고 책 보기(read=false면 그냥 앉아 있기)
    const sitDen = async (ms: number, read = true) => {
      const d = den();
      const sx = d.bx - 52;
      const sy = d.top - UP_H / 2 + 8;
      const cur = mainNow.current;
      if (Math.hypot(cur.x - sx, cur.y - sy) > 12 && !(await swimTo(sx, sy))) return false;
      setMain((o) => ({ ...o, pose: "upright", tilt: 0, facing: 1, face: read ? "read" : null, act: "none", carry: null, book: read }));
      let left = ms;
      while (left > 0) {
        const t = rand(6000, 10000);
        if (!(await wait(t))) return false;
        left -= t;
        if (!read) {
          const faces: (OtterExpression | null)[] = [null, "sly", "sleep", "laugh"];
          setMain((o) => ({ ...o, face: faces[Math.floor(Math.random() * faces.length)] }));
          continue;
        }
        const r = Math.random();
        if (r < 0.62) {
          // 책장 넘김
          setMain((o) => ({ ...o, page: o.page + 1 }));
          snd("page", 200);
        } else if (r < 0.8) {
          // 읽다가 피식
          setMain((o) => ({ ...o, face: Math.random() < 0.5 ? "laugh" : "sly" }));
          if (!(await wait(2400))) return false;
          setMain((o) => ({ ...o, face: "read" }));
        } else {
          // 꾸벅 졸다가 화들짝
          setMain((o) => ({ ...o, face: "sleep" }));
          if (!(await wait(4000))) return false;
          setMain((o) => ({ ...o, face: "surprise" }));
          if (!(await wait(800))) return false;
          setMain((o) => ({ ...o, face: "read" }));
        }
      }
      if (read) {
        setMain((o) => ({ ...o, book: false, face: "laugh" }));
        if (!(await wait(1500))) return false;
      }
      setMain((o) => ({ ...o, face: null }));
      return true;
    };

    // 열수구에 조개 굽기 → 바위 턱에 누워서 냠냠
    const roast = async () => {
      const d = den();
      if (!(await swimTo(clamp(d.vx - 62, W_UP / 2, d.W - W_UP / 2), d.H - FLOOR_BASE - UP_H / 2 - 4))) return false;
      setMain((o) => ({ ...o, pose: "upright", tilt: 0, facing: 1, face: "base", carry: "shell" }));
      if (!(await wait(700))) return false;
      for (let i = 0; i < 5; i++) {
        setMain((o) => ({ ...o, lean: o.lean + 1, face: i === 4 ? "surprise" : i % 2 ? "base" : "tilt" }));
        ventPuff();
        snd("sizzle", 150);
        if (!(await wait(2000))) return false;
      }
      setMain((o) => ({ ...o, face: "laugh" }));
      snd("ting");
      if (!(await wait(900))) return false;
      const d2 = den();
      if (!(await swimTo(Math.max(d2.bx - 62, W_FLOAT / 2 - 6), d2.top - 30, SWIM_SPEED * 0.6))) return false;
      setMain((o) => ({ ...o, pose: "float", tilt: 0, facing: 1, carry: null, act: "eat" }));
      for (let k = 0; k < 3; k++) {
        ACTS.eat.sounds.forEach(([t, s2]) => snd(s2, t));
        if (!(await wait(ACTS.eat.ms))) return false;
      }
      setMain((o) => ({ ...o, act: "none", face: null }));
      return wait(rand(1500, 2500));
    };

    // 친구 데려오기 — 지금 자리에서 멈춰 세운다
    const holdFriend = () => {
      friendHeld.current = true;
      const fp = readPos(friendEl.current) ?? { x: friendNow.current.x, y: friendNow.current.y };
      setFriend((o) => ({ ...o, x: fp.x, y: fp.y, ms: 0, act: "none", tilt: 0, book: false }));
      return fp;
    };

    // 조약돌 캐치볼 — 마주 보고 서서 주고받기. 마지막에 가끔 놓친다
    const catchBall = async () => {
      const fp = holdFriend();
      const { W, H } = size();
      const b = mainNow.current;
      const y = clamp((b.y + fp.y) / 2, Math.max(TOP_KEEP + 30, H * 0.25), H * 0.58);
      const gap = Math.min(176, W * 0.48);
      const mainLeft = b.x <= fp.x;
      const mx = W / 2 + (mainLeft ? -gap / 2 : gap / 2);
      const fx = W / 2 + (mainLeft ? gap / 2 : -gap / 2);
      const fm = faceToward(b.x, mx, b.facing);
      const ff = faceToward(fp.x, fx, friendNow.current.facing);
      setMain((o) => ({ ...o, pose: "swim", act: "none", face: "base", facing: fm, tilt: swimTilt(fm, mx - o.x, y - o.y) }));
      setFriend((o) => ({ ...o, pose: "swim", face: "base", facing: ff, tilt: swimTilt(ff, fx - o.x, y - o.y) }));
      if (!(await wait(400))) return false;
      const ms = clamp((Math.max(Math.hypot(mx - b.x, y - b.y), Math.hypot(fx - fp.x, y - fp.y)) / (SWIM_SPEED * 0.8)) * 1000, 1600, 5000);
      setMain((o) => ({ ...o, x: mx, y, ms, ease: EASE_SLOW }));
      setFriend((o) => ({ ...o, x: fx, y: y + 8, ms, ease: EASE_SLOW }));
      if (!(await wait(ms))) return false;
      const mf: 1 | -1 = mainLeft ? 1 : -1;
      setMain((o) => ({ ...o, pose: "upright", tilt: 0, facing: mf, face: "laugh" }));
      setFriend((o) => ({ ...o, pose: "upright", tilt: 0, facing: (mf * -1) as 1 | -1, face: "laugh" }));
      if (!(await wait(800))) return false;
      const n = 12 + Math.floor(Math.random() * 7);
      let fromMain = true;
      for (let i = 0; i < n; i++) {
        const miss = i === n - 1 && Math.random() < 0.4;
        const x0 = fromMain ? mx : fx;
        const x1 = fromMain ? fx : mx;
        const dir = x1 > x0 ? 1 : -1;
        if (fromMain) setMain((o) => ({ ...o, lean: o.lean + 1, face: "base" }));
        else setFriend((o) => ({ ...o, lean: o.lean + 1, face: "base" }));
        snd("tik");
        const t = miss ? 2200 : 1500;
        throwBall(x0 + dir * 22, y + 4, miss ? x1 + dir * 60 : x1 - dir * 20, miss ? size().H - FLOOR_BASE - 14 : y + 4, t);
        if (!(await wait(t))) return false;
        if (miss) {
          // 놓쳤다 — 데굴데굴 바닥으로. 둘 다 웃음
          if (fromMain) setFriend((o) => ({ ...o, face: "surprise" }));
          else setMain((o) => ({ ...o, face: "surprise" }));
          snd("tok");
          if (!(await wait(900))) return false;
          setMain((o) => ({ ...o, face: "laugh" }));
          setFriend((o) => ({ ...o, face: "laugh" }));
          break;
        }
        snd("tik");
        if (fromMain) setFriend((o) => ({ ...o, face: i % 2 ? "laugh" : "surprise" }));
        else setMain((o) => ({ ...o, face: i % 2 ? "laugh" : "surprise" }));
        if (!(await wait(900))) return false;
        fromMain = !fromMain;
      }
      if (!(await wait(1400))) return false;
      setBall(null);
      setMain((o) => ({ ...o, pose: "float", face: null }));
      setFriend((o) => ({ ...o, pose: "float", face: null }));
      friendHeld.current = false;
      return wait(rand(2000, 3500));
    };

    // 거품 고리 — 참견이가 후 불면 친구가 쫓아가서 톡 터뜨린다
    const bubbleRings = async () => {
      holdFriend();
      const { H } = size();
      const b = mainNow.current;
      const y = clamp(b.y, TOP_KEEP + 120, H * 0.6);
      setMain((o) => ({ ...o, pose: "upright", tilt: 0, act: "none", face: "base", y, ms: 700, ease: EASE_SLOW }));
      if (!(await wait(900))) return false;
      for (let i = 0; i < 6; i++) {
        const rx = b.x + rand(-14, 14);
        const ry = y - UP_H / 2 + 10;
        const key = Date.now() + Math.random();
        setMain((o) => ({ ...o, face: "surprise", lean: o.lean + 1 }));
        setRings((rs) => [...rs.slice(-3), { key, x: rx, y: ry }]);
        snd("boop");
        // 고리는 2.4초 동안 120px 올라간다 — 친구가 그 자리로 천천히
        const side = i % 2 ? 1 : -1;
        const tx = rx + side * 46;
        const ty = ry - 120;
        const f = friendNow.current;
        const ff = faceToward(f.x, rx, f.facing);
        setFriend((o) => ({ ...o, pose: "swim", face: "laugh", facing: ff, tilt: swimTilt(ff, tx - o.x, ty - o.y), x: tx, y: ty, ms: 2300, ease: EASE_SLOW }));
        if (!(await wait(2400))) return false;
        setRings((rs) => rs.filter((r) => r.key !== key));
        boopAt(rx, ry - 132);
        snd("tik");
        setMain((o) => ({ ...o, face: "laugh" }));
        setFriend((o) => ({ ...o, pose: "float", tilt: 0, facing: (side * -1) as 1 | -1 }));
        if (!(await wait(1800))) return false;
      }
      if (!(await wait(1200))) return false;
      setMain((o) => ({ ...o, pose: "float", face: null }));
      setFriend((o) => ({ ...o, face: null }));
      friendHeld.current = false;
      return wait(rand(2000, 3500));
    };

    // 저녁 — 아지트에 앉아서 빛 플랑크톤 불꽃놀이 구경
    const fireworks = async () => {
      if (!(await sitDen(1200, false))) return false;
      const d = den();
      const n = 8 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        fireAt(clamp(d.bx + rand(-100, 150), 40, d.W - 40), Math.max(d.top - rand(210, 320), TOP_KEEP));
        snd("spark");
        setMain((o) => ({ ...o, face: i % 2 ? "laugh" : "surprise" }));
        if (!(await wait(rand(1800, 3000)))) return false;
      }
      if (!(await wait(1500))) return false;
      setMain((o) => ({ ...o, face: null }));
      return true;
    };

    // 친구랑 — 다가가서 콩, 술래잡기 두 번, 나란히 둥둥
    const playFriend = async () => {
      friendHeld.current = true;
      const fp = readPos(friendEl.current) ?? { x: friendNow.current.x, y: friendNow.current.y };
      setFriend((o) => ({ ...o, x: fp.x, y: fp.y, ms: 0, act: "none", pose: "float", tilt: 0 }));
      const { W } = size();
      const b = mainNow.current;
      const side: 1 | -1 = b.x < fp.x ? 1 : -1; // 참견이가 친구의 어느 쪽에서 오는지
      let tx = clamp(fp.x - side * 120, W_SWIM / 2, W - W_SWIM / 2);
      const f1 = faceToward(b.x, tx, b.facing);
      setMain((o) => ({ ...o, pose: "swim", act: "none", face: "base", facing: f1, tilt: swimTilt(f1, tx - o.x, fp.y - o.y) }));
      if (!(await wait(400))) return false;
      const ms1 = clamp((Math.hypot(tx - b.x, fp.y - b.y) / SWIM_SPEED) * 1000, 1600, 4200);
      setMain((o) => ({ ...o, x: tx, y: fp.y, ms: ms1, ease: EASE_SLOW }));
      if (!(await wait(ms1))) return false;
      // 콩
      setFriend((o) => ({ ...o, facing: (side * -1) as 1 | -1, face: "surprise" }));
      setMain((o) => ({ ...o, pose: "float", tilt: 0, facing: side, face: "laugh", x: o.x + side * 34, ms: 260, ease: EASE_DART }));
      if (!(await wait(260))) return false;
      snd("boop");
      boopAt((tx + fp.x) / 2 + side * 17, fp.y - 40);
      setFriend((o) => ({ ...o, face: "laugh", x: o.x + side * 22, ms: 420, ease: EASE_DART }));
      setMain((o) => ({ ...o, x: o.x - side * 16, ms: 420, ease: EASE_DART }));
      // 들고 있던 단풍잎은 친구한테 준다
      if (leafRef.current.who === "main") {
        setLeaf((l) => ({ ...l, who: "friend" }));
        snd("ting", 300);
      }
      if (!(await wait(1100))) return false;
      // 술래잡기 — 친구가 휙 달아나고 참견이가 쫓아간다
      for (let i = 0; i < 3; i++) {
        const { W: W2, H: H2 } = size();
        const fNow = friendNow.current;
        const q = waterPoint(W2, H2, fNow);
        const ff = faceToward(fNow.x, q.x, fNow.facing);
        setFriend((o) => ({ ...o, pose: "swim", face: "laugh", facing: ff, tilt: swimTilt(ff, q.x - o.x, q.y - o.y) }));
        if (!(await wait(250))) return false;
        snd("swish");
        setFriend((o) => ({ ...o, x: q.x, y: q.y, ms: 2000, ease: EASE_DART }));
        if (!(await wait(380))) return false;
        const m = mainNow.current;
        const s2: 1 | -1 = m.x < q.x ? 1 : -1;
        tx = clamp(q.x - s2 * 118, W_SWIM / 2, W2 - W_SWIM / 2);
        const fm = faceToward(m.x, tx, m.facing);
        setMain((o) => ({ ...o, pose: "swim", face: "laugh", facing: fm, tilt: swimTilt(fm, tx - o.x, q.y - o.y), x: tx, y: q.y, ms: 2600, ease: EASE_DART }));
        if (!(await wait(2650))) return false;
        setMain((o) => ({ ...o, pose: "float", tilt: 0, facing: s2 }));
        setFriend((o) => ({ ...o, pose: "float", tilt: 0, facing: (s2 * -1) as 1 | -1 }));
        snd("boop");
        boopAt((tx + q.x) / 2, q.y - 40);
        if (!(await wait(900))) return false;
      }
      // 나란히 둥둥 — 한참
      if (!(await wait(7000))) return false;
      setMain((o) => ({ ...o, face: null }));
      setFriend((o) => ({ ...o, face: null }));
      friendHeld.current = false;
      return wait(rand(2500, 4000));
    };

    const run = async () => {
      if (!(await wait(rand(1200, 2200)))) return;
      // 저녁 — 아지트로 돌아와서 앉아 있다가, 조개 구워 먹다가, 근처에서 잠깐 놀다가
      if (dayPart === "evening") {
        if (!(await sitDen(rand(6000, 9000)))) return;
        while (alive) {
          const r = Math.random();
          const ok = r < 0.55 ? await sitDen(rand(50000, 90000)) : r < 0.75 ? await roast() : r < 0.92 ? await fireworks() : await drift([0.52, 0.7]);
          if (!ok) return;
        }
        return;
      }
      if (dayPart === "morning" && !(await stretch())) return;
      let last = "";
      while (alive) {
        const r = Math.random();
        let pick = r < 0.3 ? "drift" : r < 0.38 ? "look" : r < 0.52 ? "dive" : r < 0.74 ? "friend" : "den";
        if (pick === last && pick !== "drift") pick = "drift";
        last = pick;
        const ok =
          pick === "drift"
            ? await drift()
            : pick === "look"
              ? await lookAround()
              : pick === "dive"
                ? await dive()
                : pick === "friend"
                  ? friendReading.current
                    ? await sitDen(rand(40000, 80000)) // 친구가 책 보고 있으면 옆에 와서 같이 본다
                    : await [playFriend, catchBall, bubbleRings][Math.floor(Math.random() * 3)]()
                  : (await sitDen(rand(35000, 70000))) && (Math.random() < 0.4 ? await roast() : true);
        if (!ok) return;
      }
    };
    run();
    return () => {
      alive = false;
      friendHeld.current = false;
      ts.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mode, night, busy, away, seen, reduce, dayPart]);

  // ---- 친구 혼자 놀기 — 참견이가 위에 올라가 있어도 계속 ----
  useEffect(() => {
    if (!ready || night || busy || !seen || reduce) return;
    let alive = true;
    const ts: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<boolean>((r) => {
        ts.push(setTimeout(() => r(alive), ms));
      });
    setFriend((b) => ({ ...b, pose: "float", tilt: 0, act: "none", face: null }));
    const seatOf = () => {
      const d = den();
      return { x: d.bx + 58, y: d.top - (UP_H * FRIEND_K) / 2 + 8, d };
    };
    // 아지트 자기 자리로 헤엄쳐 가서 앉기
    const goSeat = async () => {
      const s0 = seatOf();
      const b = friendNow.current;
      if (Math.hypot(b.x - s0.x, b.y - s0.y) > 12) {
        const f = faceToward(b.x, s0.x, b.facing);
        setFriend((o) => ({ ...o, pose: "swim", act: "none", facing: f, tilt: swimTilt(f, s0.x - o.x, s0.y - o.y) }));
        if (!(await wait(400))) return false;
        const ms0 = clamp((Math.hypot(s0.x - b.x, s0.y - b.y) / (SWIM_SPEED * 0.6)) * 1000, 2500, 10000);
        setFriend((o) => ({ ...o, x: s0.x, y: s0.y, ms: ms0, ease: EASE_SLOW }));
        if (!(await wait(ms0))) return false;
      }
      setFriend((o) => ({ ...o, pose: "upright", tilt: 0, facing: -1, face: null, act: "none" }));
      return true;
    };
    // 안경 쓰고 책 보기 — 오래. 책장 넘기고, 피식, 꾸벅
    const readSeat = async (ms: number) => {
      if (!(await goSeat())) return false;
      friendReading.current = true;
      setFriend((o) => ({ ...o, book: true, face: "read" }));
      let left = ms;
      while (left > 0 && alive && !friendHeld.current) {
        const t = rand(7000, 11000);
        if (!(await wait(t))) return false;
        left -= t;
        const r = Math.random();
        if (r < 0.6) {
          setFriend((o) => ({ ...o, page: o.page + 1 }));
          otterSound("page");
        } else if (r < 0.8) {
          setFriend((o) => ({ ...o, face: "laugh" }));
          if (!(await wait(2200))) return false;
          setFriend((o) => ({ ...o, face: "read" }));
        } else {
          setFriend((o) => ({ ...o, face: "sleep" }));
          if (!(await wait(4500))) return false;
          setFriend((o) => ({ ...o, face: "read" }));
        }
      }
      friendReading.current = false;
      setFriend((o) => ({ ...o, book: false, face: null }));
      return wait(1500);
    };
    // 바위 턱에 누워서 냠냠
    const lieEat = async () => {
      const s = seatOf();
      setFriend((o) => ({ ...o, pose: "float", facing: -1, x: Math.min(s.d.bx + 84, s.d.W - (W_FLOAT * FRIEND_K) / 2 + 6), y: s.d.top - 24, ms: 1200, ease: EASE_SLOW, act: "eat" }));
      if (!(await wait(ACTS.eat.ms * 2 + 1200))) return false;
      setFriend((o) => ({ ...o, act: "none", pose: "upright", x: s.x, y: s.y, ms: 900 }));
      return wait(1000);
    };
    // 저녁 — 친구도 아지트로. 거의 책 보고, 가끔 누워서 냠냠
    const evening = async () => {
      while (alive) {
        if (!(await readSeat(rand(50000, 90000)))) return;
        if (Math.random() < 0.4 && !(await lieEat())) return;
      }
    };
    const run = async () => {
      if (dayPart === "evening") return evening();
      if (!(await wait(rand(2500, 5000)))) return;
      while (alive) {
        if (friendHeld.current) {
          if (!(await wait(800))) return;
          continue;
        }
        const { W, H } = size();
        const b = friendNow.current;
        const p = waterPoint(W, H, b, [0.2, 0.62]);
        // 반쯤은 아지트에 가서 책을 본다 — 떠다니기만 하지 않게
        if (Math.random() < 0.45) {
          if (!(await readSeat(rand(40000, 90000)))) return;
          continue;
        }
        const ms = clamp((Math.hypot(p.x - b.x, p.y - b.y) / FRIEND_DRIFT_SPEED) * 1000, 9000, 22000);
        setFriend((o) => ({ ...o, pose: "float", tilt: 0, act: "none", x: p.x, y: p.y, ms, ease: EASE_SLOW, facing: faceToward(o.x, p.x, o.facing) }));
        if (!(await wait(ms))) return;
        if (friendHeld.current) continue;
        // 받은 단풍잎은 한참 들고 다니다가 놓친다(바닥으로 돌아간다)
        if (leafRef.current.who === "friend" && Math.random() < 0.3) setLeaf({ who: null, idx: null });
        if (Math.random() < 0.45) {
          const a = FRIEND_ACTS[Math.floor(Math.random() * FRIEND_ACTS.length)];
          setFriend((o) => ({ ...o, act: a }));
          if (!(await wait(ACTS[a].ms * (2 + Math.floor(Math.random() * 2))))) return;
          setFriend((o) => ({ ...o, act: "none" }));
        }
        if (!(await wait(rand(5000, 10000)))) return;
      }
    };
    run();
    return () => {
      alive = false;
      friendReading.current = false;
      ts.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, night, busy, seen, reduce, dayPart]);

  // ---- 밤 — 둘이 손잡고 쿨쿨(떠내려가지 않게) ----
  useEffect(() => {
    if (!ready || !night || mode !== "idle") return; // 말하고 나면 다시 잠자리로
    // 아지트 바위 턱에 각자 자리에 앉아 꾸벅꾸벅 존다(열수구 불빛 옆)
    const d = den();
    const ms = reduce ? 0 : 4000;
    setMain((b) => ({ ...b, pose: "upright", tilt: 0, act: "none", face: null, carry: null, book: false, facing: 1, x: d.bx - 52, y: d.top - UP_H / 2 + 8, ms, ease: EASE_SLOW }));
    setFriend((b) => ({ ...b, pose: "upright", tilt: 0, act: "none", face: null, book: false, facing: -1, x: d.bx + 58, y: d.top - (UP_H * FRIEND_K) / 2 + 8, ms, ease: EASE_SLOW }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, night, mode]);

  // 말을 걸 땐 그 자리에 멈춘다(헤엄 중이어도)
  useEffect(() => {
    if (mode === "idle") return;
    const p = readPos(mainEl.current);
    if (p) setMain((b) => ({ ...b, x: p.x, y: p.y, ms: 0, act: "none", tilt: 0 }));
  }, [mode]);

  // 연출 중 최신 값을 읽으려고
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const nextReminderRef = useRef(nextReminder);
  nextReminderRef.current = nextReminder;

  const speak = (text: string, ms: number) => {
    setSay({ text, key: Date.now() });
    later(() => setSay(null), ms);
  };

  const showGrowth = () => {
    const s = stageRef.current;
    clearAll();
    setMode("growth");
    speak(GROWTH_LINES[s] ?? "여기 뭔가 바뀜", 5200);
    later(() => onSeen(s), 1800); // 봤다고 기록 — 다음에 다시 열어도 같은 변화를 새것처럼 하지 않는다
    later(() => setMode("idle"), 5600);
  };

  // ---- 내려와서 심해가 보이면 ----
  const inView = useRef(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (es) => {
        const e = es[0];
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          if (inView.current) return;
          inView.current = true;
          setSeen(true);
          if (busyRef.current) return;
          if (pendingRef.current) {
            showGrowth();
            return;
          }
          // 내려올 때마다 인사하지 않는다 — 언제 말할지는 lib/otterCues.ts가 정한다(6시간에 한 번 이하).
          const { cue, next } = decideCue({ type: "deep_arrive", night, nextReminder: nextReminderRef.current }, loadOtterMemory());
          if (!cue) return;
          saveOtterMemory(next);
          clearAll();
          setFace(cue.expression);
          setMode("discover");
          if (cue.line) speak(cue.line, cue.ms);
          later(() => setMode("idle"), cue.ms + 200);
        } else if (!e.isIntersecting || e.intersectionRatio < 0.2) {
          inView.current = false;
          setSeen(false);
        }
      },
      { threshold: [0, 0.2, 0.5, 0.8] }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [night]);

  // 이미 심해를 보고 있는데 서버에서 새 단계가 도착하면(녹음 직후 등) 그 자리에서 보여준다
  useEffect(() => {
    if (pending && inView.current && !busy && mode === "idle") showGrowth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, busy]);

  const tap = () => {
    if (mode === "growth") return;
    plop();
    clearAll();
    const n = tapN + 1;
    setTapN(n);
    // 지금 실제 상태로만 말한다. 할 말을 다 하면 더 지어내지 않고 웃기만(말 없음).
    const cue = deepTapCue({ fishCount, stage, noteCount, nextReminder }, n - 1);
    setFace(cue.expression);
    if (cue.expression === "laugh") {
      setMode("discover");
      if (cue.line) speak(cue.line, cue.ms);
      later(() => setMode("idle"), cue.ms + 200);
      return;
    }
    setMode("curious");
    if (cue.line) speak(cue.line, cue.ms);
    later(() => setMode("idle"), cue.ms + 200);
  };

  const tapFriend = () => {
    plop();
    otterSound("boop");
    setFriendSpin((n) => n + 1);
    setFriend((b) => ({ ...b, face: "laugh" }));
    later(() => setFriend((b) => ({ ...b, face: null })), 1400);
  };

  const tapWeed = (i: number) => {
    plop();
    otterSound("rustle");
    hitWeed(i);
  };

  // ---- 그리기 ----
  const upright = mode === "discover" || mode === "growth";
  const pose: Pose = mode !== "idle" ? (upright ? "upright" : "float") : main.pose;
  const tilt = mode !== "idle" ? 0 : main.tilt;
  const act: OtterAct = mode === "idle" && pose === "float" && !night ? main.act : "none";
  const expr: OtterExpression =
    mode === "growth"
      ? "proud"
      : mode !== "idle" && face
        ? face
        : night
          ? "sleep"
          : act !== "none"
            ? ACTS[act as PlayAct].face
            : main.face ?? "base";
  const fAct: OtterAct = friend.pose === "float" && !night ? friend.act : "none";
  const fExpr: OtterExpression = night ? "sleep" : friend.face ?? (fAct !== "none" ? ACTS[fAct as PlayAct].face : "base");
  const { W } = ready ? size() : { W: 375 };
  const bw = benchW(W);
  const warm = night ? 0.75 : evening ? 1 : 0.5; // 아지트 불빛 세기
  const mainHold: OtterHolding = main.book ? "book" : main.carry ?? (leaf.who === "main" ? "leaf" : holdingFor(stage));
  const friendHold: OtterHolding = friend.book ? "book" : leaf.who === "friend" ? "leaf" : "none";
  const pageCls = (b: Body) => (b.page ? (b.page % 2 ? " ds-pageA" : " ds-pageB") : "");
  const sayLeft = clamp(main.x, Math.min(150, W / 2), Math.max(W - 150, W / 2));
  const sayTop = Math.max(main.y - (pose === "upright" ? UP_H / 2 + 8 : 60), TOP_KEEP - 30);

  const bodyStyle = (b: Body): React.CSSProperties => ({
    transform: `translate(${b.x}px, ${b.y}px)`,
    transition: b.ms > 0 ? `transform ${b.ms}ms ${b.ease}` : "none",
  });

  return (
    <section
      ref={rootRef}
      className="ds-root"
      style={{ background: `linear-gradient(${topColor} 0%, ${mid} 32%, ${deep} 100%)` }}
      aria-label="심해 — 참견이가 사는 곳"
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* 깊은 곳까지 내려오는 희미한 빛 */}
      <div className={`ds-ray ${autumn ? "ds-ray-warm" : ""}`} style={{ left: "22%" }} />
      <div className={`ds-ray ${autumn ? "ds-ray-warm" : ""}`} style={{ left: "64%", width: 40, animationDelay: "-2.4s" }} />

      {/* 저녁 — 물빛이 조금 어둑해진다(아지트 불빛이 더 따뜻해 보이게) */}
      <div className="ds-dusk" style={{ opacity: evening ? 1 : 0 }} aria-hidden />
      {/* 아지트 불빛 — 열수구와 해파리 등이 바닥을 따뜻하게 비춘다 */}
      <div
        className="ds-warm"
        style={{
          opacity: warm,
          background: `radial-gradient(ellipse 46% 34% at ${VENT_X * 100}% 86%, rgba(255,158,64,.42), rgba(255,158,64,0) 70%), radial-gradient(ellipse 40% 30% at ${DEN_X * 100 + 4}% 70%, rgba(255,214,150,.26), rgba(255,214,150,0) 70%)`,
        }}
        aria-hidden
      />

      {/* 가을 — 천천히 가라앉는 단풍잎. 눌러보면 빙글 */}
      {autumn &&
        FALL_LEAVES.map((l, i) => (
          <div key={i} className="ds-fall" style={{ left: `${l.left}%`, animationDuration: `${l.dur}s`, animationDelay: `${l.delay}s`, opacity: night ? 0.75 : 1 }}>
            <div className="ds-fall-sway" style={{ animationDelay: `${l.delay / 3}s` }}>
              <button className={`ds-leafbtn ${leafSpin[i] ? (leafSpin[i] % 2 ? "ds-spinA" : "ds-spinB") : ""}`} onClick={() => tapLeaf(i)} aria-label="단풍잎">
                <svg width={l.size} height={l.size} viewBox="0 0 24 24" style={{ overflow: "visible", display: "block" }} aria-hidden>
                  {mapleG(LEAF_COLORS[l.c], 12, 12, 1, 0, 1.8)}
                </svg>
              </button>
            </div>
          </div>
        ))}

      {/* 떠다니는 작은 빛 알갱이 */}
      {MOTES.map((m, i) => (
        <span key={i} className="ds-mote" style={m} />
      ))}

      {/* 5 보물 굴 — 뒤쪽 바위 아치 */}
      {stage >= 5 && (
        <svg className="ds-deco" viewBox="0 0 320 220" style={{ left: "50%", bottom: 60, width: "min(300px, 86%)", transform: "translateX(-50%)", zIndex: 1 }} aria-hidden>
          <path className="ds-ol" d="M10 220 C10 120 60 40 160 40 C260 40 310 120 310 220 L250 220 C250 150 214 104 160 104 C106 104 70 150 70 220 Z" fill="#3B4F7A" />
          <path d="M40 200 C44 150 70 92 120 70" fill="none" stroke="#6176A8" strokeWidth={6} strokeLinecap="round" opacity={0.6} />
          {[
            [92, 120],
            [128, 92],
            [170, 86],
            [212, 98],
            [240, 128],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle className="ds-glow" cx={x} cy={y} r={11} fill="#FFF3B0" opacity={0.4} style={{ animationDelay: `${-i * 0.5}s` }} />
              <circle className="ds-ol2" cx={x} cy={y} r={5} fill="#FFFDF4" />
            </g>
          ))}
        </svg>
      )}

      {/* 3 다시마 숲 — 양옆 큰 다시마 */}
      {stage >= 3 && (
        <>
          <svg className="ds-deco" width="70" height="330" viewBox="0 0 60 300" style={{ left: -6, bottom: 60, zIndex: 2 }} aria-hidden>
            <path className="ds-ol ds-sway" d={KELP_TALL} fill="#2FAF6A" />
          </svg>
          <svg className="ds-deco" width="54" height="250" viewBox="0 0 60 300" style={{ left: 40, bottom: 56, zIndex: 2 }} aria-hidden>
            <path className="ds-ol ds-sway" d={KELP_TALL} fill="#46C985" style={{ animationDelay: "-1.6s" }} />
          </svg>
          <svg className="ds-deco" width="66" height="300" viewBox="0 0 60 300" style={{ right: -4, bottom: 60, zIndex: 2 }} aria-hidden>
            <path className="ds-ol ds-sway" d={KELP_TALL} fill="#2FAF6A" style={{ animationDelay: "-0.8s" }} />
          </svg>
          <svg className="ds-deco" width="50" height="220" viewBox="0 0 60 300" style={{ right: 44, bottom: 56, zIndex: 2 }} aria-hidden>
            <path className="ds-ol ds-sway" d={KELP_TALL} fill="#46C985" style={{ animationDelay: "-2.2s" }} />
          </svg>
        </>
      )}

      {/* 바닥 */}
      <div className="ds-floor" aria-hidden={false}>
        {/* 아지트 — 바위 턱(앉는 자리). 해면 방석 두 개 */}
        <svg className="ds-deco" width={bw} height={bw / 4} viewBox="0 0 240 60" style={{ left: `calc(${DEN_X * 100}% - ${bw / 2}px)`, bottom: BENCH_BOTTOM, zIndex: 2 }} aria-hidden>
          <path className="ds-ol" d="M10 58 C2 44 8 22 30 16 C70 6 170 6 212 14 C234 20 240 40 230 58 Z" fill={night ? "#5E6D96" : "#7B8DB8"} />
          <path d="M30 22 C70 13 170 13 206 20" fill="none" stroke={night ? "#7D8DB8" : "#A3B4DC"} strokeWidth={5} strokeLinecap="round" />
          <ellipse cx="44" cy="42" rx="7" ry="4" fill="#4FA97D" opacity={0.8} />
          <ellipse cx="196" cy="46" rx="9" ry="4.5" fill="#4FA97D" opacity={0.8} />
          <ellipse cx="150" cy="36" rx="3.5" ry="3" fill="#FFFFFF" opacity={0.6} />
          <ellipse className="ds-ol2" cx="68" cy="14" rx="28" ry="7" fill="#FF9EC4" />
          <ellipse className="ds-ol2" cx="178" cy="14" rx="24" ry="6.5" fill="#FFC86B" />
        </svg>
        {/* 아지트 — 해파리 등(바위 턱 위에 둥둥). 눌러보면 반짝 */}
        <button
          className={`ds-lamp ${lamp ? (lamp % 2 ? "ds-lampA" : "ds-lampB") : ""}`}
          style={{ left: `calc(${DEN_X * 100}% - 23px)`, bottom: benchTop(W) + 150 }}
          onClick={tapLamp}
          aria-label="해파리 등"
        >
          <span className="ds-lamp-glow" style={{ opacity: night || evening ? 1 : 0.55 }} />
          <svg width="46" height="62" viewBox="0 0 46 62" style={{ overflow: "visible", display: "block", position: "relative" }} aria-hidden>
            <path className="ds-tent" d="M12 30 C10 40 16 46 12 58 M20 31 C19 42 24 48 21 60 M28 31 C29 42 24 48 27 60 M35 30 C37 40 31 46 35 57" fill="none" stroke="#1B1630" strokeWidth={2} strokeLinecap="round" />
            <path className="ds-ol2" d="M4 30 C3 12 13 3 23 3 C33 3 43 12 42 30 C36 27 31 33 23 30 C15 33 10 27 4 30 Z" fill="#F7B8E0" />
            <ellipse cx="23" cy="18" rx="9" ry="7" fill="#FFF3B0" opacity={night || evening ? 0.95 : 0.7} />
            <ellipse cx="15" cy="12" rx="3.2" ry="2" fill="#FFFFFF" opacity={0.8} />
          </svg>
        </button>
        {/* 아지트 — 열수구(물속 아궁이). 주황빛이 일렁이고 방울이 올라온다. 눌러보면 확 끓어오름 */}
        <button className={`ds-vent ${vent.on ? (vent.n % 2 ? "ds-ventA" : "ds-ventB") : ""}`} style={{ left: `calc(${VENT_X * 100}% - ${VENT_W / 2}px)`, bottom: VENT_BOTTOM }} onClick={tapVent} aria-label="열수구">
          <span className="ds-vent-glow" />
          <svg width={VENT_W} height="80" viewBox="0 0 84 80" style={{ overflow: "visible", display: "block", position: "relative" }} aria-hidden>
            <path className="ds-ol" d="M4 80 C10 62 22 48 28 22 L56 22 C62 48 74 62 80 80 Z" fill={night ? "#4A4462" : "#5D5577"} />
            <path d="M22 66 L30 54 L28 44 M58 70 L54 58 L58 48" fill="none" stroke="#FF9E4A" strokeWidth={2.4} strokeLinecap="round" className="ds-crack" />
            <ellipse className="ds-ol2" cx="42" cy="22" rx="15" ry="6" fill="#FFB347" />
            <ellipse className="ds-ember" cx="42" cy="22" rx="9" ry="3.4" fill="#FFE68A" />
          </svg>
          {[0, 1, 2, 3, 4].map((k) => (
            <span key={k} className="ds-vbub" style={{ left: 34 + ((k * 7) % 14), width: 6 + (k % 3) * 3, height: 6 + (k % 3) * 3, animationDelay: `${-k * 0.62}s`, animationDuration: `${2.6 + (k % 3) * 0.5}s` }} />
          ))}
        </button>
        {/* 해초 — 항상 있다. 눌러도 되고, 참견이도 내려와서 건드린다 */}
        {WEEDS.map((w, i) => (
          <button
            key={i}
            className={`ds-weed ${weeds[i].on ? (weeds[i].n % 2 ? "ds-hitA" : "ds-hitB") : ""}`}
            style={{ left: `${w.x * 100}%`, height: w.h }}
            onClick={() => tapWeed(i)}
            aria-label="해초"
          >
            <svg width={64} height={w.h} viewBox="0 0 64 120" preserveAspectRatio="none" aria-hidden>
              <path className="ds-ol2 ds-blade" d="M18 120 C10 96 24 82 16 60 C10 42 22 28 18 8 C30 30 22 46 28 64 C34 84 24 100 26 120 Z" fill={w.c2} style={{ animationDelay: "-0.7s" }} />
              <path className="ds-ol2 ds-blade" d="M32 120 C26 92 40 74 32 48 C26 28 36 14 34 0 C46 20 40 40 44 56 C50 80 38 98 40 120 Z" fill={w.c1} />
              <path className="ds-ol2 ds-blade" d="M44 120 C40 100 52 90 48 72 C46 60 52 50 54 40 C62 56 56 70 58 84 C60 100 52 108 52 120 Z" fill={w.c2} style={{ animationDelay: "-1.9s" }} />
            </svg>
            {weeds[i].on &&
              [0, 1, 2].map((k) => (
                <span key={`${weeds[i].n}-${k}`} className="ds-wbub" style={{ left: 18 + k * 12, animationDelay: `${k * 0.15}s` }} />
              ))}
          </button>
        ))}
        {/* 1 다시마 싹 */}
        {stage >= 1 && stage < 3 && (
          <>
            <svg className="ds-deco" width="30" height="90" viewBox="0 0 40 140" style={{ left: "58%", bottom: 64 }}>
              <path className="ds-ol ds-sway" d={WEED} fill="#46C985" />
            </svg>
            <svg className="ds-deco" width="22" height="62" viewBox="0 0 40 140" style={{ left: "63%", bottom: 60 }}>
              <path className="ds-ol ds-sway" d={WEED} fill="#2FAF6A" style={{ animationDelay: "-1.3s" }} />
            </svg>
          </>
        )}
        {/* 2 조약돌 더미 */}
        {stage >= 2 && (
          <svg className="ds-deco" width="96" height="56" viewBox="0 0 96 56" style={{ left: "-4%", bottom: 50, zIndex: 3 }}>
            <ellipse className="ds-ol2" cx="22" cy="44" rx="16" ry="10" fill="#9CC9EC" />
            <ellipse className="ds-ol2" cx="52" cy="46" rx="18" ry="9" fill="#FF9EC4" />
            <ellipse className="ds-ol2" cx="78" cy="44" rx="14" ry="9" fill="#FFD54A" />
            <ellipse className="ds-ol2" cx="38" cy="30" rx="14" ry="9" fill="#B9A7F2" />
            <ellipse className="ds-ol2" cx="64" cy="30" rx="13" ry="8" fill="#8BE0C0" />
            <ellipse className="ds-ol2" cx="51" cy="16" rx="11" ry="7.5" fill="#FFFFFF" />
          </svg>
        )}
        {/* 4 조개 정원 */}
        {stage >= 4 && (
          <>
            <svg className="ds-deco" width="70" height="50" viewBox="0 0 70 50" style={{ left: "6%", bottom: 54, zIndex: 3 }}>
              <path className="ds-ol" d="M6 40 Q4 18 22 14 L48 14 Q66 18 64 40 Z" fill="#FFC2D6" />
              <path className="ds-ol" d="M8 20 Q10 2 35 2 Q60 2 62 20 Q48 12 35 12 Q22 12 8 20 Z" fill="#FFB0C8" transform="rotate(-14 35 14)" />
              <circle className="ds-glow" cx="35" cy="30" r="13" fill="#FFF3B0" opacity={0.5} />
              <circle className="ds-ol2" cx="35" cy="30" r="7" fill="#FFFDF4" />
            </svg>
            <svg className="ds-deco" width="34" height="28" viewBox="0 0 34 28" style={{ left: "48%", bottom: 50, zIndex: 3 }}>
              <path className="ds-ol2" d="M3 24 Q2 6 17 4 Q32 6 31 24 Z" fill="#FFE1A8" />
              <path className="ds-ol2" d="M10 23 L13 8 M17 23 L17 6 M24 23 L21 8" fill="none" />
            </svg>
            <svg className="ds-deco" width="28" height="24" viewBox="0 0 34 28" style={{ right: "4%", bottom: 50, zIndex: 3 }}>
              <path className="ds-ol2" d="M3 24 Q2 6 17 4 Q32 6 31 24 Z" fill="#C9B6FF" />
              <path className="ds-ol2" d="M10 23 L13 8 M17 23 L17 6 M24 23 L21 8" fill="none" />
            </svg>
          </>
        )}
        {/* 가을 — 바닥에 쌓인 단풍잎(참견이가 주워 가면 그 자리는 빈다) */}
        {autumn &&
          GROUND_LEAVES.map((g, i) =>
            leaf.idx === i ? null : (
              <svg key={i} className="ds-deco" width="38" height="26" viewBox="0 4 24 16" style={{ left: `calc(${g.x * 100}% - 19px)`, bottom: 42 + (i % 2) * 6, zIndex: 4 }} aria-hidden>
                {mapleG(LEAF_COLORS[g.c], 12, 12, 0.9, g.rot, 1.8)}
              </svg>
            )
          )}
        <svg className="ds-sand" viewBox="0 0 332 84" preserveAspectRatio="none" aria-hidden>
          <path className="ds-ol" d="M-4 40 C40 30 80 44 120 36 C160 26 200 42 240 34 C280 26 310 38 336 32 V90 H-4 Z" fill={night ? "#C9AE70" : "#E8C77A"} />
          {SAND_PEBBLES.map(([cx, cy, rx, ry, c], i) => (
            <ellipse key={i} className="ds-ol2" cx={cx} cy={cy} rx={rx} ry={ry} fill={c} />
          ))}
        </svg>
      </div>
     
  
      {/* 친구 — 말은 안 한다. 눌러보면 빙글 */}
      <div ref={friendEl} className="ds-body ds-friend" style={{ ...bodyStyle(friend), opacity: ready ? 1 : 0 }}>
        <div className="ds-tilt" style={{ transform: `translate(-50%, -50%) rotate(${friend.tilt}deg)` }}>
          <div className={`ds-flip ${friendTurning ? "ds-turning" : ""}`} style={{ transform: `scaleX(${friend.facing})` }}>
            <button
              className={`ds-otter ${friend.pose === "swim" ? "ds-swim" : friend.pose === "upright" ? (night ? "ds-breathe" : "ds-up") : night ? "ds-float ds-sleepy" : "ds-float"} ${friendSpin ? (friendSpin % 2 ? "ds-spinA" : "ds-spinB") : ""}`}
              onClick={tapFriend}
              aria-label="참견이 친구"
            >
              <div className={(friend.lean ? (friend.lean % 2 ? "ds-leanA" : "ds-leanB") : "") + pageCls(friend)}>
                {friend.pose === "swim" ? (
                  <OtterSwim expression={fExpr} holding={friendHold} width={W_SWIM * FRIEND_K} />
                ) : friend.pose === "upright" ? (
                  <OtterBody pose="upright" expression={fExpr} holding={friendHold} glasses={friend.book} width={W_UP * FRIEND_K} />
                ) : (
                  <OtterBody pose="float" expression={fExpr} holding={friendHold} act={fAct} width={W_FLOAT * FRIEND_K} />
                )}
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* 참견이 */}
      <div
        ref={mainEl}
        className="ds-body"
        style={{
          transform: `translate(${main.x}px, ${main.y}px)`,
          transition: main.ms > 0 ? `transform ${main.ms}ms ${main.ease}, opacity .5s ease` : "opacity .5s ease",
                    opacity: ready && !away ? 1 : 0,
        }}
        aria-hidden={away}
      >
        <div className="ds-tilt" style={{ transform: `translate(-50%, -50%) rotate(${tilt}deg)` }}>
          <div className={`ds-flip ${mainTurning && pose !== "upright" ? "ds-turning" : ""}`} style={{ transform: `scaleX(${pose === "upright" && mode !== "idle" ? 1 : main.facing})` }}>
            <div className={(main.lean ? (main.lean % 2 ? "ds-leanA" : "ds-leanB") : "") + pageCls(main)}>
              <button
                className={`ds-otter ${pose === "swim" ? "ds-swim" : pose === "upright" ? (night && mode === "idle" ? "ds-breathe" : "ds-up") : night ? "ds-float ds-sleepy" : "ds-float"} ${mode === "growth" ? "ds-proud" : ""}`}
                onClick={tap}
                aria-label="참견이"
              >
                {pose === "swim" ? (
                  <OtterSwim expression={expr} holding={mainHold} width={W_SWIM} />
                ) : pose === "upright" ? (
                  <OtterBody pose="upright" expression={expr} holding={mainHold} glasses={main.book} kelp={stage >= 3} wave={mode === "discover"} width={W_UP} />
                ) : (
                  <OtterBody pose="float" expression={expr} holding={mainHold} kelp={stage >= 3} act={act} width={W_FLOAT} />
                )}
              </button>
            </div>
          </div>
        </div>
        {night && (
          <>
            <span className="ds-zz" style={{ left: 30, animationDelay: "-1s" }}>z</span>
            <span className="ds-zz" style={{ left: 44, fontSize: 20, animationDelay: "-2.6s" }}>z</span>
          </>
        )}
        {mode === "growth" && (
          <div className="ds-burst" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} style={{ transform: `rotate(${i * 60}deg) translateY(-92px)`, animationDelay: `${i * 0.06}s` }} />
            ))}
          </div>
        )}
      </div>

      {/* 콩! / 톡! — 반짝 별(연애 기호인 하트는 안 쓴다) */}
      {boops.map((b) => (
        <span key={b.key} className="ds-boop" style={{ left: b.x, top: b.y }} aria-hidden>
          <svg width="34" height="30" viewBox="0 0 34 30" style={{ overflow: "visible" }}>
            <path d="M14 2 L16.4 10.6 L25 13 L16.4 15.4 L14 24 L11.6 15.4 L3 13 L11.6 10.6 Z" fill="#FFE066" stroke="#1B1630" strokeWidth={2} strokeLinejoin="round" />
            <path d="M28 2 L29 5.5 L32.5 6.5 L29 7.5 L28 11 L27 7.5 L23.5 6.5 L27 5.5 Z" fill="#FFFFFF" stroke="#1B1630" strokeWidth={1.4} strokeLinejoin="round" />
            <circle cx="28" cy="23" r="2.4" fill="#8BE0C0" stroke="#1B1630" strokeWidth={1.4} />
          </svg>
        </span>
      ))}

      {/* 캐치볼 조약돌 */}
      {ball && (
        <div
          key={ball.key}
          className="ds-ball"
          style={{
            transform: `translate(${ball.go ? ball.x1 : ball.x0}px, ${ball.go ? ball.y1 : ball.y0}px)`,
            transition: ball.go ? `transform ${ball.ms}ms linear` : "none",
          }}
          aria-hidden
        >
          <span className="ds-ball-arc" style={{ animationDuration: `${ball.ms}ms` }}>
            <svg width="24" height="19" viewBox="0 0 18 14" style={{ display: "block" }}>
              <ellipse cx="9" cy="7" rx="7.5" ry="5.6" fill="#9CC9EC" stroke="#1B1630" strokeWidth={2} />
              <ellipse cx="6.4" cy="5" rx="2.2" ry="1.3" fill="#FFFFFF" opacity={0.85} />
            </svg>
          </span>
        </div>
      )}

      {/* 거품 고리 */}
      {rings.map((r) => (
        <span key={r.key} className="ds-ring" style={{ left: r.x, top: r.y }} aria-hidden>
          <svg width="40" height="22" viewBox="0 0 40 22" style={{ display: "block", overflow: "visible" }}>
            <ellipse cx="20" cy="11" rx="17" ry="7.5" fill="none" stroke="#FFFFFF" strokeWidth={4} opacity={0.85} />
            <ellipse cx="20" cy="11" rx="17" ry="7.5" fill="none" stroke="#BDE8FF" strokeWidth={1.6} />
          </svg>
        </span>
      ))}

      {/* 빛 플랑크톤 불꽃 — 저녁 아지트 */}
      {fires.map((f) => (
        <span key={f.key} className="ds-fire" style={{ left: f.x, top: f.y }} aria-hidden>
          <span className="ds-fire-core" style={{ background: f.c }} />
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="ds-fire-dot" style={{ background: i % 3 === 0 ? "#FFFFFF" : f.c, ["--a" as any]: `${i * 30}deg`, ["--r" as any]: `${58 + (i % 2) * 18}px` }} />
          ))}
        </span>
      ))}

      {/* 말풍선 — 멈춘 자리 위에 */}
      {say && (
        <div key={say.key} className="ds-say" role="status" style={{ left: sayLeft, top: sayTop }}>
          {say.text}
        </div>
      )}
    </section>
  );
}

const WEED = "M20 140 C8 110 30 95 18 70 C8 48 28 35 20 6 C34 30 22 50 30 72 C40 98 24 112 28 140 Z";
const KELP_TALL =
  "M28 300 C14 260 40 236 24 200 C10 168 38 146 26 112 C16 84 40 62 30 30 C28 18 32 8 36 2 C44 24 38 44 42 70 C48 100 30 122 40 152 C50 184 30 206 42 238 C52 266 36 282 40 300 Z";

const SAND_PEBBLES: [number, number, number, number, string][] = [
  [40, 56, 11, 7, "#9CC9EC"],
  [96, 66, 8, 5.5, "#FF9EC4"],
  [176, 58, 10, 6.5, "#FFFFFF"],
  [250, 66, 9, 6, "#B9A7F2"],
  [302, 56, 11, 7, "#8BE0C0"],
];

const MOTES: React.CSSProperties[] = [
  { left: "12%", top: "18%", animationDelay: "0s" },
  { left: "78%", top: "12%", animationDelay: "-3s" },
  { left: "36%", top: "8%", animationDelay: "-6s" },
  { left: "88%", top: "44%", animationDelay: "-1.5s" },
  { left: "6%", top: "52%", animationDelay: "-4.5s" },
  { left: "54%", top: "64%", animationDelay: "-7s" },
];

const CSS = `
.ds-root{position:relative;height:max(94dvh,640px);overflow:hidden}
.ds-ray{position:absolute;top:-10px;width:30px;height:70%;background:linear-gradient(rgba(255,255,255,.12),rgba(255,255,255,0));transform:rotate(14deg);transform-origin:top;animation:ds-shimmer 6s ease-in-out infinite alternate;pointer-events:none}
@keyframes ds-shimmer{from{opacity:.4}to{opacity:1}}
.ds-dusk{position:absolute;inset:0;background:linear-gradient(rgba(70,40,120,0) 0%,rgba(52,28,96,.32) 100%);transition:opacity 2s ease;pointer-events:none;z-index:1}
.ds-warm{position:absolute;inset:0;pointer-events:none;z-index:1;transition:opacity 2s ease;animation:ds-flicker 3.2s ease-in-out infinite}
@keyframes ds-flicker{0%,100%{filter:brightness(1)}30%{filter:brightness(1.18)}55%{filter:brightness(.92)}80%{filter:brightness(1.1)}}
.ds-lamp{position:absolute;z-index:3;padding:0;margin:0;border:0;background:none;cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent;animation:ds-lampbob 4.6s ease-in-out infinite alternate}
@keyframes ds-lampbob{from{transform:translateY(-6px)}to{transform:translateY(6px)}}
.ds-lamp-glow{position:absolute;left:50%;top:22px;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;background:radial-gradient(circle,rgba(255,236,170,.55),rgba(255,236,170,0) 68%);animation:ds-glow2 3.4s ease-in-out infinite;pointer-events:none}
@keyframes ds-glow2{0%,100%{transform:scale(.9)}50%{transform:scale(1.08)}}
.ds-lamp .ds-tent{animation:ds-tent 2.4s ease-in-out infinite alternate;transform-origin:50% 0;transform-box:fill-box}
@keyframes ds-tent{from{transform:skewX(-6deg)}to{transform:skewX(6deg)}}
.ds-lampA .ds-lamp-glow{animation:ds-flashA .9s ease-out}
.ds-lampB .ds-lamp-glow{animation:ds-flashB .9s ease-out}
@keyframes ds-flashA{0%{transform:scale(.9);filter:brightness(1)}30%{transform:scale(1.5);filter:brightness(1.6)}100%{transform:scale(1);filter:brightness(1)}}
@keyframes ds-flashB{0%{transform:scale(.9);filter:brightness(1)}30%{transform:scale(1.5);filter:brightness(1.6)}100%{transform:scale(1);filter:brightness(1)}}
.ds-vent{position:absolute;z-index:3;padding:0;margin:0;border:0;background:none;cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent}
.ds-vent-glow{position:absolute;left:50%;top:22px;width:120px;height:90px;margin:-45px 0 0 -60px;border-radius:50%;background:radial-gradient(ellipse,rgba(255,170,70,.65),rgba(255,170,70,0) 70%);animation:ds-flicker2 1.7s ease-in-out infinite;pointer-events:none}
@keyframes ds-flicker2{0%,100%{opacity:.75;transform:scale(1)}25%{opacity:1;transform:scale(1.08)}50%{opacity:.6;transform:scale(.95)}75%{opacity:.95;transform:scale(1.04)}}
.ds-ember{animation:ds-ember 1.3s ease-in-out infinite alternate}
@keyframes ds-ember{from{opacity:.7}to{opacity:1}}
.ds-crack{animation:ds-ember 2.1s ease-in-out infinite alternate}
.ds-vbub{position:absolute;bottom:58px;border-radius:50%;border:2px solid rgba(255,255,255,.8);background:rgba(255,255,255,.12);opacity:0;animation:ds-vbub linear infinite;pointer-events:none}
@keyframes ds-vbub{0%{transform:translate(0,0) scale(.5);opacity:0}10%{opacity:.95}50%{transform:translate(6px,-90px) scale(.9)}100%{transform:translate(-4px,-190px) scale(1.15);opacity:0}}
.ds-ventA .ds-vbub,.ds-ventB .ds-vbub{animation-duration:1.1s!important}
.ds-ventA .ds-vent-glow{animation:ds-hotA 1.4s ease-out}
.ds-ventB .ds-vent-glow{animation:ds-hotB 1.4s ease-out}
@keyframes ds-hotA{0%{opacity:.8;transform:scale(1)}25%{opacity:1;transform:scale(1.45)}100%{opacity:.8;transform:scale(1)}}
@keyframes ds-hotB{0%{opacity:.8;transform:scale(1)}25%{opacity:1;transform:scale(1.45)}100%{opacity:.8;transform:scale(1)}}
.ds-otter .otr-page{transform-box:fill-box;transform-origin:0% 50%}
.ds-pageA .otr-page{animation:ds-pageA 1.2s ease-in-out}
.ds-pageB .otr-page{animation:ds-pageB 1.2s ease-in-out}
@keyframes ds-pageA{0%{opacity:1;transform:scaleX(1)}85%{opacity:1;transform:scaleX(-1)}100%{opacity:0;transform:scaleX(-1)}}
@keyframes ds-pageB{0%{opacity:1;transform:scaleX(1)}85%{opacity:1;transform:scaleX(-1)}100%{opacity:0;transform:scaleX(-1)}}
.ds-breathe{animation:ds-breathe 4.8s ease-in-out infinite}
@keyframes ds-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.025,.975) translateY(2px)}}
.ds-ray-warm{background:linear-gradient(rgba(255,214,150,.2),rgba(255,214,150,0))}
.ds-fall{position:absolute;top:-30px;z-index:3;animation:ds-fall linear infinite;pointer-events:none}
@keyframes ds-fall{0%{transform:translateY(0);opacity:0}6%{opacity:1}88%{opacity:1}100%{transform:translateY(calc(max(94dvh,640px) - 96px));opacity:0}}
.ds-fall-sway{animation:ds-fall-sway 5s ease-in-out infinite alternate}
@keyframes ds-fall-sway{0%{transform:translateX(-22px) rotate(-35deg)}100%{transform:translateX(26px) rotate(40deg)}}
.ds-leafbtn{display:block;padding:8px;margin:-8px;border:0;background:none;cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent}
.ds-mote{position:absolute;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.55);animation:ds-mote 9s ease-in-out infinite;pointer-events:none}
@keyframes ds-mote{0%,100%{transform:translate(0,0);opacity:.15}50%{transform:translate(10px,-26px);opacity:.8}}
.ds-ol{stroke:#1B1630;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.ds-ol2{stroke:#1B1630;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.ds-deco{position:absolute;overflow:visible;pointer-events:none}
.ds-sway{transform-box:fill-box;transform-origin:50% 100%;animation:ds-sway 4.4s ease-in-out infinite alternate}
@keyframes ds-sway{from{transform:rotate(-5deg)}to{transform:rotate(5deg)}}
.ds-glow{transform-box:fill-box;transform-origin:50% 50%;animation:ds-glow 2.6s ease-in-out infinite}
@keyframes ds-glow{0%,100%{opacity:.25;transform:scale(.85)}50%{opacity:.6;transform:scale(1.15)}}

/* 몸 — 바깥(.ds-body)은 위치만, 안쪽은 기울기 → 방향 → 동작 순 */
.ds-body{position:absolute;left:0;top:0;width:0;height:0;z-index:5;will-change:transform}
.ds-friend{z-index:4}
.ds-tilt{position:absolute;left:0;top:0;transition:transform .5s ease}
.ds-flip{transition:transform .8s cubic-bezier(.45,.05,.55,.95)}
.ds-turning{animation:ds-turn .9s ease-in-out}
@keyframes ds-turn{0%{translate:0 0;rotate:0deg}45%{translate:0 -10px;rotate:-14deg}100%{translate:0 0;rotate:0deg}}
.ds-friend .ds-otter{filter:saturate(.7) brightness(1.2)}

.ds-otter{display:block;padding:0;margin:0;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ds-otter svg{display:block}
.ds-otter:focus-visible{outline:3px dashed #fff;outline-offset:4px;border-radius:24px}
.ds-float{animation:ds-float 3.4s ease-in-out infinite alternate}
.ds-sleepy{animation-duration:5.5s}
@keyframes ds-float{from{transform:translateY(-6px) rotate(-3deg)}to{transform:translateY(6px) rotate(2deg)}}
.ds-swim{animation:ds-swimbob .9s ease-in-out infinite alternate}
@keyframes ds-swimbob{from{transform:translateY(-3px)}to{transform:translateY(3px)}}
.ds-up{animation:ds-pop .5s cubic-bezier(.3,1.6,.5,1) both}
@keyframes ds-pop{from{transform:translateY(24px) scale(.85);opacity:.5}to{transform:none;opacity:1}}
.ds-proud{animation:ds-pop .5s cubic-bezier(.3,1.6,.5,1) both,ds-spin 1.1s cubic-bezier(.4,1.4,.5,1) .5s both}
@keyframes ds-spin{0%{transform:rotate(0)}60%{transform:rotate(370deg) translateY(-14px)}100%{transform:rotate(360deg)}}
.ds-spinA{animation:ds-spinA 1s cubic-bezier(.4,1.4,.5,1) both}
.ds-spinB{animation:ds-spinB 1s cubic-bezier(.4,1.4,.5,1) both}
@keyframes ds-spinA{0%{transform:rotate(0)}70%{transform:rotate(370deg) translateY(-10px)}100%{transform:rotate(360deg)}}
@keyframes ds-spinB{0%{transform:rotate(0)}70%{transform:rotate(370deg) translateY(-10px)}100%{transform:rotate(360deg)}}
.ds-leanA{animation:ds-leanA .5s ease-in-out 2 alternate}
.ds-leanB{animation:ds-leanB .5s ease-in-out 2 alternate}
@keyframes ds-leanA{from{transform:none}to{transform:translateX(10px) rotate(9deg)}}
@keyframes ds-leanB{from{transform:none}to{transform:translateX(10px) rotate(9deg)}}
.ds-otter .otr-wave{animation:ds-wave .5s ease-in-out 4 alternate}
@keyframes ds-wave{from{transform:rotate(-16deg)}to{transform:rotate(18deg)}}
.ds-otter .otr-tail{transform-box:fill-box;transform-origin:100% 50%;animation:ds-tail 1.8s ease-in-out infinite alternate}
@keyframes ds-tail{from{transform:rotate(-5deg)}to{transform:rotate(6deg)}}
.ds-otter .otr-swim-tail{transform-box:fill-box;transform-origin:100% 50%;animation:ds-wag .45s ease-in-out infinite alternate}
.ds-otter .otr-swim-paw{transform-box:fill-box;transform-origin:50% 0%;animation:ds-paddle .4s ease-in-out infinite alternate}
@keyframes ds-wag{from{transform:rotate(-12deg)}to{transform:rotate(12deg)}}
@keyframes ds-paddle{from{transform:rotate(-20deg)}to{transform:rotate(20deg)}}

.ds-say{position:absolute;z-index:8;max-width:min(300px,82%);width:max-content;padding:9px 16px;background:#fff;border:3px solid #1B1630;border-radius:22px;box-shadow:3px 3px 0 #1B1630;font-size:16px;line-height:1.35;text-align:center;white-space:pre-line;word-break:keep-all;transform:translate(-50%,-100%);animation:ds-say .35s cubic-bezier(.3,1.5,.5,1) both}
@keyframes ds-say{from{scale:.6;opacity:0}to{scale:1;opacity:1}}
.ds-zz{position:absolute;top:-70px;font-family:'Jua',sans-serif;font-size:16px;color:#fff;-webkit-text-stroke:1.5px #1B1630;pointer-events:none;animation:ds-zz 3.8s ease-in-out infinite}
@keyframes ds-zz{0%{transform:translate(0,10px) scale(.6);opacity:0}25%{opacity:1}100%{transform:translate(14px,-40px) scale(1.2);opacity:0}}
.ds-burst{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none}
.ds-burst span{position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;background:#FFE066;border:2px solid #1B1630;opacity:0;animation:ds-burst 1.4s ease-out .6s both}
@keyframes ds-burst{0%{opacity:0;scale:.3}30%{opacity:1;scale:1.1}100%{opacity:0;scale:.6}}
.ds-boop{position:absolute;z-index:7;pointer-events:none;margin-left:-14px;animation:ds-boop 1.5s ease-out both}
.ds-ball{position:absolute;left:-12px;top:-10px;z-index:7;pointer-events:none}
.ds-ball-arc{display:block;animation:ds-arc ease-in-out both}
@keyframes ds-arc{0%{transform:translateY(0) rotate(0)}50%{transform:translateY(-58px) rotate(200deg)}100%{transform:translateY(0) rotate(400deg)}}
.ds-ring{position:absolute;z-index:7;margin-left:-20px;margin-top:-11px;pointer-events:none;animation:ds-ring 2.4s ease-out forwards}
@keyframes ds-ring{0%{transform:translateY(0) scale(.4);opacity:0}15%{opacity:1}100%{transform:translateY(-120px) scale(1.25);opacity:1}}
.ds-fire{position:absolute;z-index:2;width:0;height:0;pointer-events:none}
.ds-fire-core{position:absolute;left:-20px;top:-20px;width:40px;height:40px;border-radius:50%;filter:blur(6px);opacity:0;animation:ds-firecore 1.6s ease-out forwards}
@keyframes ds-firecore{0%{opacity:0;transform:scale(.3)}15%{opacity:.9;transform:scale(1.6)}100%{opacity:0;transform:scale(2.4)}}
.ds-fire-dot{position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;box-shadow:0 0 6px rgba(255,255,255,.75);opacity:0;animation:ds-firedot 2s cubic-bezier(.2,.7,.3,1) forwards}
@keyframes ds-firedot{0%{opacity:0;transform:rotate(var(--a)) translateY(0) scale(.6)}12%{opacity:1}70%{opacity:.9;transform:rotate(var(--a)) translateY(calc(var(--r) * -1)) scale(1)}100%{opacity:0;transform:rotate(var(--a)) translateY(calc(var(--r) * -1 - 6px)) scale(.5)}}
@keyframes ds-boop{0%{transform:translateY(8px) scale(.3);opacity:0}20%{transform:translateY(0) scale(1.15);opacity:1}100%{transform:translateY(-46px) scale(.9);opacity:0}}

.ds-floor{position:absolute;left:0;right:0;bottom:0;height:200px;pointer-events:none}
.ds-sand{position:absolute;left:-6px;right:-6px;bottom:0;width:calc(100% + 12px);height:90px;display:block}
.ds-weed{position:absolute;bottom:54px;width:64px;transform:translateX(-50%);padding:0;margin:0;border:0;background:none;cursor:pointer;pointer-events:auto;z-index:3;-webkit-tap-highlight-color:transparent}
.ds-weed svg{display:block;overflow:visible}
.ds-blade{transform-box:fill-box;transform-origin:50% 100%;animation:ds-sway 4.8s ease-in-out infinite alternate}
.ds-hitA .ds-blade{animation:ds-wiggleA 1.2s ease-out}
.ds-hitB .ds-blade{animation:ds-wiggleB 1.2s ease-out}
@keyframes ds-wiggleA{0%{transform:rotate(0)}15%{transform:rotate(16deg)}35%{transform:rotate(-12deg)}55%{transform:rotate(8deg)}75%{transform:rotate(-4deg)}100%{transform:rotate(0)}}
@keyframes ds-wiggleB{0%{transform:rotate(0)}15%{transform:rotate(16deg)}35%{transform:rotate(-12deg)}55%{transform:rotate(8deg)}75%{transform:rotate(-4deg)}100%{transform:rotate(0)}}
.ds-wbub{position:absolute;top:6px;width:8px;height:8px;border-radius:50%;border:2px solid rgba(255,255,255,.85);opacity:0;animation:ds-wbub 1.2s ease-out both;pointer-events:none}
@keyframes ds-wbub{0%{transform:translateY(0) scale(.5);opacity:0}20%{opacity:1}100%{transform:translateY(-60px) scale(1.1);opacity:0}}

/* 혼자 놀기 동작 — 소리 박자(위 ACTS)와 주기를 맞춘다 */
.ds-otter [class^="otr-act-"]{transform-box:view-box}
.ds-otter .otr-act-crack{animation:ds-crack .6s cubic-bezier(.5,0,.6,1) infinite}
@keyframes ds-crack{0%{transform:translateY(-10px)}40%{transform:translateY(3px)}52%{transform:translateY(0)}100%{transform:translateY(-10px)}}
.ds-otter .otr-act-eat{transform-origin:154px 68px;animation:ds-eat .4s ease-in-out infinite alternate}
@keyframes ds-eat{from{transform:rotate(-4deg) translateY(1px)}to{transform:rotate(3deg) translateY(-2px)}}
.ds-otter .otr-act-juggle-stone{animation:ds-juggle .7s ease-in-out infinite alternate}
@keyframes ds-juggle{0%{transform:translate(0,0)}50%{transform:translate(10px,-34px)}100%{transform:translate(20px,0)}}
.ds-otter .otr-act-juggle-l{animation:ds-paw .7s ease-in-out infinite alternate}
.ds-otter .otr-act-juggle-r{animation:ds-paw .7s ease-in-out infinite alternate-reverse}
@keyframes ds-paw{from{transform:translateY(-5px)}to{transform:translateY(1px)}}
.ds-otter .otr-act-groom-l{animation:ds-groom .5s ease-in-out infinite}
.ds-otter .otr-act-groom-r{animation:ds-groom .5s ease-in-out infinite reverse}
@keyframes ds-groom{0%{transform:translate(0,0)}25%{transform:translate(2px,-3px)}50%{transform:translate(0,-5px)}75%{transform:translate(-2px,-2px)}100%{transform:translate(0,0)}}
.ds-otter .otr-act-pocket{animation:ds-pocket 4.2s ease-in-out both}
@keyframes ds-pocket{0%,8%{transform:translate(0,0)}26%,74%{transform:translate(44px,-28px)}92%,100%{transform:translate(0,0)}}
.ds-otter .otr-act-pocket-shine{transform-box:fill-box;transform-origin:50% 50%;animation:ds-shine 4.2s ease-in-out both}
@keyframes ds-shine{0%,24%{opacity:0;transform:scale(.3)}32%{opacity:1;transform:scale(1.2)}66%{opacity:1;transform:scale(1)}76%,100%{opacity:0;transform:scale(.3)}}
@media (prefers-reduced-motion: reduce){
  .ds-fall{display:none}
  .ds-ball-arc,.ds-ring,.ds-fire-core,.ds-fire-dot{animation:none}
  .ds-warm,.ds-lamp,.ds-lamp-glow,.ds-lamp .ds-tent,.ds-vent-glow,.ds-ember,.ds-crack,.ds-breathe{animation:none}
  .ds-vbub{display:none}
  .ds-ray,.ds-mote,.ds-sway,.ds-blade,.ds-glow,.ds-float,.ds-swim,.ds-up,.ds-proud,.ds-zz,.ds-burst span,.ds-turning,.ds-spinA,.ds-spinB,.ds-leanA,.ds-leanB,.ds-boop,.ds-wbub,.ds-otter .otr-wave,.ds-otter .otr-tail,.ds-otter .otr-swim-tail,.ds-otter .otr-swim-paw{animation:none}
  .ds-flip,.ds-tilt{transition:none}
  .ds-burst{display:none}
}
`;
