// app/screens/ArchiveScreen.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadFresh, peekMemory, peekStored } from "@/lib/worldCache";
import { goldfishSvg, hash, PALETTE } from "@/components/FishTank";
import PeekMascot from "@/components/PeekMascot";
import { BottomNav, WorldTitle, worldPage, stickerCard, INK, YELLOW, WORLD_CSS, type WorldTab } from "@/components/WorldNav";

// ============================================================================
// 지난 어항 — "그때 내가 뭐라고 했더라?"
// ----------------------------------------------------------------------------
// 달마다 찍힌 어항 사진(그 달에 말한 계보 = 그 달의 물고기) + 월말 정산 + 그 달에 한 말 전부.
// 기존 "기록"(달력) 탭과 "MY > 내가 남긴 기억"이 하던 일을 이 화면 하나가 맡는다.
// 같은 계보는 홈 어항과 같은 색이라, 지난 어항에서 본 물고기를 지금 어항에서도 알아볼 수 있다.
// ============================================================================

interface ArchiveFish {
  id: string;
  stage: 1 | 2 | 3;
  quotes: { text: string; at: string }[];
}
interface ArchiveMonth {
  month: string; // YYYY-MM
  fish: ArchiveFish[];
  reflection: string | null;
  entries: { id: string; at: string; transcript: string; responseText: string | null }[];
}

