// components/DeepSea.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { OtterBody, OtterSwim, type OtterAct, type OtterExpression, type OtterHolding } from "@/components/Otter";
import { otterSound, plop, type OtterSound } from "@/lib/seaSound";
import { decideCue, deepTapCue, loadOtterMemory, saveOtterMemory } from "@/lib/otterCues";

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
//   - 친구 수달이 같이 산다. 말은 안 한다(말 거는 건 참견이 하나뿐). 각자 놀다가 가끔 둘이 콩 부딪히고 술래잡기.
//   - 쉬는 동안엔 조개 까기 / 냠냠 / 조약돌 저글링 / 세수 / 겨드랑이 주머니.
//   - 실제 시간과 같이 흐른다 — 아침엔 기지개부터, 밤엔 둘이 손잡고 잔다(진짜 수달처럼 떠내려가지 않게).
//   - 해초·친구는 눌러볼 수 있다(몇 초짜리 작은 손짓). 물속 소리가 켜져 있으면 작은 소리도 난다.
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
  1: "어, 다시마 싹 났다\n니가 말한 날들이 쌓여서 그래",
  2: "조약돌 줍기 시작했어\n니가 다시 꺼낸 얘기들이야",
  3: "다시마 숲 생겼어\n이제 안 떠내려가",
  4: "조개 정원 생겼다\n니 얘기 진짜 많이 쌓였네",
  5: "여기 이제 보물 굴이야\n전부 니 얘기로 만든 거",
};

// 크기 — 친구는 조금 작다
const W_FLOAT = 190;
const W_UP = 112;
const W_SWIM = 140;
const FRIEND_K = 0.8;
const UP_H = (W_UP * 190) / 140;
const FLOOR_BASE = 56; // 바닥 장식이 서는 높이(아래에서)

// 속도 — 기본은 느리게(px/초), 다이빙만 빠르게
const DRIFT_SPEED = 16;
const FRIEND_DRIFT_SPEED = 13;
const SWIM_SPEED = 75;
const EASE_SLOW = "cubic-bezier(.45,.05,.55,.95)";
const EASE_DIVE = "cubic-bezier(.55,0,.8,1)";
const EASE_DART = "cubic-bezier(.2,.7,.3,1)";

// 바닥 해초 — 항상 있다. x는 폭 대비 위치
const WEEDS = [
  { x: 0.2, h: 108, c1: "#3FBF8A", c2: "#2A9C6E" },
  { x: 0.78, h: 88, c1: "#55C9A0", c2: "#2FA57A" },
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
  let best = { x: W / 2, y: H * 0.35 };
  for (let i = 0; i < 8; i++) {
    const p = { x: rand(mx, W - mx), y: rand(H * band[0], H * band[1]) };
    best = p;
    if (!from) break;
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d > 80 && d < Math.max(260, H * 0.45)) break;
  }
  return best;
}

