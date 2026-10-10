// components/Sea.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadFresh, peekMemory, peekStored, prefetchWorld } from "@/lib/worldCache";
import PeekMascot, { type PeekExpression } from "@/components/PeekMascot";
import { goldfishSvg, hash, PALETTE, type TankEntry } from "@/components/FishTank";
import { plop } from "@/lib/seaSound";

// ============================================================================
// 참견이 바다 — 화면 전체가 물속. "깊이 = 시간".
// ----------------------------------------------------------------------------
// 첫 화면(이번 달 바다)
//   - 물고기 하나 = 생각의 계보 하나(/api/user/tank). 크기는 기존처럼 치어/금붕어/큰 금붕어.
//   - 높이: 마지막으로 말한 지 오래될수록 매일 조금씩 아래로 가라앉는다(연속). 오늘 말한 건 빛 드는 수면 근처.
//     말한 지 아주 오래된 계보는 바닥 수초 뒤에서 쉰다. 죽거나 사라지지 않고, 다시 말하면 쑥 올라온다.
//   - 아직 계보로 안 묶인 이번 달 생각은 수면 근처 치어 무리.
// 아래로 내려가면(스크롤) 물이 점점 어두워지며 지난달, 지지난달 생각들이 자고 있다. 표지판/버튼 없이 그냥 이어지는 물.
//   - 자는 물고기를 누르면 그때 한 말(날짜는 카드 안에서만). 그 달 전체를 읽는 건 하단 "지난 어항" 탭이 맡는다.
//   - 맨 아래가 진짜 바닥(모래·머그컵).
// 가끔 손님이 지나간다 — 위쪽엔 거북이, 중간엔 해파리, 밤 바닥엔 아귀. 한 번에 한 마리, 가끔만(Visitor).
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
  quotes: { text: string; at: string }[];
}

interface ArchiveMonth {
  month: string; // YYYY-MM (KST)
  fish: { id: string; stage: 1 | 2 | 3; quotes: { text: string; at: string }[] }[];
  reflection: string | null;
}

interface SeaProps {
  entries: TankEntry[] | null;
  thinking?: boolean;
  night: boolean;
  // (예전 "그때 한 말" 버튼용 — 바다에서 표지판을 빼면서 지금은 쓰지 않는다. 그 달 전체는 하단 "지난 어항" 탭에서.)
  onOpenMonth?: (month: string) => void;
}

const NOISE_MAX = 5;
const MAX_LOOSE_FRY = 5;
const SEEN_KEY = "ganseobi_tank_seen_v1";
const RETURN_SEEN_KEY = "ganseobi_tank_returned_v1";
const STAGE_W = { 1: 34, 2: 62, 3: 92 } as const;
const PAST_W = { 1: 30, 2: 52, 3: 74 } as const;
const SINK_DAYS = 40; // 이만큼 조용하면 거의 바닥까지 가라앉는다
const LAYER_H = 380; // 지난달 한 층의 높이(px)

// 깊어질수록 물색
const WATER_DAY = ["#8BE0FA", "#45BFEC", "#2E9BD6"];
const WATER_NIGHT = ["#3E8FCB", "#2C78B6", "#225F98"];
const LAYER_DAY = ["#2A8DCB", "#2479BA", "#1F68A8", "#1B5A96"];
const LAYER_NIGHT = ["#1F5A92", "#1B4E82", "#174374", "#143A66"];

function fuzzyAgo(iso: string): string {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (days < 1) return "오늘";
  if (days < 7) return "며칠 전";
  if (days < 30) return "몇 주 전";
  if (days < 60) return "한 달 전쯤";
  return "꽤 전에";
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return y === new Date().getFullYear() ? `${m}월` : `${y}년 ${m}월`;
}