const FISH_W = { 1: 30, 2: 52, 3: 74 } as const;
const BOX_W = 340;
const BOX_H = 240;
const ENTRY_PAGE = 10;

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return y === new Date().getFullYear() ? `${m}월` : `${y}.${m}월`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ArchiveScreen({
  onNavigate,
  unreadLetterCount = 0,
}: {
  onNavigate: (tab: WorldTab) => void;
  unreadLetterCount?: number;
}) {
  // 홈에서 미리 받아뒀거나 한 번 열어봤으면 바로 그 자리 그대로 보인다.
  const [months, setMonths] = useState<ArchiveMonth[] | null>(() => peekMemory<ArchiveMonth[]>("archive"));
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(() => peekMemory<ArchiveMonth[]>("archive")?.[0]?.month ?? null);
  const [openFish, setOpenFish] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [shown, setShown] = useState(ENTRY_PAGE);
  const pull = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    // 새로 켠 앱이면 지난번 지난 어항을 먼저 띄운다.
    const stored = peekStored<ArchiveMonth[]>("archive");
    if (stored) {
      setMonths((cur) => cur ?? stored);
      setSelected((cur) => cur ?? stored[0]?.month ?? null);
    }
    // 뒤에서 최신으로 맞춘다. 보고 있던 달은 그대로 두고, 없어진 달일 때만 맨 앞 달로.
    loadFresh<ArchiveMonth[]>("archive")
      .then((list) => {
        if (!alive || !list) return;
        setFailed(false);
        setMonths(list);
        setSelected((cur) => (cur && list.some((m) => m.month === cur) ? cur : list[0]?.month ?? null));
      })
      .catch((e) => {
        console.error("[ArchiveScreen] 불러오기 실패:", e);
        if (!alive) return;
        // 이미 보여줄 게 있으면 그대로 두고, 아무것도 없을 때만 실패 화면.
        if (peekMemory("archive")) return;
        setFailed(true);
        setMonths([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const month = useMemo(() => months?.find((m) => m.month === selected) ?? null, [months, selected]);
  const fish = month?.fish.find((f) => f.id === openFish) ?? null;

  // 그 달에 한 말 — 날짜별로 묶어서 최신순
  const days = useMemo(() => {
    if (!month) return [] as { day: string; items: ArchiveMonth["entries"] }[];
    const out: { day: string; items: ArchiveMonth["entries"] }[] = [];
    for (const e of month.entries.slice(0, shown)) {
      const d = dayLabel(e.at);
      const last = out[out.length - 1];
      if (last && last.day === d) last.items.push(e);
      else out.push({ day: d, items: [e] });
    }
    return out;
  }, [month, shown]);

  const pickMonth = (key: string) => {
    setSelected(key);
    setOpenFish(null);
    setOpenEntry(null);
    setShown(ENTRY_PAGE);
  };

  return (
    <div
      style={worldPage}
      onTouchStart={(e) => {
        // 맨 위에서 아래로 끌어내리면 지금 어항으로 올라간다(홈에서 위로 쓸어 내려온 길의 반대).
        pull.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
      }}
      onTouchEnd={(e) => {
        const start = pull.current;
        pull.current = null;
        if (start !== null && e.changedTouches[0].clientY - start > 90) onNavigate("home");
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: WORLD_CSS + CSS }} />
      <button className="ar-surface" onClick={() => onNavigate("home")} aria-label="지금 어항으로 올라가기">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M3 8 L8 3.5 L13 8 M3 13 L8 8.5 L13 13" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        지금 어항
      </button>
      <WorldTitle>지난 어항</WorldTitle>

      {months === null ? (
        <p style={s.muted}>잠깐만.</p>
      ) : months.length === 0 ? (
        <div style={{ ...stickerCard, ...s.empty }}>
          <PeekMascot expression={failed ? "tilt" : "base"} size={64} />
          <p style={s.emptyTitle}>{failed ? "지난 어항이 잘 안 열리네." : "아직 지난 어항이 없어."}</p>
          <p style={s.muted}>{failed ? "조금 있다 다시 열어볼래?" : "말을 던지면 달마다 여기 한 장씩 남아."}</p>
        </div>
      ) : (
        <>
          {/* 달 고르기 */}
          <div style={s.chips} role="tablist" aria-label="달 고르기">
            {months.map((m) => (
              <button
                key={m.month}
                role="tab"
                aria-selected={m.month === selected}
                className="wn-sticker"
                style={{ ...s.chip, ...(m.month === selected ? s.chipOn : null) }}
                onClick={() => pickMonth(m.month)}
              >
                {monthLabel(m.month)}
              </button>
            ))}
          </div>

          {month && (
            <>
              {/* 그 달의 어항 사진 */}
              <div style={s.photo}>
                <div style={s.water}>
                  {month.fish.length === 0 && <p style={s.photoEmpty}>이 달엔 아직 물고기가 없었어.</p>}
                  {month.fish.map((f, i) => {
                    const r = (k: number) => hash(f.id, k);
                    const [body, belly] = PALETTE[Math.floor(r(11) * PALETTE.length)];
                    const w = FISH_W[f.stage];
                    // 칸을 나눠 놓고 칸 안에서만 살짝 흔들어서 물고기끼리 겹치지 않게
                    const rows = Math.max(1, Math.ceil(month.fish.length / 3));
                    const cellW = BOX_W / 3;
                    const cellH = (BOX_H - 50) / rows;
                    const col = (i % 3 + Math.floor(i / 3)) % 3;
                    const left = col * cellW + r(4) * Math.max(0, cellW - w - 8) + 4;
                    const top = 12 + Math.floor(i / 3) * cellH + r(3) * Math.max(0, cellH - w * 0.7 - 6);
                    return (
                      <button
                        key={f.id}
                        className="ar-fish"
                        style={{
                          left: `${(left / BOX_W) * 100}%`,
                          top: `${(top / BOX_H) * 100}%`,
                          width: w,
                          animationDelay: `${-r(8) * 2}s`,
                          transform: r(2) > 0.5 ? "scaleX(-1)" : undefined,
                          outline: openFish === f.id ? `3px dashed ${INK}` : undefined,
                        }}
                        aria-label="이 달의 생각 물고기"
                        onClick={() => setOpenFish(openFish === f.id ? null : f.id)}
                      >
                        {goldfishSvg(body, belly, false, r(12) > 0.55)}
                      </button>
                    );
                  })}
                  <div style={s.sand} />
                </div>
              </div>

              {/* 누른 물고기 — 그 달에 한 말 */}
              {fish && (
                <div style={{ ...stickerCard, ...s.card }}>
                  <ul style={s.quotes}>
                    {fish.quotes.map((q, i) => (
                      <li key={i} style={s.quoteRow}>
                        <span style={s.when}>{dayLabel(q.at)}</span>
                        <span style={s.quote}>&ldquo;{q.text}&rdquo;</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 월말 정산 */}
              {month.reflection && (
                <div style={{ ...stickerCard, ...s.card, background: "#FFF6D6" }}>
                  <div style={s.reflHead}>
                    <PeekMascot expression="base" size={40} />
                    <span>{monthLabel(month.month)}의 너</span>
                  </div>
                  <p style={s.reflText}>{month.reflection}</p>
                </div>
              )}

              {/* 그 달에 한 말 전부 */}
              <p style={s.section}>{monthLabel(month.month)}에 한 말</p>
              {month.entries.length === 0 ? (
                <p style={s.muted}>이 달엔 남긴 말이 없어.</p>
              ) : (
                <div style={{ ...stickerCard, ...s.list }}>
                  {days.map((d, di) => (
                    <div key={d.day} style={di > 0 ? s.dayDivider : undefined}>
                      <p style={s.dayLabel}>{d.day}</p>
                      {d.items.map((e) => {
                        const open = openEntry === e.id;
                        return (
                          <button key={e.id} style={s.entry} onClick={() => setOpenEntry(open ? null : e.id)} aria-expanded={open}>
                            <span style={s.time}>{timeLabel(e.at)}</span>
                            <span style={s.entryText}>
                              &ldquo;{open || e.transcript.length <= 42 ? e.transcript : e.transcript.slice(0, 42) + "…"}&rdquo;
                            </span>
                            {open && e.responseText && <span style={s.reply}>참견이: {e.responseText}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {month.entries.length > shown && (
                    <button className="wn-sticker" style={s.more} onClick={() => setShown(shown + ENTRY_PAGE)}>
                      더 보기
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      <BottomNav active="archive" onNavigate={onNavigate} unreadLetterCount={unreadLetterCount} />
    </div>
  );
}

const CSS = `
.ar-fish { position: absolute; padding: 0; margin: 0; border: 0; background: none; cursor: pointer; border-radius: 12px; animation: ar-bob 2.2s ease-in-out infinite alternate; -webkit-tap-highlight-color: transparent; z-index: 2; }
.ar-fish svg { display: block; width: 100%; height: auto; overflow: visible; }
.ar-fish .ft-ol { stroke: ${INK}; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
.ar-fish .ft-ol2 { stroke: ${INK}; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
@keyframes ar-bob { from { translate: 0 -4px; } to { translate: 0 4px; } }
.ar-surface { display: flex; align-items: center; gap: 4px; margin: 0 auto -6px; padding: 4px 12px; border: 0; background: transparent; color: rgba(27,22,48,.5); font-family: 'Jua', sans-serif; font-size: 13px; cursor: pointer; }
.ar-surface:focus-visible { outline: 3px dashed ${INK}; outline-offset: 2px; border-radius: 10px; }
@media (prefers-reduced-motion: reduce) { .ar-fish { animation: none; } }
`;

const s: { [k: string]: React.CSSProperties } = {
  muted: { fontSize: 14, color: "rgba(27,22,48,.6)", margin: "8px 0", lineHeight: 1.5 },
  empty: { padding: "28px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" },
  emptyTitle: { fontSize: 18, margin: "6px 0 0" },
  chips: { display: "flex", gap: 8, overflowX: "auto", padding: "2px 2px 10px", margin: "0 -2px" },
  chip: {
    flexShrink: 0,
    minHeight: 40,
    padding: "0 16px",
    borderRadius: 999,
    border: `3px solid ${INK}`,
    background: "#FFFFFF",
    boxShadow: `3px 3px 0 ${INK}`,
    fontFamily: "'Jua', sans-serif",
    fontSize: 16,
    color: INK,
    cursor: "pointer",
  },
  chipOn: { background: YELLOW },
  photo: {
    border: `4px solid ${INK}`,
    borderRadius: 28,
    boxShadow: `6px 6px 0 rgba(27,22,48,.22)`,
    overflow: "hidden",
    background: "#EAF9FF",
    padding: "18px 0 0",
  },
  water: { position: "relative", width: "100%", aspectRatio: `${BOX_W} / ${BOX_H}`, background: "#45BFEC", borderTop: "3px solid #FFFFFF" },
  sand: { position: "absolute", left: 0, right: 0, bottom: 0, height: 34, background: "#F6D589", borderTop: `3px solid ${INK}`, zIndex: 1 },
  photoEmpty: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", margin: 0, color: "#FFFFFF", fontSize: 16 },
  card: { marginTop: 14, padding: "14px 16px" },
  quotes: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
  quoteRow: { display: "flex", flexDirection: "column" },
  when: { fontSize: 12, color: "rgba(27,22,48,.55)" },
  quote: { fontSize: 16, lineHeight: 1.4, wordBreak: "keep-all" },
  reflHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "#4D3F73" },
  reflText: { margin: "8px 0 0", fontSize: 16, lineHeight: 1.6, wordBreak: "keep-all", whiteSpace: "pre-line" },
  section: { fontSize: 18, margin: "22px 2px 8px" },
  list: { padding: "6px 0" },
  dayDivider: { borderTop: "2px dashed rgba(27,22,48,.18)" },
  dayLabel: { margin: "10px 16px 2px", fontSize: 13, color: "#4D3F73" },
  entry: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 16px",
    border: 0,
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "'Jua', sans-serif",
    color: INK,
  },
  time: { fontSize: 12, color: "rgba(27,22,48,.5)" },
  entryText: { fontSize: 15, lineHeight: 1.45, wordBreak: "keep-all" },
  reply: { fontSize: 14, lineHeight: 1.45, color: "#4D3F73", wordBreak: "keep-all", marginTop: 2 },
  more: {
    display: "block",
    margin: "8px auto 6px",
    minHeight: 40,
    padding: "0 18px",
    borderRadius: 999,
    border: `3px solid ${INK}`,
    background: "#FFFFFF",
    boxShadow: `3px 3px 0 ${INK}`,
    fontFamily: "'Jua', sans-serif",
    fontSize: 15,
    color: INK,
    cursor: "pointer",
  },
};
