// components/Sea.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadFresh, peekMemory, peekStored, prefetchWorld } from "@/lib/worldCache";
import PeekMascot, { type PeekExpression } from "@/components/PeekMascot";
import { goldfishSvg, hash, PALETTE, type TankEntry } from "@/components/FishTank";
import { plop } from "@/lib/seaSound";
import { supabaseClient } from "@/lib/supabaseClient";
import DeepSea, { type SeaGrowth } from "@/components/DeepSea";
import SeaOtter from "@/components/SeaOtter";
import { loadOtterMemory, pickVisit, saveOtterMemory, type Visit } from "@/lib/otterCues";

// ============================================================================
// 참견이 바다 — 화면 전체가 물속. "깊이 = 시간".
// ----------------------------------------------------------------------------
// 첫 화면(이번 달 바다)
//   - 물고기 하나 = 생각의 계보 하나(/api/user/tank). 크기는 기존처럼 치어/금붕어/큰 금붕어.
//   - 높이: 마지막으로 말한 지 오래될수록 매일 조금씩 아래로 가라앉는다(연속). 오늘 말한 건 빛 드는 수면 근처.
//     말한 지 아주 오래된 계보는 바닥 수초 뒤에서 쉰다. 죽거나 사라지지 않고, 다시 말하면 쑥 올라온다.
//   - 아직 계보로 안 묶인 이번 달 생각은 수면 근처 치어 무리.
// 아래로 내려가면(스크롤) 물이 점점 어두워지며 심해 — 참견이(수달)가 사는 곳(components/DeepSea.tsx).
//   - 2026-10-11: 예전엔 여기에 지난달 물고기 층이 있었다. 지난달 기록은 이제 "지난 어항" 탭에서만 본다(데이터는 그대로).
//   - 심해는 성장 단계(/api/user/growth)에 따라 달라진다. 실제로 단계가 올라갔는데 아직 못 봤을 때만
//     첫 화면 바닥에서 빛나는 기포가 올라온다(성장 단서). 기억 회상 중엔 단서를 숨긴다 — 회상이 먼저.
// 가끔 손님이 지나간다 — 위쪽엔 거북이, 심해엔 해파리, 밤 심해 바닥엔 아귀. 한 번에 한 마리, 가끔만(Visitor).
// 숫자/날짜/설명 문구는 바다에 넣지 않는다.
// ============================================================================

interface Lineage {
  id: string;
  stage: 1 | 2 | 3;
  state: "swim" | "deep" | "hidden";
  label: string | null;
  lastAt: string;
  returned: boolean;
  entryIds: string[];
  unitIds?: number[]; // 이 계보에 묶인 memory_unit id들 — 참견이가 꺼낸 기억이 어느 물고기인지 찾는 데 쓴다
  quotes: { text: string; at: string }[];
}

interface SeaProps {
  entries: TankEntry[] | null;
  thinking?: boolean;
  night: boolean;
  // (예전 "그때 한 말" 버튼용 — 바다에서 표지판을 빼면서 지금은 쓰지 않는다. 그 달 전체는 하단 "지난 어항" 탭에서.)
  onOpenMonth?: (month: string) => void;
  // 참견이가 지금 꺼내 온 기억(memory_unit id). 있으면 그 기억이 사는 물고기가 깨어나 위로 떠오르고,
  // 다른 물고기는 흐려지고 바다가 살짝 어두워진다 — 앱에서 가장 도드라지는 순간.
  recallUnitId?: number | null;
  // 대답 기다리는 단계 — listening: 받아쓰는 중 / chewing: 내 말은 도착했고 대답을 만드는 중
  thinkingPhase?: "listening" | "chewing" | null;
  // 받아쓰기가 도착한 순간(키) — 그 말이 치어로 퐁당 들어오는 연출
  heardKey?: number | null;
  // 심해 참견이가 말할 수 있는 실제 상태 — 메모 개수(모르면 null), 다음 알람(없으면 null)
  deepFacts?: { noteCount: number | null; nextReminder: { id: number; title: string; at: string } | null };
  // 홈에 참견이 말풍선/대답이 떠 있거나 시트가 열려 있음 — 수달이 말하러 올라오지 않는다(말 없는 방문만)
  quiet?: boolean;
  // 놀러 온 수달을 눌렀을 때(곧 울릴 알람 얘기였으면) 알람 탭 열기
  onOpenAlarms?: () => void;
    // 물고기 속 생각 카드가 열리고 닫힐 때 — 홈이 마이크를 잠깐 숨긴다(카드를 가리지 않게)
  onCardChange?: (open: boolean) => void;
}

const NOISE_MAX = 5;
const MAX_LOOSE_FRY = 5;
const SEEN_KEY = "ganseobi_tank_seen_v1";
const RETURN_SEEN_KEY = "ganseobi_tank_returned_v1";
const STAGE_W = { 1: 34, 2: 62, 3: 92 } as const;
const SINK_DAYS = 40; // 이만큼 조용하면 거의 바닥까지 가라앉는다
const SEEN_LOCAL_KEY = "ganseobi_sea_seen_v1"; // SQL 실행 전(서버에 못 남길 때)만 쓰는 "심해에서 본 단계"

// 깊어질수록 물색
const WATER_DAY = ["#8BE0FA", "#45BFEC", "#2E9BD6"];
const WATER_NIGHT = ["#3E8FCB", "#2C78B6", "#225F98"];

function fuzzyAgo(iso: string): string {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (days < 1) return "오늘";
  if (days < 7) return "며칠 전";
  if (days < 30) return "몇 주 전";
  if (days < 60) return "한 달 전쯤";
  return "꽤 전에";
}




