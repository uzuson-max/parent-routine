"use client";

import { useMemo, useState } from "react";
import type { RecordEntry } from "./TimelineScreen";
import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";
import { IconMemory } from "@/components/icons";

interface CalendarScreenProps {
  entries: RecordEntry[] | null;
  onBack: () => void;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

export default function CalendarScreen({ entries, onBack }: CalendarScreenProps) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const baseDate = new Date();
  baseDate.setDate(1);
  baseDate.setMonth(baseDate.getMonth() + monthOffset);
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth(); // 0-indexed

  const entriesByDate = useMemo(() => {
    const map: Record<string, RecordEntry[]> = {};
    (entries ?? []).forEach((e) => {
      const key = dateKey(new Date(e.createdAt));
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [entries]);

  const firstDayWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDayWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedEntries = selectedDateKey ? (entriesByDate[selectedDateKey] ?? []) : [];
  const selectedDayLabel = selectedDateKey
    ? `${month + 1}월 ${parseInt(selectedDateKey.split("-")[2], 10)}일`
    : null;

  const goToDate = (key: string) => {
    setExpandedEntryId(null);
    setSelectedDateKey((prev) => (prev === key ? null : key));
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>← 뒤로</button>
        <div style={styles.titleRow}>
          <IconMemory style={{ width: 18, height: 18, color: BRAND.lavenderDeep }} />
          <span style={styles.titleText}>참견이가 기억하고 있는 것</span>
        </div>
        <div style={styles.monthNav}>
          <button
            style={styles.navBtn}
            onClick={() => {
              setMonthOffset((o) => o - 1);
              setSelectedDateKey(null);
            }}
          >
            ‹
          </button>
          <span style={styles.monthLabel}>{year}년 {month + 1}월</span>
          <button
            style={styles.navBtn}
            onClick={() => {
              setMonthOffset((o) => o + 1);
              setSelectedDateKey(null);
            }}
          >
            ›
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={styles.weekdayLabel}>{w}</div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hasEntries = !!entriesByDate[key];
          const isSelected = selectedDateKey === key;
          return (
            <button
              key={key}
              style={{ ...styles.dayCell, ...(isSelected ? styles.dayCellSelected : {}) }}
              onClick={() => goToDate(key)}
            >
              <span style={{ ...styles.dayNumber, ...(isSelected ? styles.dayNumberSelected : {}) }}>{day}</span>
              {hasEntries && <span style={isSelected ? styles.dotSelected : styles.dot} />}
            </button>
          );
        })}
      </div>

      {selectedDateKey && (
        <div style={styles.dayDetail}>
          <p style={styles.dayDetailTitle}>{selectedDayLabel}</p>
          {selectedEntries.length === 0 ? (
            <p style={styles.emptyDayText}>아무 말도 안 한 날.</p>
          ) : (
            selectedEntries
              .slice()
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .map((entry) => {
                const isOpen = expandedEntryId === entry.id;
                return (
                  <div
                    key={entry.id}
                    style={styles.entryRow}
                    onClick={() => setExpandedEntryId(isOpen ? null : entry.id)}
                  >
                    <span style={styles.entryTime}>{formatTime(entry.createdAt)}</span>
                    <p style={styles.entryPreview}>
                      너: &ldquo;{isOpen ? entry.transcript : truncate(entry.transcript, 30)}&rdquo;
                    </p>
                    {isOpen && entry.responseText && (
                      <p style={styles.entryResponse}>참견이: &ldquo;{entry.responseText}&rdquo;</p>
                    )}
                  </div>
                );
              })
          )}
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    ...pageBackground,
    color: BRAND.ink,
    padding: "20px 20px 60px 20px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: { display: "flex", flexDirection: "column", gap: "10px" },
  backBtn: {
    alignSelf: "flex-start",
    background: "transparent",
    border: "none",
    color: BRAND.ink,
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
    padding: 0,
  },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" },
  titleText: { fontSize: "13px", fontWeight: 900, color: BRAND.lavenderDeep, letterSpacing: "0.2px" },
  monthNav: { display: "flex", alignItems: "center", justifyContent: "center", gap: "16px" },
  navBtn: {
    background: BRAND.card,
    border: "2px solid #111",
    borderRadius: "50%",
    color: BRAND.ink,
    fontSize: "16px",
    fontWeight: 900,
    width: "32px",
    height: "32px",
    cursor: "pointer",
  },
  monthLabel: { fontSize: "18px", fontWeight: 900 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "6px",
  },
  weekdayLabel: {
    textAlign: "center",
    fontSize: "11px",
    fontWeight: 900,
    color: inkAlpha.faint,
    paddingBottom: "4px",
  },
  dayCell: {
    aspectRatio: "1",
    background: BRAND.card,
    border: "2px solid #111",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    cursor: "pointer",
    padding: 0,
  },
  dayCellSelected: {
    background: BRAND.lavenderPale,
    border: `2px solid ${BRAND.lavenderDeep}`,
    boxShadow: "3px 3px 0px rgba(77,63,115,0.16)",
  },
  dayNumber: { fontSize: "13px", fontWeight: 900, color: BRAND.ink },
  dayNumberSelected: { color: BRAND.lavenderDeep },
  dot: { width: "6px", height: "6px", borderRadius: "50%", background: BRAND.mint },
  dotSelected: { width: "6px", height: "6px", borderRadius: "50%", background: BRAND.lavenderDeep },
  dayDetail: {
    background: BRAND.card,
    color: BRAND.ink,
    border: "2px solid #111",
    borderRadius: "16px",
    boxShadow: "3px 4px 0px rgba(30,26,38,0.10)",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  dayDetailTitle: { fontSize: "15px", fontWeight: 900, margin: 0 },
  emptyDayText: { fontSize: "14px", color: inkAlpha.faint, fontWeight: "bold", margin: 0 },
  entryRow: {
    borderTop: `1px solid ${inkAlpha.hairline}`,
    paddingTop: "10px",
    cursor: "pointer",
  },
  entryTime: { fontSize: "11px", fontWeight: 900, color: inkAlpha.faint },
  entryPreview: { fontSize: "13px", color: inkAlpha.soft, margin: "4px 0 0 0", fontStyle: "italic", lineHeight: 1.4 },
  entryResponse: { fontSize: "13px", color: BRAND.lavenderDeep, margin: "6px 0 0 0", fontWeight: "900", lineHeight: 1.4 },
};