const START: Body = { x: 0, y: 0, ms: 0, ease: EASE_SLOW, facing: 1, pose: "float", tilt: 0, face: null, act: "none", lean: 0 };

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
    setMain((b) => ({ ...b, x: W * 0.42, y: H * 0.3 }));
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
      const ms = clamp((Math.hypot(p.x - b.x, p.y - b.y) / DRIFT_SPEED) * 1000, 5000, 15000);
      setMain((o) => ({ ...o, pose: "float", tilt: 0, act: "none", face: null, x: p.x, y: p.y, ms, ease: EASE_SLOW, facing: faceToward(o.x, p.x, o.facing) }));
      if (!(await wait(ms))) return false;
      if (Math.random() < 0.55) {
        const pool = ACT_NAMES.filter((a) => a !== lastAct);
        const a = pool[Math.floor(Math.random() * pool.length)];
        lastAct = a;
        setMain((o) => ({ ...o, act: a }));
        ACTS[a].sounds.forEach(([t, s]) => snd(s, t));
        if (!(await wait(ACTS[a].ms))) return false;
        setMain((o) => ({ ...o, act: "none" }));
      }
      return wait(rand(2000, 4500));
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
      const wi = Math.floor(Math.random() * WEEDS.length);
      const wx = WEEDS[wi].x * W;
      const side = wx < W / 2 ? 1 : -1; // 해초의 안쪽(화면 가운데 쪽)에 선다
      const tx = clamp(wx + side * 52, W_UP / 2, W - W_UP / 2);
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
      const pokes = 2 + Math.floor(Math.random() * 2);
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
      if (!(await wait(1100))) return false;
      // 술래잡기 — 친구가 휙 달아나고 참견이가 쫓아간다
      for (let i = 0; i < 2; i++) {
        const { W: W2, H: H2 } = size();
        const fNow = friendNow.current;
        const q = waterPoint(W2, H2, fNow);
        const ff = faceToward(fNow.x, q.x, fNow.facing);
        setFriend((o) => ({ ...o, pose: "swim", face: "laugh", facing: ff, tilt: swimTilt(ff, q.x - o.x, q.y - o.y) }));
        if (!(await wait(250))) return false;
        snd("swish");
        setFriend((o) => ({ ...o, x: q.x, y: q.y, ms: 1300, ease: EASE_DART }));
        if (!(await wait(380))) return false;
        const m = mainNow.current;
        const s2: 1 | -1 = m.x < q.x ? 1 : -1;
        tx = clamp(q.x - s2 * 118, W_SWIM / 2, W2 - W_SWIM / 2);
        const fm = faceToward(m.x, tx, m.facing);
        setMain((o) => ({ ...o, pose: "swim", face: "laugh", facing: fm, tilt: swimTilt(fm, tx - o.x, q.y - o.y), x: tx, y: q.y, ms: 1700, ease: EASE_DART }));
        if (!(await wait(1750))) return false;
        setMain((o) => ({ ...o, pose: "float", tilt: 0, facing: s2 }));
        setFriend((o) => ({ ...o, pose: "float", tilt: 0, facing: (s2 * -1) as 1 | -1 }));
        snd("boop");
        boopAt((tx + q.x) / 2, q.y - 40);
        if (!(await wait(900))) return false;
      }
      // 나란히 둥둥
      if (!(await wait(2600))) return false;
      setMain((o) => ({ ...o, face: null }));
      setFriend((o) => ({ ...o, face: null }));
      friendHeld.current = false;
      return wait(rand(2500, 4000));
    };

    const run = async () => {
      if (!(await wait(rand(1200, 2200)))) return;
      const h = new Date().getHours();
      if (h >= 6 && h < 10 && !(await stretch())) return;
      let last = "";
      while (alive) {
        const r = Math.random();
        let pick = r < 0.42 ? "drift" : r < 0.56 ? "look" : r < 0.78 ? "dive" : "friend";
        if (pick === last && pick !== "drift") pick = "drift";
        last = pick;
        const ok = pick === "drift" ? await drift() : pick === "look" ? await lookAround() : pick === "dive" ? await dive() : await playFriend();
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
  }, [ready, mode, night, busy, away, seen, reduce]);

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
    const run = async () => {
      if (!(await wait(rand(2500, 5000)))) return;
      while (alive) {
        if (friendHeld.current) {
          if (!(await wait(800))) return;
          continue;
        }
        const { W, H } = size();
        const b = friendNow.current;
        const p = waterPoint(W, H, b, [0.2, 0.62]);
        const ms = clamp((Math.hypot(p.x - b.x, p.y - b.y) / FRIEND_DRIFT_SPEED) * 1000, 6000, 16000);
        setFriend((o) => ({ ...o, pose: "float", tilt: 0, act: "none", x: p.x, y: p.y, ms, ease: EASE_SLOW, facing: faceToward(o.x, p.x, o.facing) }));
        if (!(await wait(ms))) return;
        if (friendHeld.current) continue;
        if (Math.random() < 0.45) {
          const a = FRIEND_ACTS[Math.floor(Math.random() * FRIEND_ACTS.length)];
          setFriend((o) => ({ ...o, act: a }));
          if (!(await wait(ACTS[a].ms))) return;
          setFriend((o) => ({ ...o, act: "none" }));
        }
        if (!(await wait(rand(3000, 7000)))) return;
      }
    };
    run();
    return () => {
      alive = false;
      ts.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, night, busy, seen, reduce]);

  // ---- 밤 — 둘이 손잡고 쿨쿨(떠내려가지 않게) ----
  useEffect(() => {
    if (!ready || !night || mode !== "idle") return; // 말하고 나면 다시 잠자리로
    const { W, H } = size();
    // 머리끼리 맞대고 — 참견이는 오른쪽을, 친구는 왼쪽을 보고 눕는다
    const cx = clamp(W / 2 - 85, W_FLOAT / 2 - 10, W - W_FLOAT / 2);
    const fx = clamp(cx + 172, (W_FLOAT * FRIEND_K) / 2, W - (W_FLOAT * FRIEND_K) / 2 + 10);
    const ms = reduce ? 0 : 4000;
    setMain((b) => ({ ...b, pose: "float", tilt: 0, act: "none", face: null, facing: 1, x: cx, y: H * 0.34, ms, ease: EASE_SLOW }));
    setFriend((b) => ({ ...b, pose: "float", tilt: 0, act: "none", face: null, facing: -1, x: fx, y: H * 0.34, ms, ease: EASE_SLOW }));
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
    speak(GROWTH_LINES[s] ?? "여기 좀 달라졌지?", 5200);
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
  const sayLeft = clamp(main.x, Math.min(150, W / 2), Math.max(W - 150, W / 2));
  const sayTop = Math.max(main.y - (pose === "upright" ? UP_H / 2 + 8 : 60), 96);

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
      <div className="ds-ray" style={{ left: "22%" }} />
      <div className="ds-ray" style={{ left: "64%", width: 40, animationDelay: "-2.4s" }} />

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
            <svg className="ds-deco" width="30" height="90" viewBox="0 0 40 140" style={{ left: "34%", bottom: 64 }}>
              <path className="ds-ol ds-sway" d={WEED} fill="#46C985" />
            </svg>
            <svg className="ds-deco" width="22" height="62" viewBox="0 0 40 140" style={{ left: "41%", bottom: 60 }}>
              <path className="ds-ol ds-sway" d={WEED} fill="#2FAF6A" style={{ animationDelay: "-1.3s" }} />
            </svg>
          </>
        )}
        {/* 2 조약돌 더미 */}
        {stage >= 2 && (
          <svg className="ds-deco" width="96" height="56" viewBox="0 0 96 56" style={{ right: "30%", bottom: 58, zIndex: 3 }}>
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
              className={`ds-otter ${friend.pose === "swim" ? "ds-swim" : night ? "ds-float ds-sleepy" : "ds-float"} ${friendSpin ? (friendSpin % 2 ? "ds-spinA" : "ds-spinB") : ""}`}
              onClick={tapFriend}
              aria-label="참견이 친구"
            >
              {friend.pose === "swim" ? (
                <OtterSwim expression={fExpr} width={W_SWIM * FRIEND_K} />
              ) : (
                <OtterBody pose="float" expression={fExpr} act={fAct} width={W_FLOAT * FRIEND_K} />
              )}
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
            <div className={main.lean ? (main.lean % 2 ? "ds-leanA" : "ds-leanB") : ""}>
              <button
                className={`ds-otter ${pose === "swim" ? "ds-swim" : pose === "upright" ? "ds-up" : night ? "ds-float ds-sleepy" : "ds-float"} ${mode === "growth" ? "ds-proud" : ""}`}
                onClick={tap}
                aria-label="참견이"
              >
                {pose === "swim" ? (
                  <OtterSwim expression={expr} holding={holdingFor(stage)} width={W_SWIM} />
                ) : pose === "upright" ? (
                  <OtterBody pose="upright" expression={expr} holding={holdingFor(stage)} kelp={stage >= 3} wave={mode === "discover"} width={W_UP} />
                ) : (
                  <OtterBody pose="float" expression={expr} holding={holdingFor(stage)} kelp={stage >= 3} act={act} width={W_FLOAT} />
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

      {/* 콩! — 둘이 부딪힐 때 */}
      {boops.map((b) => (
        <span key={b.key} className="ds-boop" style={{ left: b.x, top: b.y }} aria-hidden>
          <svg width="26" height="24" viewBox="0 0 26 24">
            <path d="M13 22 C4 15 1 10 1 6.5 C1 3 3.6 1 6.6 1 C9.4 1 11.4 2.8 13 5 C14.6 2.8 16.6 1 19.4 1 C22.4 1 25 3 25 6.5 C25 10 22 15 13 22 Z" fill="#FF9EC4" stroke="#1B1630" strokeWidth={2.2} strokeLinejoin="round" />
          </svg>
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
.ds-boop{position:absolute;z-index:7;pointer-events:none;margin-left:-13px;animation:ds-boop 1.5s ease-out both}
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
  .ds-ray,.ds-mote,.ds-sway,.ds-blade,.ds-glow,.ds-float,.ds-swim,.ds-up,.ds-proud,.ds-zz,.ds-burst span,.ds-turning,.ds-spinA,.ds-spinB,.ds-leanA,.ds-leanB,.ds-boop,.ds-wbub,.ds-otter .otr-wave,.ds-otter .otr-tail,.ds-otter .otr-swim-tail,.ds-otter .otr-swim-paw{animation:none}
  .ds-flip,.ds-tilt{transition:none}
  .ds-burst{display:none}
}
`;