function thisMonthKst(): string {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
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

type Sheet =
  | { kind: "now"; id: string }
  | { kind: "past"; month: string; id: string }
  | null;

export default function Sea({ entries, thinking, night }: SeaProps) {
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
    loadFresh<Lineage[]>("tank")
      .then((data) => {
        if (data && alive.current && seq === reqSeq.current) setLineages(data);
      })
      .catch((e) => console.error("[Sea] 계보 불러오기 실패:", e));
  }, [entriesKey]);

  // ---- 지난달 층 — 지난 어항 데이터(이번 달은 첫 화면이 맡으니 뺀다) ----
  const [archive, setArchive] = useState<ArchiveMonth[] | null>(() => peekMemory<ArchiveMonth[]>("archive"));
  useEffect(() => {
    if (!archive) {
      const stored = peekStored<ArchiveMonth[]>("archive");
      if (stored) setArchive(stored);
    }
    // 첫 화면이 먼저 뜨게 조금 있다가 받는다
    const t = setTimeout(() => {
      prefetchWorld("archive");
      loadFresh<ArchiveMonth[]>("archive")
        .then((d) => {
          if (d && alive.current) setArchive(d);
        })
        .catch(() => {
          /* 지난 층은 없어도 첫 화면은 그대로 */
        });
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pastMonths = useMemo(() => {
    const cur = thisMonthKst();
    return (archive ?? []).filter((m) => m.month < cur && m.fish.length > 0);
  }, [archive]);

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

  // ---- 누르기 ----
  const [sheet, setSheet] = useState<Sheet>(null);
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

  const hidden = (lineages ?? []).filter((l) => l.state === "hidden");
  const visible = (lineages ?? []).filter((l) => l.state !== "hidden");
  const slow = night ? 1.9 : 1;

  // ---- 가끔 지나가는 손님 — 한 번에 한 마리, 가끔만. 깊이마다 사는 생물이 다르다. ----
  //   거북이: 위쪽을 한 번 가로질러 간다 / 해파리: 중간에서 둥실 올라간다 / 아귀(밤만): 맨 바닥을 불빛 켜고 지나간다
  // 생각 물고기와 헷갈리지 않게 금붕어 색·모양은 쓰지 않고, 누를 수도 없다(그냥 "어? 방금 뭐 지나갔다").
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const busyRef = useRef(false);
  busyRef.current = !!thinking || sheet !== null;
  const nightRef = useRef(night);
  nightRef.current = night;
  const pastCountRef = useRef(0);
  pastCountRef.current = pastMonths.length;
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
      const past = pastCountRef.current;
      const n = nightRef.current;
      const roll = Math.random();
      const kind: VisitorKind = n ? (roll < 0.45 ? "angler" : roll < 0.8 ? "jelly" : "turtle") : roll < 0.5 ? "turtle" : "jelly";
      let top: number;
      if (kind === "turtle") top = vh * (0.34 + Math.random() * 0.2);
      else if (kind === "jelly")
        top = past > 0 && Math.random() < 0.6 ? vh + 120 + Math.random() * Math.max(0, past * LAYER_H - 260) : vh * (0.58 + Math.random() * 0.14);
      else top = past > 0 ? vh + past * LAYER_H + 30 : vh - 300;
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
  const layerColors = night ? LAYER_NIGHT : LAYER_DAY;
  const lastLayerColor = pastMonths.length
    ? layerColors[Math.min(pastMonths.length - 1, layerColors.length - 1)]
    : water[2];

  const openNow = sheet?.kind === "now" ? (lineages ?? []).find((l) => l.id === sheet.id) ?? null : null;
  const openPast =
    sheet?.kind === "past"
      ? pastMonths.find((m) => m.month === sheet.month)?.fish.find((f) => f.id === sheet.id) ?? null
      : null;

  const eyeNight = night;

  return (
    <div ref={rootRef} className="sea-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ================= 이번 달 바다 (첫 화면) ================= */}
      <section
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
              style={{
                left: leftPx,
                top: `${17 + r(3) * 8}%`,
                width: 64,
                ["--dx" as any]: `${dx}px`,
                animationDuration: `${dur}s`,
                animationDelay: `${-(r(5) * dur)}s`,
                zIndex: 5,
                ...fade(1),
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
          const sink = Math.pow(Math.min(1, days / SINK_DAYS), 0.75); // 0 = 수면, 1 = 바닥 근처
          const topPct = 24 + sink * 50 + (r(3) - 0.5) * 7;
          const dx = Math.min(width * (0.5 - sink * 0.3), 210) * (0.6 + r(2) * 0.4);
          const leftPx = 12 + r(4) * Math.max(0, width - 24 - w - dx);
          const dur = (13 + r(6) * 10) * slow * (1 + sink * 1.2);
          const isFresh = l.entryIds.some((id) => fresh.has(String(id)));
          const enterCls = isFresh ? "sea-arrive" : emerging === l.id ? "sea-emerge" : "";
          return (
            <div
              key={l.id}
              className="sea-swim"
              style={{
                left: leftPx,
                top: `${topPct}%`,
                width: w,
                ["--dx" as any]: `${dx}px`,
                animationDuration: `${dur}s`,
                animationDelay: `${-(r(5) * dur)}s`,
                zIndex: 6 + l.stage,
                ...fade(1 - sink * 0.25),
              }}
            >
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

        {/* 아주 오래 조용한 계보 — 바닥 수초 뒤에서 쉰다 */}
        {hidden.map((l, hi) => {
          const r = (k: number) => hash(l.id, k);
          const [body, belly] = PALETTE[Math.floor(r(11) * PALETTE.length)];
          const w = STAGE_W[l.stage] ?? 62;
          return (
            <div
              key={l.id}
              className="sea-rest"
              style={{ right: 14 + hi * 18, bottom: `calc(${pastMonths.length ? 70 : 210}px + ${hi * 20}px)`, width: w, ...fade(0.85) }}
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
        <svg className="sea-deco sea-sway-wrap" width="58" height="150" viewBox="0 0 40 140" style={{ right: 2, bottom: pastMonths.length ? 40 : 180, zIndex: 9 }} aria-hidden>
          <path className="sea-ol sea-sway" d={WEED} fill="#2FAF6A" />
        </svg>
        <svg className="sea-deco" width="40" height="110" viewBox="0 0 40 140" style={{ right: 44, bottom: pastMonths.length ? 40 : 180, zIndex: 9 }} aria-hidden>
          <path className="sea-ol sea-sway" d={WEED} fill="#46C985" style={{ animationDelay: "-1.4s" }} />
        </svg>

        {/* 지난달이 없으면 첫 화면 바닥이 곧 진짜 바닥 */}
        {pastMonths.length === 0 && <SeaFloor color={water[2]} lift />}

        {thinking && (
          <div className="sea-thinking" role="status" aria-label="참견이가 생각하는 중">
            <span className="sea-dot" />
            <span className="sea-dot" style={{ animationDelay: ".15s" }} />
            <span className="sea-dot" style={{ animationDelay: ".3s" }} />
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

        {/* 아래가 더 있다는 표시 — 글자 없이 화살표만 */}
        {pastMonths.length > 0 && (
          <div className="sea-down" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M3 3 L8 7.5 L13 3 M3 8.5 L8 13 L13 8.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </section>

      {/* ================= 지난달 층 — 내려갈수록 지난 시간 ================= */}
      {pastMonths.map((m, li) => {
        const top = li === 0 ? water[2] : layerColors[Math.min(li - 1, layerColors.length - 1)];
        const bottom = layerColors[Math.min(li, layerColors.length - 1)];
        const cols = width < 360 ? 2 : 3;
        const rows = Math.max(1, Math.ceil(m.fish.length / cols));
        const cellW = (width - 32) / cols;
        const cellH = (LAYER_H - 90) / rows;
        return (
          <section
            key={m.month}
            className="sea-layer"
            style={{ height: LAYER_H, background: `linear-gradient(${top}, ${bottom})` }}
            aria-label={`${monthLabel(m.month)} 바다`}
          >
            {m.fish.map((f, i) => {
              const r = (k: number) => hash(f.id, k);
              const [body, belly] = PALETTE[Math.floor(r(11) * PALETTE.length)];
              const w = PAST_W[f.stage] ?? 52;
              const col = i % cols;
              const row = Math.floor(i / cols);
              const left = 16 + col * cellW + r(4) * Math.max(0, cellW - w - 30);
              const topPx = 40 + row * cellH + r(3) * Math.max(0, cellH - w * 0.7);
              const dx = 18 + r(2) * 26;
              const dur = (20 + r(6) * 10) * slow;
              const isOpen = sheet?.kind === "past" && sheet.month === m.month && sheet.id === f.id;
              return (
                <div
                  key={f.id}
                  className="sea-swim"
                  style={{
                    left,
                    top: topPx,
                    width: w,
                    ["--dx" as any]: `${dx}px`,
                    animationDuration: `${dur}s`,
                    animationDelay: `${-(r(5) * dur)}s`,
                    zIndex: 4,
                    opacity: Math.max(0.6, 0.88 - li * 0.08),
                  }}
                >
                  <div className="sea-bob" style={{ animationDuration: `${2.2 + r(7)}s`, ["--wag" as any]: "0.8s", ["--blink" as any]: `${4 + r(10) * 4}s` }}>
                    <button
                      className={`sea-fishbtn ${wigCls(f.id)}`}
                      style={isOpen ? { outline: "3px dashed #fff", outlineOffset: 4, borderRadius: 14 } : undefined}
                      aria-label={`${monthLabel(m.month)}의 생각 물고기`}
                      onClick={() => {
                        poke(f.id);
                        setSheet({ kind: "past", month: m.month, id: f.id });
                      }}
                    >
                      {goldfishSvg(body, belly, true, r(12) > 0.55)}
                    </button>
                  </div>
                </div>
              );
            })}
            {/* 층마다 기포 몇 개 */}
            <div className="sea-bubble" style={{ left: `${20 + (li * 31) % 60}%`, bottom: 30, width: 9, height: 9, animationDuration: "6s", animationDelay: `${-li}s` }} />
            <div className="sea-bubble" style={{ left: `${60 - (li * 17) % 40}%`, bottom: 60, width: 7, height: 7, animationDuration: "7.4s", animationDelay: `${-li * 2}s` }} />
          </section>
        );
      })}

      {pastMonths.length > 0 && (
        <section className="sea-layer" style={{ height: 230, background: lastLayerColor }} aria-label="바다 바닥">
          <SeaFloor color={lastLayerColor} />
        </section>
      )}

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
      {(openNow || openPast) && !thinking && sheet && (() => {
        const quotes = openNow ? openNow.quotes : openPast!.quotes;
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
                {goldfishSvg(body, belly, !!openPast, false)}
              </div>
              {q && (
                <>
                  <p key={i} className="sea-big-q">{q.text}</p>
                  <p className="sea-big-when">
                    {openPast && sheet.kind === "past" ? dayLabel(q.at) : fuzzyAgo(q.at)}
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

// lift — 첫 화면이 곧 바닥일 때, 모래가 탭바 뒤에 가려지지 않게 탭바 높이만큼 올린다.
function SeaFloor({ color, lift = false }: { color: string; lift?: boolean }) {
  return (
    <div
      className="sea-floor"
      style={{ background: `linear-gradient(rgba(0,0,0,0), ${color} 55%)`, bottom: lift ? "calc(60px + env(safe-area-inset-bottom, 0px))" : 0 }}
      aria-hidden
    >
      <svg className="sea-deco" width="44" height="150" viewBox="0 0 40 140" style={{ left: 18, bottom: 70 }}>
        <path className="sea-ol sea-sway" d={WEED} fill="#2FAF6A" />
      </svg>
      <svg className="sea-deco" width="32" height="104" viewBox="0 0 40 140" style={{ left: 54, bottom: 66 }}>
        <path className="sea-ol sea-sway" d={WEED} fill="#46C985" style={{ animationDelay: "-1.2s" }} />
      </svg>
      {/* 가라앉은 머그컵 — 참견이 바다의 표식 */}
      <svg className="sea-deco" width="60" height="54" viewBox="0 0 50 44" style={{ right: "22%", bottom: 62, transform: "rotate(-22deg)", zIndex: 3 }}>
        <path className="sea-ol" d="M34 14 C45 14 45 31 34 31" fill="none" />
        <path className="sea-ol" d="M6 8 H34 V34 C34 39 30 42 26 42 H14 C10 42 6 39 6 34 Z" fill="#FF8FB3" />
        <path className="sea-ol2" d="M6 17 H34 V23 H6 Z" fill="#FFF6E5" />
        <path className="sea-ol2" d="M20 8 L23 12 L26 8" fill="#45BFEC" />
      </svg>
      <svg className="sea-sand" viewBox="0 0 332 84" preserveAspectRatio="none">
        <path className="sea-ol" d="M-4 42 C40 28 80 46 120 35 C160 24 200 42 240 33 C280 24 310 37 336 30 V90 H-4 Z" fill="#F6D589" />
        {PEBBLES.map(([cx, cy, rx, ry, c], i) => (
          <ellipse key={i} className="sea-ol2" cx={cx} cy={cy} rx={rx} ry={ry} fill={c} />
        ))}
      </svg>
    </div>
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

const PEBBLES: [number, number, number, number, string][] = [
  [40, 52, 13, 9, "#FF9EC4"],
  [66, 60, 10, 7, "#8BE0C0"],
  [96, 50, 12, 8, "#B9A7F2"],
  [128, 62, 14, 9, "#FFD54A"],
  [160, 48, 9, 6.5, "#FFFFFF"],
  [188, 58, 12, 8, "#FF9EC4"],
  [212, 66, 9, 6, "#7FB2FF"],
  [292, 52, 13, 9, "#8BE0C0"],
  [266, 64, 10, 7, "#FFD54A"],
  [20, 70, 11, 7, "#7FB2FF"],
  [110, 74, 9, 6, "#FF9EC4"],
  [236, 76, 11, 7, "#B9A7F2"],
  [314, 72, 9, 6, "#FFFFFF"],
];

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
@keyframes sea-wigA{0%{transform:none}20%{transform:scale(1.2,.84) rotate(-12deg)}45%{transform:scale(.9,1.12) rotate(9deg)}70%{transform:rotate(-4deg)}100%{transform:none}}
@keyframes sea-wigB{0%{transform:none}20%{transform:scale(1.2,.84) rotate(-12deg)}45%{transform:scale(.9,1.12) rotate(9deg)}70%{transform:rotate(-4deg)}100%{transform:none}}
.sea-arrive{animation:sea-arrive 1.4s cubic-bezier(.3,1.6,.5,1) .35s both}
@keyframes sea-arrive{0%{transform:translateY(-220px) scale(.55) rotate(-28deg);opacity:0}30%{opacity:1}100%{transform:none;opacity:1}}
.sea-emerge{animation:sea-emerge 2.4s cubic-bezier(.3,1.2,.5,1) .3s both}
@keyframes sea-emerge{0%{transform:translate(120px,160px) scale(.7);opacity:0}25%{opacity:1}100%{transform:none;opacity:1}}
.sea-floor{position:absolute;left:0;right:0;bottom:0;height:230px}
.sea-sand{position:absolute;left:-6px;right:-6px;bottom:0;width:calc(100% + 12px);height:100px;display:block}
.sea-down{position:absolute;left:20px;bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:10;display:flex;align-items:center;gap:4px;padding:6px;border-radius:999px;background:rgba(255,255,255,.18);color:#fff;font-size:13px;animation:sea-hint 2.6s ease-in-out infinite}
@keyframes sea-hint{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
.sea-zz{position:absolute;z-index:9;font-family:'Jua',sans-serif;color:#FFFFFF;-webkit-text-stroke:1.5px #1B1630;pointer-events:none;animation:sea-zz 3.6s ease-in-out infinite}
@keyframes sea-zz{0%{transform:translate(0,10px) scale(.6);opacity:0}25%{opacity:1}100%{transform:translate(14px,-40px) scale(1.2);opacity:0}}
.sea-thought{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 150px);z-index:11;width:max-content;max-width:80%;padding:10px 18px;background:#fff;border:3px solid #1B1630;border-radius:24px;box-shadow:3px 3px 0 #1B1630;font-size:17px;line-height:1.3;text-align:center;pointer-events:none;word-break:keep-all;animation:sea-thought 3.2s ease forwards}
@keyframes sea-thought{0%{transform:translate(-50%,24px) scale(.5);opacity:0}12%{transform:translate(-50%,0) scale(1.06);opacity:1}18%{transform:translate(-50%,0) scale(1)}80%{transform:translate(-50%,-6px) scale(1);opacity:1}100%{transform:translate(-50%,-26px) scale(.95);opacity:0}}
.sea-thinking{position:absolute;left:50%;top:46%;z-index:11;width:96px;height:96px;margin:-48px 0 0 -48px;box-sizing:border-box;border-radius:50%;border:3px solid #1B1630;background:rgba(255,255,255,.72);display:flex;align-items:center;justify-content:center;gap:7px;animation:sea-wobble 1.6s ease-in-out infinite;pointer-events:none}
.sea-thinking::after{content:"";position:absolute;left:20px;top:14px;width:18px;height:11px;border-radius:50%;background:#fff;transform:rotate(-30deg)}
.sea-dot{width:10px;height:10px;border-radius:50%;background:#1B1630;animation:sea-dot 1s ease-in-out infinite}
@keyframes sea-wobble{0%,100%{transform:scale(1,1) translateY(0)}25%{transform:scale(1.06,.94) translateY(3px)}50%{transform:scale(.95,1.05) translateY(-6px)}75%{transform:scale(1.03,.97) translateY(0)}}
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
@media (prefers-reduced-motion: reduce){
  .sea-swim,.sea-bob,.ft-tail,.ft-eye,.sea-sway,.sea-surface,.sea-bubble,.sea-ray,.sea-zz,.sea-emerge,.sea-peek-face,.sea-down{animation:none}
  .sea-visitor{display:none}
}
`;
