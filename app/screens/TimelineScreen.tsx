
"use client";

import { useState } from "react";

export interface RecordEntry {
  id: string;
  createdAt: string;
  transcript: string;
  responseText: string | null;
}

// 진행 중인 commitment/goal 하이라이트 — 현재는 데이터 소스(API)가 없어 optional.
// 향후 commitment_memory 요약을 내려주는 엔드포인트가 생기면 page.tsx에서 이 prop을 채워주면 됨.
export interface MemoryHighlight {
  title: string;
  progressLabel: string; // 예: "1 / 3", "진행 중"
}

interface TimelineScreenProps {
  onOpenRecording: () => void;
  onOpenCalendar: () => void;
  entries: RecordEntry[] | null;
  nickname?: string | null;
  memoryHighlight?: MemoryHighlight | null;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${month}월 ${date}일 ${hh}:${mm}`;
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

export default function TimelineScreen({
  onOpenRecording,
  onOpenCalendar,
  entries,
  nickname,
  memoryHighlight,
}: TimelineScreenProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={styles.container}>
      {/* TOP */}
      <div style={styles.topSection}>
        <span style={styles.eyebrow}>{nickname ? `HEY, ${nickname}` : "HEY"}</span>
        <h1 style={styles.greeting}>
          {nickname ? `${nickname}, 오늘은 뭐 얘기할래?` : "오늘은 뭐 얘기할래?"}
        </h1>
      </div>

      {/* MAIN CTA — 화면에서 가장 큰 행동 */}
      <button style={styles.mainCta} onClick={onOpenRecording}>
        <span style={styles.ctaMic}>🎙️</span>
        <span style={styles.ctaText}>아무 말이나 해.</span>
        <span style={styles.ctaLabel}>TALK TO ME</span>
      </button>

      {/* MEMORY — 데이터 있을 때만 노출 */}
      {memoryHighlight && (
        <div style={styles.memoryCard}>
          <span style={styles.memoryLabel}>MEMORY</span>
          <p style={styles.memoryTitle}>{memoryHighlight.title}</p>
          <p style={styles.memoryProgress}>{memoryHighlight.progressLabel}</p>
        </div>
      )}

      {/* RECENT */}
      <div style={styles.recentHeader}>
        <span style={styles.sectionEyebrow}>RECENT</span>
        <h2 style={styles.recentTitle}>최근에 한 말</h2>
      </div>

      <div style={styles.listContainer}>
        {entries === null ? (
          <div style={styles.loadingCard}>
            <p style={styles.loadingText}>불러오는 중...</p>
          </div>
        ) : entries.length === 0 ? (
          <div style={styles.emptyCard}>
            <p style={styles.emptyTitle}>아직 네 얘기가 없어.</p>
            <p style={styles.emptySub}>위에 눌러서 뭐라도 말해봐.</p>
          </div>
        ) : (
          entries.map((entry) => {
            const isOpen = expandedId === entry.id;
            const isLong = entry.transcript.length > 40;
            return (
              <div
                key={entry.id}
                style={styles.card}
                onClick={() => setExpandedId(isOpen ? null : entry.id)}
              >
                <div style={styles.cardTopRow}>
                  <span style={styles.cardDate}>{formatDateTime(entry.createdAt)}</span>
                </div>

                <p style={styles.sectionLabel}>내가 한 말</p>
                <p style={styles.transcriptText}>
                  &ldquo;{isOpen ? entry.transcript : truncate(entry.transcript, 40)}&rdquo;
                </p>

                {entry.responseText && (
                  <>
                    <p style={styles.sectionLabelResponse}>참견이</p>
                    <p style={styles.responseTextStyle}>
                      &ldquo;{isOpen ? entry.responseText : truncate(entry.responseText, 40)}&rdquo;
                    </p>
                  </>
                )}

                {!isOpen && isLong && <p style={styles.expandHint}>눌러서 전체 보기</p>}
              </div>
            );
          })
        )}
      </div>

      <div style={{ height: "76px" }} />

      {/* NAVIGATION */}
      <div style={styles.bottomNav}>
        <div style={{ ...styles.navItem, ...styles.navItemActive }}>
          <span style={styles.navIcon}>🏠</span>
          <span style={styles.navText}>HOME</span>
        </div>
        <button style={styles.navItem} onClick={onOpenCalendar}>
          <span style={styles.navIcon}>📅</span>
          <span style={styles.navText}>기록</span>
        </button>
        <button
          style={styles.navItem}
          onClick={onOpenCalendar}
          title="Memory 전용 화면은 아직 없어서 우선 캘린더로 연결됨"
        >
          <span style={styles.navIcon}>🧵</span>
          <span style={styles.navText}>MEMORY</span>
        </button>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    background: "#C71585",
    color: "#FFF",
    padding: "24px 20px 0 20px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  topSection: { display: "flex", flexDirection: "column", gap: "4px" },
  eyebrow: {
    fontSize: "11px",
    fontWeight: "900",
    letterSpacing: "1.5px",
    color: "rgba(255,255,255,0.65)",
  },
  greeting: {
    fontSize: "26px",
    fontWeight: "900",
    margin: 0,
    letterSpacing: "-0.5px",
    lineHeight: 1.3,
    textShadow: "2px 2px 0px #111",
  },
  mainCta: {
    width: "100%",
    background: "#E5FF5D",
    color: "#C71585",
    border: "3px solid #111",
    boxShadow: "4px 4px 0px #111",
    padding: "22px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    cursor: "pointer",
  },
  ctaMic: { fontSize: "30px" },
  ctaText: { fontSize: "18px", fontWeight: "900" },
  ctaLabel: { fontSize: "10px", fontWeight: "900", letterSpacing: "1.5px", opacity: 0.7 },
  memoryCard: {
    background: "#1E1E1E",
    border: "2px solid #E5FF5D",
    padding: "14px",
    boxShadow: "4px 4px 0px #111",
  },
  memoryLabel: {
    fontSize: "10px",
    fontWeight: "900",
    color: "#E5FF5D",
    letterSpacing: "1.5px",
  },
  memoryTitle: { fontSize: "15px", fontWeight: "900", color: "#FFF", margin: "6px 0 2px 0" },
  memoryProgress: { fontSize: "13px", color: "rgba(255,255,255,0.7)", margin: 0, fontWeight: "bold" },
  recentHeader: { display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" },
  sectionEyebrow: {
    fontSize: "10px",
    fontWeight: "900",
    letterSpacing: "1.5px",
    color: "rgba(255,255,255,0.5)",
  },
  recentTitle: { fontSize: "16px", fontWeight: "900", margin: 0, color: "#FFF" },
  listContainer: { display: "flex", flexDirection: "column", gap: "12px" },
  loadingCard: {
    background: "#FFF",
    color: "#1E1E1E",
    border: "2px solid #111",
    padding: "24px 20px",
    boxShadow: "4px 4px 0px #111",
    textAlign: "center",
  },
  loadingText: { fontSize: "14px", fontWeight: "bold", margin: 0, color: "#888" },
  emptyCard: {
    background: "#FFF",
    color: "#1E1E1E",
    border: "2px solid #111",
    padding: "30px 20px",
    boxShadow: "4px 4px 0px #111",
    textAlign: "center",
  },
  emptyTitle: { fontSize: "18px", fontWeight: "900", margin: "0 0 8px 0" },
  emptySub: { fontSize: "13px", color: "#666", margin: 0, lineHeight: "1.4", fontWeight: "bold" },
  card: {
    background: "#FFF",
    color: "#1E1E1E",
    border: "2px solid #111",
    padding: "16px",
    boxShadow: "4px 4px 0px #111",
    cursor: "pointer",
  },
  cardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  cardDate: { fontSize: "11px", fontWeight: "900", color: "#888" },
  sectionLabel: {
    fontSize: "11px",
    fontWeight: "900",
    color: "#C71585",
    margin: "0 0 2px 0",
    letterSpacing: "0.5px",
  },
  sectionLabelResponse: {
    fontSize: "11px",
    fontWeight: "900",
    color: "#111",
    margin: "10px 0 2px 0",
    letterSpacing: "0.5px",
  },
  transcriptText: { fontSize: "14px", color: "#333", margin: 0, lineHeight: "1.5", fontStyle: "italic" },
  responseTextStyle: { fontSize: "14px", color: "#111", margin: 0, lineHeight: "1.5", fontWeight: "bold" },
  expandHint: { fontSize: "11px", color: "#999", margin: "10px 0 0 0", textAlign: "right" },
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    background: "#111",
    borderTop: "2px solid #E5FF5D",
    display: "flex",
    zIndex: 100,
  },
  navItem: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.5)",
    padding: "10px 0 14px 0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    cursor: "pointer",
  },
  navItemActive: { color: "#E5FF5D" },
  navIcon: { fontSize: "18px" },
  navText: { fontSize: "10px", fontWeight: "900", letterSpacing: "0.5px" },
};