function charCount(t: string): number {
  return t.replace(/\s/g, "").length;
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

function isThisMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// 대답을 기다리는 동안 참견이 혼잣말 — 명령형/공손체 없이, 초딩 같은 혼잣말만.
// 실제 처리 단계와 맞춘다 — 받아쓰기 중엔 "듣는 중", 내 말이 도착한 뒤엔 곱씹는 말 몇 마디를 한 번씩만(반복 X, 마지막 말에서 멈춤).
// 기억을 찾았다거나 거의 끝났다는 식으로 실제와 다를 수 있는 말은 넣지 않는다.
const MURMUR_LISTENING = "듣는 중.";
const MURMURS_CHEWING = ["음…", "니 말 곱씹는 중.", "흠…"];

const FRY_OFFSETS: [number, number][] = [
  [2, 14],
  [20, 2],
  [22, 24],
  [40, 12],
  [6, 28],
];

type VisitorKind = "turtle" | "jelly" | "angler";
interface Visitor {
  kind: VisitorKind;
  top: number; // 바다 맨 위에서부터 px
  dir: 1 | -1; // 1 = 왼쪽→오른쪽
  left: number; // 해파리만 — 올라가는 자리
  dur: number; // 초
  key: number;
}

type Sheet = { kind: "now"; id: string } | null;

export default function Sea({
  entries,
  thinking,
  night,
  recallUnitId = null,
  thinkingPhase = null,
  heardKey = null,
  deepFacts,
  quiet = false,
  onOpenAlarms,
    onCardChange,
}: SeaProps) {
  const nowRef = useRef<HTMLElement>(null); // 첫 화면(이번 달 바다) — 수달이 놀러 오는 무대
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(375);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || 375);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- 이번 달 계보(물고기) — 메모리 → 기기 저장 → 서버 순 ----
  const [lineages, setLineages] = useState<Lineage[] | null>(() => peekMemory<Lineage[]>("tank"));
  useEffect(() => {
    if (lineages) return;
    const stored = peekStored<Lineage[]>("tank");
    if (stored) setLineages(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const entriesKey = entries === null ? null : entries.map((e) => e.id).join(",");
  const alive = useRef(true);
  const reqSeq = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const seq = ++reqSeq.current;
    const pull = () =>
      loadFresh<Lineage[]>("tank")
        .then((data) => {
          if (data && alive.current && seq === reqSeq.current) setLineages(data);
        })
        .catch((e) => console.error("[Sea] 계보 불러오기 실패:", e));
    pull();
    // 새 녹음의 기억 정리는 대답이 나간 뒤 서버 뒤편에서 마저 끝난다 — 조금 있다 두 번 더 불러와서
    // 치어로 먼저 들어온 생각이 제 물고기(계보)로 자리 잡게 한다.
    if (entriesKey === null) return;
    const t1 = setTimeout(pull, 8000);
    const t2 = setTimeout(() => {
      pull();
      pullGrowth();
    }, 20000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [entriesKey]);

  // ---- 지난 어항 탭을 미리 받아둔다(홈에는 그리지 않는다 — 지난달 기록은 "지난 어항" 탭에서) ----
  useEffect(() => {
    const t = setTimeout(() => prefetchWorld("archive"), 900);
    return () => clearTimeout(t);
  }, []);

  // ---- 심해 성장 단계 — 기기에 남은 값으로 먼저 그리고(연출 없이), 서버 값이 오면 그때만 "새 변화"를 판단 ----
  const [growth, setGrowth] = useState<SeaGrowth | null>(null);
  const readLocalSeen = (): number | null => {
    try {
      const v = localStorage.getItem(SEEN_LOCAL_KEY);
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  };
  const writeLocalSeen = (n: number) => {
    try {
      localStorage.setItem(SEEN_LOCAL_KEY, String(n));
    } catch {
      /* 못 남기면 이번만 */
    }
  };
  const pullGrowth = () =>
    loadFresh<{ stage: number; seen: number | null; persisted: boolean }>("growth")
      .then((d) => {
        if (!d || !alive.current) return;
        let seen = d.seen;
        if (!d.persisted) {
          // 서버에 저장 칸이 없을 때 — 이 기기에서 처음이면 지금 단계를 본 것으로(가짜 성장 연출 없음)
          const local = readLocalSeen();
          if (local === null || !Number.isFinite(local)) writeLocalSeen(d.stage);
          seen = local === null || !Number.isFinite(local) ? d.stage : Math.min(local, d.stage);
        }
        setGrowth({ stage: d.stage, seen: seen ?? d.stage, fresh: true });
      })
      .catch(() => {
        /* 성장은 없어도 바다는 그대로 */
      });
  useEffect(() => {
    const stored = peekStored<{ stage: number; seen: number | null }>("growth");
    if (stored && typeof stored.stage === "number") setGrowth({ stage: stored.stage, seen: stored.stage, fresh: false });
    const t = setTimeout(pullGrowth, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const markGrowthSeen = (stage: number) => {
    setGrowth((g) => (g ? { ...g, seen: Math.max(g.seen, Math.min(stage, g.stage)) } : g));
    writeLocalSeen(stage);
    supabaseClient.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!session) return;
        return fetch("/api/user/growth", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ seen: stage }),
        });
      })
      .catch(() => {
        /* 다음에 다시 보이면 그때 또 기록 */
      });
  };

  // ---- 처음 한 번만 다 같이 스르륵 ----
  const [appear, setAppear] = useState(() => peekMemory("tank") !== null);
  useEffect(() => {
    if (!lineages || appear) return;
    const t = setTimeout(() => setAppear(true), 30);
    return () => clearTimeout(t);
  }, [lineages, appear]);
  const fade = (base: number): React.CSSProperties => ({ opacity: appear ? base : 0, transition: "opacity .7s ease" });

  // ---- 새로 생긴 기록(퐁당), 오랜만에 돌아온 계보(참견이 고개) ----
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!entries) return;
    const ids = entries.map((e) => String(e.id));
    let seen: string[] | null = null;
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      seen = raw ? (JSON.parse(raw) as string[]).map(String) : null;
    } catch {
      seen = null;
    }
    if (seen) {
      const seenSet = new Set(seen);
      const newOnes = ids.filter((id) => !seenSet.has(id));
      if (newOnes.length) setFresh(new Set(newOnes));
    }
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(0, 300)));
    } catch {
      /* 저장 못 해도 바다는 그대로 */
    }
  }, [entries]);

  const [peek, setPeek] = useState<{ text: string; expr: PeekExpression; key: number } | null>(null);
  const [emerging, setEmerging] = useState<string | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPeek = (text: string, expr: PeekExpression, ms: number) => {
    setPeek({ text, expr, key: Date.now() });
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(null), ms);
  };
  useEffect(() => {
    if (!lineages) return;
    const back = lineages.find((l) => l.returned);
    if (!back) return;
    const key = `${back.id}:${back.lastAt}`;
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(RETURN_SEEN_KEY) || "[]") as string[];
    } catch {
      seen = [];
    }
    if (seen.includes(key)) return;
    try {
      localStorage.setItem(RETURN_SEEN_KEY, JSON.stringify([key, ...seen].slice(0, 50)));
    } catch {
      /* 다음에 한 번 더 보일 뿐 */
    }
    setEmerging(back.id);
    const t = setTimeout(
      () => showPeek(back.label ? `어? ${back.label} 얘기 오랜만이네.` : "어? 그 얘기 오랜만이네.", "surprise", 6000),
      1500
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineages]);

  // ---- 기다리는 동안 혼잣말 ----
  const [murmurIdx, setMurmurIdx] = useState(0);
  useEffect(() => {
    setMurmurIdx(0);
    if (thinkingPhase !== "chewing") return;
    const t = setInterval(
      () => setMurmurIdx((i) => Math.min(i + 1, MURMURS_CHEWING.length - 1)),
      2600
    );
    return () => clearInterval(t);
  }, [thinkingPhase]);
  const murmurText =
    thinkingPhase === "listening" ? MURMUR_LISTENING : thinkingPhase === "chewing" ? MURMURS_CHEWING[murmurIdx] : null;

  // ---- 누르기 ----
  const [sheet, setSheet] = useState<Sheet>(null);
  // 카드가 열려 있는 동안은 홈 마이크를 숨긴다 — 닫으면(×/바깥 누르기) 다시 나온다
  const cardOpen = sheet !== null;
  useEffect(() => {
    onCardChange?.(cardOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardOpen]);
  // 홈을 떠날 때 카드가 열려 있었으면 "닫힘"으로 돌려놓는다(마이크가 숨은 채로 남지 않게)
  useEffect(
    () => () => onCardChange?.(false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // 카드에는 한 번에 한 마디만 크게. 0 = 가장 최근에 한 말, 넘기면 그 전에 한 말.
  const [qi, setQi] = useState(0);
  useEffect(() => setQi(0), [sheet]);
  const [wiggle, setWiggle] = useState<{ id: string; n: number } | null>(null);
  const [thought, setThought] = useState<{ text: string; key: number } | null>(null);
  const thoughtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
      if (peekTimer.current) clearTimeout(peekTimer.current);
    },
    []
  );
  const poke = (id: string) => {
    setWiggle((w) => ({ id, n: (w?.n ?? 0) + 1 }));
    plop();
  };
  // 수달이 콕 — 소리 없이 움찔만
  const otterPoke = (id: string) => setWiggle((w) => ({ id, n: (w?.n ?? 0) + 1 }));
  const swipeX = useRef<number | null>(null);
  const wigCls = (id: string) => (wiggle?.id === id ? (wiggle.n % 2 ? "sea-wigA" : "sea-wigB") : "");

  // ---- 아직 안 묶인 이번 달 생각 → 치어 무리 ----
  const school = useMemo(() => {
    if (!lineages) return [] as TankEntry[];
    const inLineage = new Set(lineages.flatMap((l) => l.entryIds.map(String)));
    const now = new Date();
    return (entries ?? [])
      .filter(
        (e) =>
          e.transcript &&
          !e.isReply &&
          isThisMonth(e.createdAt, now) &&
          charCount(e.transcript) > NOISE_MAX &&
          !inLineage.has(String(e.id))
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-MAX_LOOSE_FRY);
  }, [entries, lineages]);

  // ---- 기억 소환 ----
  const recalledId = recallUnitId
    ? (lineages ?? []).find((l) => (l.unitIds ?? []).includes(recallUnitId))?.id ?? null
    : null;
  const recallOn = !!recallUnitId && !thinking;
  const [risen, setRisen] = useState(false);
  useEffect(() => {
    setRisen(false);
    if (!recallUnitId) return;
    // 말풍선 위 기억 캡슐이 뜨는 것과 같은 박자에 물고기가 깨어나 떠오르기 시작한다.
    const t = setTimeout(() => setRisen(true), 350);
    return () => clearTimeout(t);
  }, [recallUnitId]);
  const dimOthers = recallOn && risen;
  const RECALL_TOP = "min(430px, 54%)"; // 말풍선 바로 아래쯤 — 떠오른 물고기가 머무는 자리
  const recallMove = "top 1.9s cubic-bezier(.22,.9,.3,1), left 1.9s cubic-bezier(.22,.9,.3,1), width 1.2s ease, opacity .7s ease";

  // 수초 뒤에서 쉬던 물고기도 소환되면 헤엄치는 쪽으로 나와서 떠오른다.
  // (높이 순서 — 아래 visible 계산 뒤에 rankOf로 쓴다)
  const hidden = (lineages ?? []).filter((l) => l.state === "hidden" && !(recallOn && l.id === recalledId));
  const visible = (lineages ?? []).filter((l) => l.state !== "hidden" || (recallOn && l.id === recalledId));
  const slow = night ? 1.9 : 1;
  const ranked = [...visible].sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  const rankOf = new Map(ranked.map((l, i) => [l.id, i] as [string, number]));
  const rankCount = ranked.length;

  // ---- 수달이 첫 화면에 놀러 오기 — 언제/왜는 lib/otterCues.ts pickVisit ----
  const [visit, setVisit] = useState<(Visit & { seq: number }) | null>(null);
  const lastVisitAt = useRef(0);
  const newFryRef = useRef<string | null>(null);
  // 방금 퐁당 들어온 생각이 있으면 기억해둔다 — 다음 판단 때 그 치어 옆으로 구경 온다
  useEffect(() => {
    if (!fresh.size || !lineages) return;
    const freshIds = Array.from(fresh);
    const owner = lineages.find((l) => l.entryIds.some((id) => freshIds.includes(String(id))));
    newFryRef.current = owner ? owner.id : school.length ? String(school[0].id) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, lineages]);
  const visitBusy = !!thinking || sheet !== null || !!recallUnitId || peek !== null;
  const visitStateRef = useRef({ visitBusy, quiet, night, deepFacts, visible, school });
  visitStateRef.current = { visitBusy, quiet, night, deepFacts, visible, school };
  const tryVisit = () => {
    const st = visitStateRef.current;
    if (visitActive.current || st.visitBusy || document.hidden) return;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* 그대로 */
    }
    const swimming = st.visible.filter((l) => l.state !== "hidden");
    const oldest = [...swimming].sort((a, b) => new Date(a.lastAt).getTime() - new Date(b.lastAt).getTime())[0] ?? null;
    const pool = [...swimming.map((l) => l.id), ...(st.school.length ? [String(st.school[0].id)] : [])];
    const now = Date.now();
    const { visit: v, next } = pickVisit(
      {
        night: st.night,
        quiet: st.quiet,
        sinceLastVisitMs: lastVisitAt.current ? now - lastVisitAt.current : Infinity,
        nextReminder: st.deepFacts?.nextReminder ?? null,
        oldFish: oldest ? { id: oldest.id, lastAt: oldest.lastAt } : null,
        newFryId: newFryRef.current,
        anyFishId: pool.length ? pool[Math.floor(Math.random() * pool.length)] : null,
      },
      loadOtterMemory(),
      new Date(now),
      reduce ? 1 : Math.random() // 움직임 줄이기면 그냥 놀러 오지는 않는다(할 일 있을 때만)
    );
    if (!v) return;
    saveOtterMemory(next);
    if (v.kind === "new_fry") newFryRef.current = null;
    lastVisitAt.current = now;
    visitActive.current = true;
    setVisit({ ...v, seq: now });
  };
  const visitActive = useRef(false);
  // 놀러 와 있는데 바빠지면(녹음 결과 대기, 카드 열림 등) 그냥 집에 간 걸로 — 다음에 다시
  useEffect(() => {
    if (visitBusy && visit) {
      visitActive.current = false;
      setVisit(null);
    }
  }, [visitBusy, visit]);
  useEffect(() => {
    // 처음엔 조금 있다가(바다가 먼저 보이게), 그다음엔 20초마다 "올라갈 일 있나?" 한 번씩만 본다.
    const first = setTimeout(tryVisit, 7000 + Math.random() * 6000);
    const t = setInterval(tryVisit, 20000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 대답이 끝나고 새 치어가 들어왔으면 조금 뒤에 바로 구경 온다(20초를 기다리지 않고)
  useEffect(() => {
    if (thinking || !fresh.size) return;
    const t = setTimeout(tryVisit, 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, thinking]);

  // ---- 가끔 지나가는 손님 — 한 번에 한 마리, 가끔만. 깊이마다 사는 생물이 다르다. ----
  //   거북이: 위쪽을 한 번 가로질러 간다 / 해파리: 중간에서 둥실 올라간다 / 아귀(밤만): 맨 바닥을 불빛 켜고 지나간다
  // 생각 물고기와 헷갈리지 않게 금붕어 색·모양은 쓰지 않고, 누를 수도 없다(그냥 "어? 방금 뭐 지나갔다").
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const busyRef = useRef(false);
  busyRef.current = !!thinking || sheet !== null;
  const nightRef = useRef(night);
  nightRef.current = night;
  const widthRef = useRef(width);
  widthRef.current = width;
  useEffect(() => {
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* 못 읽으면 그대로 */
    }
    if (reduce) return;
    let timer: ReturnType<typeof setTimeout>;
    let first = true;
    const schedule = () => {
      // 처음엔 6~20초 뒤, 그다음부턴 1~2분 반에 한 번쯤
      const wait = first ? 6000 + Math.random() * 14000 : 60000 + Math.random() * 90000;
      timer = setTimeout(spawn, wait);
    };
    const spawn = () => {
      const skipFirst = first && Math.random() < 0.4; // 앱을 열 때마다 나오진 않게
      first = false;
      if (document.hidden || busyRef.current || skipFirst) {
        schedule();
        return;
      }
      const vh = window.innerHeight || 800;
      const deepTop = Math.max(vh, 560); // 첫 화면 높이 = 심해가 시작되는 곳
      const deepH = Math.max(vh * 0.94, 640);
      const n = nightRef.current;
      const roll = Math.random();
      const kind: VisitorKind = n ? (roll < 0.45 ? "angler" : roll < 0.8 ? "jelly" : "turtle") : roll < 0.5 ? "turtle" : "jelly";
      let top: number;
      if (kind === "turtle") top = vh * (0.34 + Math.random() * 0.2);
      else if (kind === "jelly")
        top = Math.random() < 0.6 ? deepTop + 120 + Math.random() * Math.max(0, deepH - 380) : vh * (0.58 + Math.random() * 0.14);
      else top = deepTop + deepH - 230;
      const dur = kind === "turtle" ? 26 : kind === "jelly" ? 20 : 32;
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const left = kind === "jelly" ? widthRef.current * (0.15 + Math.random() * 0.6) : 0;
      setVisitor({ kind, top, dir, left, dur, key: Date.now() });
      timer = setTimeout(() => {
        setVisitor(null);
        schedule();
      }, dur * 1000 + 400);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  const water = night ? WATER_NIGHT : WATER_DAY;

  const openNow = sheet?.kind === "now" ? (lineages ?? []).find((l) => l.id === sheet.id) ?? null : null;
  // 성장 단서 — 실제로 단계가 올라갔고 아직 심해에서 못 봤을 때만. 기억 회상·대답 대기·카드가 열려 있으면 숨긴다.
  const growthCue = !!growth && growth.fresh && growth.stage > growth.seen && !thinking && !recallOn && !sheet;

  const eyeNight = night;

  return (
    <div ref={rootRef} className="sea-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ================= 이번 달 바다 (첫 화면) ================= */}
      <section
        ref={nowRef}
        className="sea-now"
        style={{ background: `linear-gradient(${water[0]} 0%, ${water[1]} 38%, ${water[2]} 100%)` }}
        aria-label="지금 바다"
      >
        {/* 수면 */}
        <svg className="sea-surface" width="760" height="34" viewBox="0 0 760 34" aria-hidden>
          <path d="M0 18 Q47.5 6 95 18 T190 18 T285 18 T380 18 T475 18 T570 18 T665 18 T760 18" fill="none" stroke="#FFFFFF" strokeWidth={4} opacity={0.9} />
        </svg>

        {/* 햇빛(밤엔 달빛처럼 약하게) */}
        <div className="sea-ray" style={{ left: "14%", opacity: night ? 0.35 : 1 }} />
        <div className="sea-ray" style={{ left: "46%", width: 26, animationDelay: "-1.6s", opacity: night ? 0.3 : 1 }} />
        <div className="sea-ray" style={{ left: "74%", width: 44, animationDelay: "-3.1s", opacity: night ? 0.35 : 1 }} />

        {/* 기포 기둥 */}
        {BUBBLES.map((b, i) => (
          <div key={i} className="sea-bubble" style={b} />
        ))}

        {/* 치어 무리 — 수면 근처 */}
        {school.length > 0 && (() => {
          const sid = String(school[0].id);
          const r = (k: number) => hash(sid, k);
          const dx = Math.min(150, width * 0.35);
          const leftPx = 16 + r(4) * Math.max(0, width - 32 - 64 - dx);
          const dur = (16 + r(6) * 8) * slow;
          const last = school[school.length - 1];
          return (
            <div
              className="sea-swim"
              data-lid={sid}
              style={{
                left: leftPx,
                top: `${17 + r(3) * 8}%`,
                width: 64,
                ["--dx" as any]: `${dx}px`,
                animationDuration: `${dur}s`,
                animationDelay: `${-(r(5) * dur)}s`,
                zIndex: 5,
                ...fade(dimOthers ? 0.3 : 1),
              }}
            >
              <button
                className={`sea-school ${wigCls(sid)}`}
                aria-label="치어 무리"
                onClick={() => {
                  poke(sid);
                  setThought({ text: truncate(last.transcript, 40), key: Date.now() });
                  if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
                  thoughtTimer.current = setTimeout(() => setThought(null), 3200);
                }}
              >
                {school.map((e, m) => (
                  <div
                    key={e.id}
                    className={`sea-fry ${fresh.has(String(e.id)) ? "sea-arrive" : ""}`}
                    style={{ left: FRY_OFFSETS[m][0], top: FRY_OFFSETS[m][1] }}
                  >
                    <div
                      className="sea-bob"
                      style={{
                        animationDuration: `${0.9 + hash(String(e.id), 3) * 0.6}s`,
                        animationDelay: `${-hash(String(e.id), 4)}s`,
                        ["--wag" as any]: night ? "0.4s" : "0.2s",
                      }}
                    >
                      {frySvg(hash(String(e.id), 5) > 0.5 ? "#FFA45C" : "#FF9447", eyeNight)}
                    </div>
                  </div>
                ))}
              </button>
            </div>
          );
        })()}

        {/* 생각의 계보 — 오래 말 안 할수록 아래로 */}
        {visible.map((l) => {
          const r = (k: number) => hash(l.id, k);
          const [body, belly] = PALETTE[Math.floor(r(11) * PALETTE.length)];
          const w = STAGE_W[l.stage] ?? 62;
          const days = Math.max(0, (Date.now() - new Date(l.lastAt).getTime()) / 86_400_000);
          const sink = Math.pow(Math.min(1, days / SINK_DAYS), 0.75); // 0 = 수면, 1 = 바닥 근처 — 느리기/흐리기에만
          // 높이 = 순서. 가장 최근에 말한 생각이 맨 위, 오래된 순서대로 화면 아래까지 고르게 퍼진다(깊이 = 시간).
          // (예전엔 날짜로만 정해서 최근 생각들이 전부 위쪽 한 줄에 몰렸다)
          const rank = rankOf.get(l.id) ?? 0;
          const frac = rankCount > 1 ? rank / (rankCount - 1) : 0;
          const topPct = 27 + frac * 44 + (r(3) - 0.5) * 6;
          const dx = Math.min(width * (0.5 - sink * 0.25), 210) * (0.6 + r(2) * 0.4);
          const dy = (14 + r(13) * 34) * (r(14) > 0.5 ? 1 : -1); // 헤엄치며 오르내리는 폭
          const leftPx = 12 + r(4) * Math.max(0, width - 24 - w - dx);
          const dur = (15 + r(6) * 12) * slow * (1 + sink * 0.8);
          const isFresh = l.entryIds.some((id) => fresh.has(String(id)));
          const enterCls = isFresh ? "sea-arrive" : emerging === l.id ? "sea-emerge" : "";
          const isRecalled = recallOn && l.id === recalledId;
          const lift = isRecalled && risen;
          return (
            <div
              key={l.id}
              className="sea-swim sea-roam"
              data-lid={l.id}
              style={{
                left: lift ? Math.max(12, (width - w * 1.3) / 2 - 10) : leftPx,
                top: lift ? RECALL_TOP : `${topPct}%`,
                width: lift ? w * 1.3 : w,
                ["--dx" as any]: `${lift ? 20 : dx}px`,
                ["--dy" as any]: `${lift ? 0 : dy}px`,
                animationDuration: `${dur}s`,
                animationDelay: `${-(r(5) * dur)}s`,
                zIndex: isRecalled ? 14 : 6 + l.stage,
                opacity: appear ? (isRecalled ? 1 : (1 - sink * 0.25) * (dimOthers ? 0.3 : 1)) : 0,
                transition: isRecalled ? recallMove : "opacity .7s ease",
              }}
            >
              {isRecalled && <RecallGlow on={lift} />}
              <div
                className="sea-bob"
                style={{
                  animationDuration: `${1.6 + r(7)}s`,
                  animationDelay: `${-r(8) * 2}s`,
                  ["--wag" as any]: `${(0.32 + r(9) * 0.25) * (night ? 1.6 : 1) * (1 + sink)}s`,
                  ["--blink" as any]: `${3 + r(10) * 4}s`,
                }}
              >
                <div className={enterCls}>
                  <button
                    className={`sea-fishbtn ${wigCls(l.id)}`}
                    aria-label="생각 물고기"
                    onClick={() => {
                      poke(l.id);
                      setPeek(null);
                      setSheet({ kind: "now", id: l.id });
                    }}
                  >
                    {goldfishSvg(body, belly, eyeNight, r(12) > 0.55)}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* 기억 소환 중 — 바다 가장자리가 살짝 어두워져 떠오른 물고기만 도드라진다 */}
        <div className="sea-recall-dim" style={{ opacity: dimOthers ? 1 : 0 }} aria-hidden />

        {/* 꺼낸 기억이 지금 바다에 없는 물고기(지난달에만 있던 생각 등)면 — 바닥에서 한 마리가 깨어나 올라온다 */}
        {recallOn && !recalledId && (() => {
          const gid = `recall-${recallUnitId}`;
          const [body, belly] = PALETTE[Math.floor(hash(gid, 11) * PALETTE.length)];
          const w = STAGE_W[2];
          return (
            <div
              key={gid}
              className="sea-swim"
              style={{
                left: risen ? Math.max(12, (width - w * 1.3) / 2 - 10) : width * 0.2,
                top: risen ? RECALL_TOP : "86%",
                width: risen ? w * 1.3 : w,
                ["--dx" as any]: "20px",
                animationDuration: "14s",
                zIndex: 14,
                opacity: risen ? 1 : 0,
                transition: recallMove,
              }}
              aria-hidden
            >
              <RecallGlow on={risen} />
              <div className="sea-bob" style={{ animationDuration: "2s", ["--wag" as any]: "0.4s" }}>
                {goldfishSvg(body, belly, false, false)}
              </div>
            </div>
          );
        })()}

        {/* 아주 오래 조용한 계보 — 바닥 수초 뒤에서 쉰다 */}
        {hidden.map((l, hi) => {
          const r = (k: number) => hash(l.id, k);
          const [body, belly] = PALETTE[Math.floor(r(11) * PALETTE.length)];
          const w = STAGE_W[l.stage] ?? 62;
          return (
            <div
              key={l.id}
              className="sea-rest"
              style={{ right: 14 + hi * 18, bottom: `calc(70px + ${hi * 20}px)`, width: w, ...fade(dimOthers ? 0.25 : 0.85) }}
            >
              <div className="sea-bob" style={{ animationDuration: `${2.4 + r(7)}s`, ["--wag" as any]: "0.9s" }}>
                <div className={emerging === l.id ? "sea-emerge" : ""}>
                  <button
                    className={`sea-fishbtn ${wigCls(l.id)}`}
                    aria-label="쉬고 있는 생각 물고기"
                    onClick={() => {
                      poke(l.id);
                      setSheet({ kind: "now", id: l.id });
                    }}
                  >
                    {goldfishSvg(body, belly, true, false)}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* 쉬는 물고기를 가리는 수초 */}
        <svg className="sea-deco sea-sway-wrap" width="58" height="150" viewBox="0 0 40 140" style={{ right: 2, bottom: 40, zIndex: 9 }} aria-hidden>
          <path className="sea-ol sea-sway" d={WEED} fill="#2FAF6A" />
        </svg>
        <svg className="sea-deco" width="40" height="110" viewBox="0 0 40 140" style={{ right: 44, bottom: 40, zIndex: 9 }} aria-hidden>
          <path className="sea-ol sea-sway" d={WEED} fill="#46C985" style={{ animationDelay: "-1.4s" }} />
        </svg>

        {/* 성장 단서 — 심해에서 빛나는 기포가 올라온다 */}
        {growthCue && (
          <div className="sea-cue" aria-hidden>
            <span style={{ left: "44%", animationDelay: "0s" }} />
            <span style={{ left: "53%", width: 12, height: 12, animationDelay: "-1.1s" }} />
            <span style={{ left: "48%", width: 22, height: 22, animationDelay: "-2.2s" }} />
            <span style={{ left: "57%", width: 10, height: 10, animationDelay: "-3.3s" }} />
          </div>
        )}

        {thinking && (
          <div className="sea-thinking" role="status" aria-label="참견이가 생각하는 중">
            <span className="sea-dot" />
            <span className="sea-dot" style={{ animationDelay: ".15s" }} />
            <span className="sea-dot" style={{ animationDelay: ".3s" }} />
          </div>
        )}

        {/* 기다리는 동안 참견이가 옆에서 혼잣말 — 멍하니 점만 보고 있지 않게 */}
        {thinking && murmurText && (
          <div className="sea-murmur" aria-hidden>
            <PeekMascot expression={thinkingPhase === "listening" ? "base" : murmurIdx % 2 ? "base" : "tilt"} size={52} />
            <span key={murmurText} className="sea-murmur-say">
              {murmurText}
            </span>
          </div>
        )}

        {/* 방금 한 말이 치어가 되어 퐁당 — 받아쓰기가 도착한 순간(대답 전). 대답이 오면 진짜 기록의 치어로 바뀐다. */}
        {thinking && heardKey !== null && (
          <div
            key={"incoming-" + heardKey}
            className="sea-swim"
            style={{
              left: Math.max(16, width * 0.22),
              top: "30%",
              width: 26,
              ["--dx" as any]: `${Math.min(140, width * 0.35)}px`,
              animationDuration: `${16 * slow}s`,
              zIndex: 10,
            }}
            aria-hidden
          >
            <div className="sea-arrive">
              <div className="sea-bob" style={{ animationDuration: "1.1s", ["--wag" as any]: "0.2s" }}>
                <div className="sea-fry" style={{ position: "relative", width: 26 }}>
                  {frySvg("#FFA45C", false)}
                </div>
              </div>
            </div>
          </div>
        )}

        {thought && !thinking && (
          <div key={thought.key} className="sea-thought" role="status">
            {thought.text}
          </div>
        )}

        {night && (
          <>
            <div className="sea-zz" style={{ left: "70%", top: "30%", fontSize: 16, animationDelay: "-1.2s" }}>z</div>
            <div className="sea-zz" style={{ left: "24%", top: "46%", fontSize: 18, animationDelay: "-2.4s" }}>z</div>
          </>
        )}

        {/* 수달이 놀러 옴 — 대답 기다리는 중/카드 열림/기억 회상 중엔 바로 집으로 */}
        {visit && !visitBusy && (
          <SeaOtter
            visit={visit}
            containerRef={nowRef}
            onPoke={otterPoke}
            onTap={(v) => {
              plop();
              if (v.kind === "alarm") onOpenAlarms?.();
              else if (v.kind === "old_fish" && v.targetFishId) setSheet({ kind: "now", id: v.targetFishId });
            }}
            onDone={() => {
              visitActive.current = false;
              setVisit(null);
            }}
          />
        )}

        {/* 아래가 더 있다는 표시 — 글자 없이 화살표만. 아직 못 본 변화가 있으면 노랗게 빛난다. */}
        <div className={growthCue ? "sea-down sea-down-glow" : "sea-down"} aria-hidden>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M3 3 L8 7.5 L13 3 M3 8.5 L8 13 L13 8.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* ================= 심해 — 참견이가 사는 곳 ================= */}
      <DeepSea
        night={night}
        topColor={water[2]}
        growth={growth}
        fishCount={(lineages ?? []).length + (school.length > 0 ? 1 : 0)}
        busy={!!thinking || sheet !== null}
        onSeen={markGrowthSeen}
        noteCount={deepFacts?.noteCount ?? null}
        nextReminder={deepFacts?.nextReminder ?? null}
        away={!!visit}
      />

      {/* 가끔 지나가는 손님 */}
      {visitor && (
        <div
          key={visitor.key}
          className={`sea-visitor sea-v-${visitor.kind} ${visitor.kind === "jelly" ? "" : visitor.dir > 0 ? "sea-v-r" : "sea-v-l"}`}
          style={{
            top: visitor.top,
            left: visitor.kind === "jelly" ? visitor.left : visitor.dir > 0 ? -140 : width + 20,
            animationDuration: `${visitor.dur}s`,
            ["--dist" as any]: `${width + 160}px`,
            opacity: thinking || sheet ? 0 : 1,
          }}
          aria-hidden
        >
          <div style={{ transform: visitor.kind !== "jelly" && visitor.dir < 0 ? "scaleX(-1)" : undefined }}>
            {visitor.kind === "turtle" ? turtleSvg() : visitor.kind === "jelly" ? jellySvg() : anglerSvg()}
          </div>
        </div>
      )}

      {/* 참견이 — 할 말이 있을 때만 화면 오른쪽 가장자리에서 고개를 내민다 */}
      {peek && !thinking && (
        <div key={peek.key} className="sea-peek" aria-live="polite">
          <div className="sea-peek-say">{peek.text}</div>
          <PeekMascot expression={peek.expr} size={84} className="sea-peek-face" />
        </div>
      )}

      {/* 물고기 속 생각 — 한 마디씩 크게. 옆으로 넘기면 그 전에 한 말. */}
      {openNow && !thinking && sheet && (() => {
        const quotes = openNow.quotes;
        const i = Math.min(qi, Math.max(0, quotes.length - 1));
        const q = quotes[i];
        const [body, belly] = PALETTE[Math.floor(hash(sheet.id, 11) * PALETTE.length)];
        const go = (d: number) => setQi((cur) => Math.max(0, Math.min(quotes.length - 1, cur + d)));
        return (
          <>
            <div className="sea-sheet-dim" onClick={() => setSheet(null)} aria-hidden />
            <div
              className="sea-sheet"
              role="dialog"
              aria-label="이 물고기 속 생각"
              onTouchStart={(e) => {
                swipeX.current = e.touches[0].clientX;
              }}
              onTouchEnd={(e) => {
                const start = swipeX.current;
                swipeX.current = null;
                if (start === null) return;
                const dx = e.changedTouches[0].clientX - start;
                if (dx < -40) go(1);
                else if (dx > 40) go(-1);
              }}
            >
              <button className="sea-sheet-x" aria-label="닫기" onClick={() => setSheet(null)}>
                ×
              </button>
              <div className="sea-sheet-fish" aria-hidden>
                {goldfishSvg(body, belly, false, false)}
              </div>
              {q && (
                <>
                  <p key={i} className="sea-big-q">{q.text}</p>
                  <p className="sea-big-when">
                    {fuzzyAgo(q.at)}
                  </p>
                </>
              )}
              {quotes.length > 1 && (
                <div className="sea-pager">
                  <button className="sea-pg-btn" onClick={() => go(-1)} disabled={i === 0} aria-label="더 최근에 한 말">
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                      <path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div className="sea-dots" aria-hidden>
                    {quotes.map((_, k) => (
                      <span key={k} className={k === i ? "sea-dot-on" : ""} />
                    ))}
                  </div>
                  <button className="sea-pg-btn" onClick={() => go(1)} disabled={i === quotes.length - 1} aria-label="그 전에 한 말">
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                      <path d="M5 2 L10 7 L5 12" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              )}
              {openNow && (
                <div className="sea-ask">
                  <PeekMascot expression="base" size={40} />
                  <span>근데 그거 어떻게 됐어?</span>
                </div>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}

// 소환된 물고기 뒤의 노란 빛 + 반짝임 + 위로 올라가는 기포 줄(말풍선 쪽으로 이어진다)
function RecallGlow({ on }: { on: boolean }) {
  return (
    <>
      <div className={`sea-halo ${on ? "sea-halo-on" : ""}`} aria-hidden />
      {on && (
        <>
          <svg className="sea-spark" style={{ left: "-14%", top: "-30%", animationDelay: "0s" }} width="18" height="18" viewBox="0 0 20 20" aria-hidden>
            <path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill="#FFF3A8" stroke="#1B1630" strokeWidth={1.4} />
          </svg>
          <svg className="sea-spark" style={{ right: "-12%", top: "-12%", animationDelay: ".6s" }} width="14" height="14" viewBox="0 0 20 20" aria-hidden>
            <path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill="#FFF3A8" stroke="#1B1630" strokeWidth={1.4} />
          </svg>
          <svg className="sea-spark" style={{ right: "4%", bottom: "-26%", animationDelay: "1.1s" }} width="12" height="12" viewBox="0 0 20 20" aria-hidden>
            <path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill="#FFF3A8" stroke="#1B1630" strokeWidth={1.4} />
          </svg>
          <div className="sea-trail" aria-hidden>
            <span style={{ animationDelay: "0s" }} />
            <span style={{ animationDelay: ".5s" }} />
            <span style={{ animationDelay: "1s" }} />
            <span style={{ animationDelay: "1.5s" }} />
          </div>
        </>
      )}
    </>
  );
}


function turtleSvg() {
  return (
    <svg width="96" height="62" viewBox="0 0 96 62">
      <g className="sea-v-paddle">
        <path className="sea-ol" d="M30 40 C22 50 14 54 8 52 C12 46 18 40 26 36 Z" fill="#8DD48A" />
        <path className="sea-ol" d="M62 40 C70 50 78 54 84 50 C80 44 74 40 66 36 Z" fill="#8DD48A" />
      </g>
      <path className="sea-ol" d="M28 22 C20 16 12 14 6 16 C10 22 18 26 28 28 Z" fill="#8DD48A" />
      <path className="sea-ol" d="M14 34 L4 38 L14 40 Z" fill="#8DD48A" />
      <ellipse className="sea-ol" cx="46" cy="32" rx="28" ry="17" fill="#5FBF6E" />
      <path className="sea-ol2" d="M46 16 L46 48 M30 22 L62 42 M30 42 L62 22" fill="none" opacity="0.55" />
      <ellipse cx="38" cy="25" rx="7" ry="3.5" fill="#FFFFFF" opacity="0.35" />
      <circle className="sea-ol" cx="80" cy="30" r="10" fill="#8DD48A" />
      <circle cx="83" cy="27" r="2.6" fill="#1B1630" />
      <circle cx="83.8" cy="26.2" r="0.9" fill="#FFFFFF" />
      <path className="sea-ol2" d="M82 34 Q85 36 88 33" fill="none" />
      <ellipse cx="79" cy="34" rx="2.6" ry="1.6" fill="#FF8FB3" opacity="0.7" />
    </svg>
  );
}

function jellySvg() {
  return (
    <svg width="58" height="86" viewBox="0 0 58 86">
      <g className="sea-v-tent">
        <path d="M14 40 C10 52 18 58 13 70 C10 76 14 80 16 84" fill="none" stroke="#1B1630" strokeWidth={2.4} strokeLinecap="round" />
        <path d="M24 42 C22 54 28 60 24 72" fill="none" stroke="#1B1630" strokeWidth={2.4} strokeLinecap="round" />
        <path d="M34 42 C36 54 30 60 34 72" fill="none" stroke="#1B1630" strokeWidth={2.4} strokeLinecap="round" />
        <path d="M44 40 C48 52 40 58 45 70 C48 76 44 80 42 84" fill="none" stroke="#1B1630" strokeWidth={2.4} strokeLinecap="round" />
      </g>
      <path className="sea-ol" d="M4 40 C4 18 16 6 29 6 C42 6 54 18 54 40 C48 44 42 40 36 44 C31 40 27 40 22 44 C16 40 10 44 4 40 Z" fill="#FFB3D9" fillOpacity="0.92" />
      <ellipse cx="20" cy="18" rx="6" ry="3.5" fill="#FFFFFF" opacity="0.55" transform="rotate(-25 20 18)" />
      <circle cx="22" cy="28" r="2.4" fill="#1B1630" />
      <circle cx="36" cy="28" r="2.4" fill="#1B1630" />
      <path className="sea-ol2" d="M26 33 Q29 35.5 32 33" fill="none" />
      <ellipse cx="17" cy="33" rx="3" ry="1.8" fill="#FF6FA8" opacity="0.5" />
      <ellipse cx="41" cy="33" rx="3" ry="1.8" fill="#FF6FA8" opacity="0.5" />
    </svg>
  );
}

function anglerSvg() {
  return (
    <svg width="110" height="80" viewBox="0 0 110 80" style={{ overflow: "visible" }}>
      <circle className="sea-v-glow" cx="96" cy="12" r="16" fill="#FFE66B" opacity="0.35" />
      <path d="M62 26 C70 8 84 4 94 10" fill="none" stroke="#1B1630" strokeWidth={2.6} strokeLinecap="round" />
      <circle className="sea-ol2" cx="96" cy="12" r="5.5" fill="#FFE66B" />
      <g className="ft-tail">
        <path className="sea-ol" d="M24 46 C14 34 8 32 2 34 C6 42 6 52 2 60 C8 62 14 58 24 50 Z" fill="#6E5BA8" />
      </g>
      <path className="sea-ol" d="M22 48 C22 30 40 20 60 20 C80 20 94 32 94 48 C94 64 78 72 58 72 C38 72 22 64 22 48 Z" fill="#7F6BC0" />
      <path className="sea-ol2" d="M74 52 Q83 59 92 51" fill="none" />
      <ellipse cx="66" cy="48" rx="5" ry="3" fill="#FF8FB3" opacity="0.6" />
      <circle className="sea-ol2" cx="72" cy="36" r="6" fill="#FFFFFF" />
      <circle cx="73.5" cy="36.5" r="2.8" fill="#1B1630" />
      <circle cx="72.6" cy="35.4" r="1" fill="#FFFFFF" />
      <ellipse cx="44" cy="34" rx="8" ry="4" fill="#FFFFFF" opacity="0.18" />
    </svg>
  );
}

function frySvg(color: string, night: boolean) {
  return (
    <svg viewBox="0 0 40 26" aria-hidden>
      <g className="ft-tail">
        <path className="sea-ol2" d="M12 13 C7 7 4 6 1 7 C3 11 3 15 1 19 C4 20 7 19 12 13 Z" fill="#FFD3A1" />
      </g>
      <ellipse className="sea-ol2" cx="23" cy="13" rx="12" ry="8.5" fill={color} />
      {night ? (
        <path className="sea-ol2" d="M24 11 Q28 14 32 11" fill="none" />
      ) : (
        <>
          <circle className="sea-ol2" cx="28" cy="10.5" r="4.8" fill="#FFFFFF" />
          <circle cx="29.3" cy="10.9" r="2.4" fill="#1B1630" />
        </>
      )}
    </svg>
  );
}

const WEED = "M20 140 C8 110 30 95 18 70 C8 48 28 35 20 6 C34 30 22 50 30 72 C40 98 24 112 28 140 Z";


const BUBBLES: React.CSSProperties[] = [
  { left: "78%", bottom: "18%", width: 13, height: 13, animationDuration: "6.5s" },
  { left: "80%", bottom: "18%", width: 8, height: 8, animationDuration: "6.5s", animationDelay: "-2.2s" },
  { left: "76%", bottom: "18%", width: 16, height: 16, animationDuration: "8s", animationDelay: "-4.6s" },
  { left: "9%", bottom: "24%", width: 10, height: 10, animationDuration: "9s", animationDelay: "-1s" },
  { left: "42%", bottom: "12%", width: 11, height: 11, animationDuration: "11s", animationDelay: "-3s" },
  { left: "58%", bottom: "30%", width: 7, height: 7, animationDuration: "8.6s", animationDelay: "-6s" },
  { left: "24%", bottom: "8%", width: 9, height: 9, animationDuration: "10s", animationDelay: "-7s" },
];

const CSS = `
.sea-root{position:relative;width:100%;font-family:'Jua',sans-serif;color:#1B1630}
.sea-now{position:relative;height:100dvh;min-height:560px;overflow:hidden}
.sea-layer{position:relative;overflow:hidden}
.sea-surface{position:absolute;left:0;top:calc(env(safe-area-inset-top,0px) + 2px);display:block;animation:sea-wave 7s linear infinite;pointer-events:none}
@keyframes sea-wave{to{transform:translateX(-190px)}}
.sea-ray{position:absolute;top:-20px;width:34px;height:78%;background:linear-gradient(rgba(255,255,255,.34),rgba(255,255,255,0));transform:rotate(16deg);transform-origin:top;animation:sea-shimmer 5s ease-in-out infinite alternate;pointer-events:none}
@keyframes sea-shimmer{from{opacity:.45}to{opacity:1}}
.sea-ol{stroke:#1B1630;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.sea-ol2{stroke:#1B1630;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.sea-root .ft-ol{stroke:#1B1630;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.sea-root .ft-ol2{stroke:#1B1630;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.sea-root .ft-tail{transform-box:fill-box;transform-origin:100% 50%;animation:sea-wag var(--wag,.45s) ease-in-out infinite alternate}
@keyframes sea-wag{from{transform:rotate(-15deg)}to{transform:rotate(15deg)}}
.sea-root .ft-eye{transform-box:fill-box;transform-origin:50% 50%;animation:sea-blink var(--blink,5s) infinite}
@keyframes sea-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
.sea-deco{position:absolute;overflow:visible;pointer-events:none}
.sea-sway{transform-box:fill-box;transform-origin:50% 100%;animation:sea-sway 3.6s ease-in-out infinite alternate}
@keyframes sea-sway{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}
.sea-bubble{position:absolute;border-radius:50%;border:2px solid rgba(255,255,255,.95);background:rgba(255,255,255,.18);animation:sea-rise linear infinite;pointer-events:none;z-index:3}
.sea-bubble::after{content:"";position:absolute;left:22%;top:18%;width:26%;height:26%;border-radius:50%;background:#fff}
@keyframes sea-rise{0%{transform:translate(0,0) scale(.5);opacity:0}8%{opacity:.9}50%{transform:translate(8px,-34vh) scale(1)}90%{opacity:.8}100%{transform:translate(-6px,-68vh) scale(1.15);opacity:0}}
.sea-swim{position:absolute;animation-name:sea-swim;animation-timing-function:ease-in-out;animation-iteration-count:infinite;pointer-events:none}
.sea-roam{animation-name:sea-roam}
@keyframes sea-roam{0%{transform:translate(0,0) scaleX(1)}16%{transform:translate(calc(var(--dx)*.38),calc(var(--dy)*-1)) scaleX(1)}26%{transform:translate(calc(var(--dx)*.5),calc(var(--dy)*-.9)) scaleX(1)}46%{transform:translate(var(--dx),calc(var(--dy)*.45)) scaleX(1)}50%{transform:translate(var(--dx),calc(var(--dy)*.45)) scaleX(-1)}68%{transform:translate(calc(var(--dx)*.45),var(--dy)) scaleX(-1)}76%{transform:translate(calc(var(--dx)*.38),calc(var(--dy)*.92)) scaleX(-1)}96%{transform:translate(0,0) scaleX(-1)}100%{transform:translate(0,0) scaleX(1)}}
@keyframes sea-swim{0%{transform:translateX(0) scaleX(1)}46%{transform:translateX(var(--dx)) scaleX(1)}50%{transform:translateX(var(--dx)) scaleX(-1)}96%{transform:translateX(0) scaleX(-1)}100%{transform:translateX(0) scaleX(1)}}
.sea-bob{animation-name:sea-bob;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
@keyframes sea-bob{from{transform:translateY(-5px) rotate(-3deg)}to{transform:translateY(5px) rotate(3deg)}}
.sea-rest{position:absolute;z-index:8;pointer-events:none}
.sea-fishbtn,.sea-school{display:block;padding:0;margin:0;border:0;background:none;cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent}
.sea-fishbtn{width:100%}
.sea-fishbtn svg,.sea-fry svg{display:block;width:100%;height:auto;overflow:visible}
.sea-school{position:relative;width:64px;height:46px}
.sea-fishbtn:focus-visible,.sea-school:focus-visible{outline:3px dashed #fff;outline-offset:2px;border-radius:12px}
.sea-fry{position:absolute;width:20px}
.sea-wigA{animation:sea-wigA .7s ease-out}
.sea-wigB{animation:sea-wigB .7s ease-out}
@keyframes sea-wigA{0%{transform:none}15%{transform:scale(1.2,.84) rotate(-12deg)}40%{transform:translateX(26px) scale(.9,1.12) rotate(9deg)}70%{transform:translateX(12px) rotate(-4deg)}100%{transform:none}}
@keyframes sea-wigB{0%{transform:none}15%{transform:scale(1.2,.84) rotate(-12deg)}40%{transform:translateX(26px) scale(.9,1.12) rotate(9deg)}70%{transform:translateX(12px) rotate(-4deg)}100%{transform:none}}
.sea-arrive{animation:sea-arrive 1.4s cubic-bezier(.3,1.6,.5,1) .35s both}
@keyframes sea-arrive{0%{transform:translateY(-220px) scale(.55) rotate(-28deg);opacity:0}30%{opacity:1}100%{transform:none;opacity:1}}
.sea-emerge{animation:sea-emerge 2.4s cubic-bezier(.3,1.2,.5,1) .3s both}
@keyframes sea-emerge{0%{transform:translate(120px,160px) scale(.7);opacity:0}25%{opacity:1}100%{transform:none;opacity:1}}
.sea-down{position:absolute;left:20px;bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:10;display:flex;align-items:center;gap:4px;padding:6px;border-radius:999px;background:rgba(255,255,255,.18);color:#fff;font-size:13px;animation:sea-hint 2.6s ease-in-out infinite}
.sea-down-glow{background:rgba(255,226,107,.85);color:#1B1630;box-shadow:0 0 18px rgba(255,226,107,.9)}
.sea-cue{position:absolute;left:0;right:0;bottom:0;height:46%;z-index:4;pointer-events:none}
.sea-cue span{position:absolute;bottom:-20px;width:17px;height:17px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fffbe0 0%,#FFE066 45%,rgba(255,224,102,.35) 100%);box-shadow:0 0 18px 6px rgba(255,226,107,.8);animation:sea-cue 4.4s ease-in infinite}
@keyframes sea-cue{0%{transform:translate(0,0) scale(.6);opacity:0}12%{opacity:1}70%{opacity:.9}100%{transform:translate(10px,-40vh) scale(1.1);opacity:0}}
@keyframes sea-hint{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
.sea-zz{position:absolute;z-index:9;font-family:'Jua',sans-serif;color:#FFFFFF;-webkit-text-stroke:1.5px #1B1630;pointer-events:none;animation:sea-zz 3.6s ease-in-out infinite}
@keyframes sea-zz{0%{transform:translate(0,10px) scale(.6);opacity:0}25%{opacity:1}100%{transform:translate(14px,-40px) scale(1.2);opacity:0}}
.sea-thought{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 150px);z-index:11;width:max-content;max-width:80%;padding:10px 18px;background:#fff;border:3px solid #1B1630;border-radius:24px;box-shadow:3px 3px 0 #1B1630;font-size:17px;line-height:1.3;text-align:center;pointer-events:none;word-break:keep-all;animation:sea-thought 3.2s ease forwards}
@keyframes sea-thought{0%{transform:translate(-50%,24px) scale(.5);opacity:0}12%{transform:translate(-50%,0) scale(1.06);opacity:1}18%{transform:translate(-50%,0) scale(1)}80%{transform:translate(-50%,-6px) scale(1);opacity:1}100%{transform:translate(-50%,-26px) scale(.95);opacity:0}}
.sea-thinking{position:absolute;left:50%;top:46%;z-index:11;width:96px;height:96px;margin:-48px 0 0 -48px;box-sizing:border-box;border-radius:50%;border:3px solid #1B1630;background:rgba(255,255,255,.72);display:flex;align-items:center;justify-content:center;gap:7px;animation:sea-wobble 1.6s ease-in-out infinite;pointer-events:none}
.sea-thinking::after{content:"";position:absolute;left:20px;top:14px;width:18px;height:11px;border-radius:50%;background:#fff;transform:rotate(-30deg)}
.sea-dot{width:10px;height:10px;border-radius:50%;background:#1B1630;animation:sea-dot 1s ease-in-out infinite}
@keyframes sea-wobble{0%,100%{transform:scale(1,1) translateY(0)}25%{transform:scale(1.06,.94) translateY(3px)}50%{transform:scale(.95,1.05) translateY(-6px)}75%{transform:scale(1.03,.97) translateY(0)}}
.sea-murmur{position:absolute;left:50%;top:calc(46% + 62px);transform:translateX(-50%);z-index:11;display:flex;align-items:center;gap:6px;pointer-events:none;animation:sea-murmur-in .4s ease both}
@keyframes sea-murmur-in{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translateX(-50%)}}
.sea-murmur-say{white-space:nowrap;padding:6px 12px;background:#fff;border:2.5px solid #1B1630;border-radius:16px;box-shadow:2px 2px 0 #1B1630;font-size:15px;animation:sea-say .3s ease both}
@keyframes sea-dot{0%,100%{transform:translateY(0);opacity:.35}50%{transform:translateY(-6px);opacity:1}}
.sea-peek{position:fixed;right:max(0px,calc(50% - 240px));top:38%;z-index:60;pointer-events:none;display:flex;align-items:flex-end;gap:2px}
.sea-peek-face{display:block;margin-right:-22px;animation:sea-peek .6s cubic-bezier(.3,1.5,.5,1) both}
@keyframes sea-peek{from{transform:translateX(110%) rotate(0)}to{transform:translateX(0) rotate(-10deg)}}
.sea-peek-say{max-width:190px;margin-bottom:58px;padding:8px 14px;background:#fff;border:3px solid #1B1630;border-radius:20px;box-shadow:3px 3px 0 #1B1630;font-size:16px;line-height:1.3;word-break:keep-all;animation:sea-say .35s ease .35s both}
@keyframes sea-say{from{transform:scale(.6);opacity:0}to{transform:none;opacity:1}}
.sea-sheet-dim{position:fixed;inset:0;z-index:150;background:rgba(10,30,60,.18)}
.sea-sheet{position:fixed;left:max(14px,calc(50% - 226px));right:max(14px,calc(50% - 226px));bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:151;max-height:60dvh;overflow:auto;padding:18px 22px 16px;box-sizing:border-box;background:#FFFDF8;border:3px solid #1B1630;border-radius:28px;box-shadow:5px 5px 0 #1B1630;text-align:center;animation:sea-sheet .35s cubic-bezier(.2,1.2,.4,1) both}
@keyframes sea-sheet{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
.sea-sheet-x{position:absolute;right:12px;top:12px;width:32px;height:32px;border-radius:50%;border:2.5px solid #1B1630;background:#fff;font-family:'Jua',sans-serif;font-size:18px;line-height:1;color:#1B1630;cursor:pointer;padding:0}
.sea-sheet-fish{width:64px;margin:0 auto 6px}
.sea-sheet-fish svg{display:block;width:100%;height:auto;overflow:visible}
.sea-big-q{margin:4px 0 0;font-size:22px;line-height:1.5;color:#1B1630;word-break:keep-all;animation:sea-q-in .3s ease both}
.sea-big-q::before{content:"“";margin-right:2px;opacity:.35}
.sea-big-q::after{content:"”";margin-left:2px;opacity:.35}
@keyframes sea-q-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.sea-big-when{margin:8px 0 0;font-size:13px;color:rgba(27,22,48,.45)}
.sea-pager{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:14px}
.sea-pg-btn{width:34px;height:34px;border-radius:50%;border:2.5px solid #1B1630;background:#fff;color:#1B1630;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
.sea-pg-btn:disabled{opacity:.25;cursor:default}
.sea-dots{display:flex;gap:6px}
.sea-dots span{width:7px;height:7px;border-radius:50%;background:rgba(27,22,48,.18)}
.sea-dots .sea-dot-on{background:#1B1630}
.sea-ask{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;padding-top:12px;border-top:2px dashed rgba(27,22,48,.15);font-size:16px}
.sea-visitor{position:absolute;z-index:4;pointer-events:none;transition:opacity .5s ease;will-change:transform}
.sea-visitor svg{display:block;overflow:visible}
.sea-v-r{animation:sea-cross-r linear both}
.sea-v-l{animation:sea-cross-l linear both}
@keyframes sea-cross-r{0%{transform:translate(0,0)}25%{transform:translate(calc(var(--dist) * .25),-14px)}50%{transform:translate(calc(var(--dist) * .5),6px)}75%{transform:translate(calc(var(--dist) * .75),-10px)}100%{transform:translate(var(--dist),0)}}
@keyframes sea-cross-l{0%{transform:translate(0,0)}25%{transform:translate(calc(var(--dist) * -.25),-14px)}50%{transform:translate(calc(var(--dist) * -.5),6px)}75%{transform:translate(calc(var(--dist) * -.75),-10px)}100%{transform:translate(calc(var(--dist) * -1),0)}}
.sea-v-jelly{animation:sea-jelly ease-in-out both}
@keyframes sea-jelly{0%{transform:translate(0,40px);opacity:0}12%{opacity:1}30%{transform:translate(10px,-60px)}55%{transform:translate(-8px,-150px)}80%{transform:translate(6px,-230px);opacity:1}100%{transform:translate(0,-300px);opacity:0}}
.sea-v-jelly svg{animation:sea-pulse 1.8s ease-in-out infinite;transform-origin:50% 30%}
@keyframes sea-pulse{0%,100%{transform:scale(1,1)}50%{transform:scale(1.08,.9)}}
.sea-v-tent{animation:sea-tent 1.8s ease-in-out infinite;transform-origin:50% 0}
@keyframes sea-tent{0%,100%{transform:skewX(-4deg)}50%{transform:skewX(4deg)}}
.sea-v-paddle{animation:sea-paddle 1.6s ease-in-out infinite alternate;transform-origin:50% 40%}
@keyframes sea-paddle{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}
.sea-v-glow{animation:sea-glow 2.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
@keyframes sea-glow{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:.55;transform:scale(1.15)}}
.sea-recall-dim{position:absolute;inset:0;z-index:5;pointer-events:none;background:radial-gradient(ellipse 70% 55% at 50% 42%,rgba(8,25,60,0) 0%,rgba(8,25,60,.38) 100%);transition:opacity 1s ease}
.sea-halo{position:absolute;left:50%;top:50%;width:190%;aspect-ratio:1;transform:translate(-50%,-50%) scale(.3);border-radius:50%;background:radial-gradient(circle,rgba(255,240,150,.95) 0%,rgba(255,226,107,.55) 35%,rgba(255,226,107,0) 68%);opacity:0;transition:opacity 1s ease,transform 1.4s cubic-bezier(.3,1.4,.5,1);pointer-events:none;z-index:-1}
.sea-halo-on{opacity:1;transform:translate(-50%,-50%) scale(1);animation:sea-halo 2.4s ease-in-out 1.4s infinite}
@keyframes sea-halo{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.14)}}
.sea-spark{position:absolute;z-index:2;pointer-events:none;animation:sea-spark 1.8s ease-in-out infinite}
@keyframes sea-spark{0%,100%{transform:scale(.4) rotate(0deg);opacity:.2}50%{transform:scale(1.15) rotate(45deg);opacity:1}}
.sea-trail{position:absolute;left:50%;bottom:70%;width:0;height:0;pointer-events:none}
.sea-trail span{position:absolute;left:-5px;bottom:0;width:10px;height:10px;border-radius:50%;border:2px solid #fff;background:rgba(255,255,255,.35);animation:sea-trail 2s ease-in infinite;opacity:0}
@keyframes sea-trail{0%{transform:translate(0,0) scale(.5);opacity:0}15%{opacity:1}100%{transform:translate(6px,-110px) scale(1.1);opacity:0}}
@media (prefers-reduced-motion: reduce){
  .sea-swim,.sea-bob,.ft-tail,.ft-eye,.sea-sway,.sea-surface,.sea-bubble,.sea-ray,.sea-zz,.sea-emerge,.sea-peek-face,.sea-down{animation:none}
  .sea-cue span{animation:none;opacity:.9;bottom:24px}
  .sea-visitor{display:none}
}
`;
