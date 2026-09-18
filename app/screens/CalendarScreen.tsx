
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
