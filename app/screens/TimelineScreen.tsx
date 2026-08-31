"use client";

import { useState } from "react";

export interface RecordEntry {
  id: string;
  createdAt: string;
  transcript: string;
  responseText: string | null;
}

interface TimelineScreenProps {
  onOpenRecording: () => void;
  entries: RecordEntry[] | null; // null = 아직 로딩 중
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

export default function TimelineScreen({ onOpenRecording, entries }: TimelineScreenProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <span style={styles.badge}>GANSEOBI_ARCHIVE</span>
          <h1 style={styles.headerTitle}>요즘 뭐 하고 살지?</h1>
        </div>
      </div>

      <div style={styles.commentBox}>
        <span style={styles.commentTag}>참견이의 관찰</span>
        <p style={styles.commentText}>
          {entries && entries.length > 0
            ? `"요즘 기록이 좀 쌓였네? 너 요즘 바쁘다?"`
            : `"아직 아무 말도 안 했어. 조용하네."`}
        </p>
      </div>

      <div style={styles.tabRow}>
        <button style={{ ...styles.tabBtn, background: "#E5FF5D", color: "#C71585" }}>
          기록 타임라인
        </button>
        <button style={{ ...styles.tabBtn, background: "transparent", color: "#FFF" }}>
          기억 Thread 🧵
        </button>
      </div>

      <div style={styles.listContainer}>
        {entries === null ? (
          <div style={styles.loadingCard}>
            <p style={styles.loadingText}>불러오는 중...</p>
          </div>
        ) : entries.length === 0 ? (
          <div style={styles.emptyCard}>
            <p style={styles.emptyTitle}>아직 네 얘기가 없어.</p>
            <p style={styles.emptySub}>가서 뭐라도 말해봐.</p>
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

      <div style={styles.floatingArea}>
        <button style={styles.floatingButton} onClick={onOpenRecording}>
          <span style={styles.micIcon}>🎙</span>
          <span>말하러 가기</span>
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
    padding: "20px 20px 100px 20px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  badge: {
    fontSize: "10px", fontWeight: "900", letterSpacing: "1.5px",
    background: "#E5FF5D", color: "#C71585", padding: "2px 6px",
  },
  headerTitle: {
    fontSize: "28px", fontWeight: "900", margin: "6px 0 0 0",
    letterSpacing: "-0.5px", textShadow: "2px 2px 0px #111",
  },
  commentBox: { background: "#1E1E1E", border: "2px solid #E5FF5D", padding: "14px", boxShadow: "4px 4px 0px #111" },
  commentTag: { fontSize: "10px", fontWeight: "900", color: "#E5FF5D", letterSpacing: "1px", textTransform: "uppercase" },
  commentText: { fontSize: "15px", fontWeight: "bold", margin: "6px 0 0 0", color: "#FFF" },
  tabRow: { display: "flex", gap: "8px", marginTop: "4px" },
  tabBtn: { flex: 1, padding: "10px", border: "2px solid #111", fontWeight: "900", fontSize: "13px", cursor: "pointer", boxShadow: "3px 3px 0px #111" },
  listContainer: { display: "flex", flexDirection: "column", gap: "12px" },
  loadingCard: { background: "#FFF", color: "#1E1E1E", border: "2px solid #111", padding: "24px 20px", boxShadow: "4px 4px 0px #111", textAlign: "center" },
  loadingText: { fontSize: "14px", fontWeight: "bold", margin: 0, color: "#888" },
  emptyCard: { background: "#FFF", color: "#1E1E1E", border: "2px solid #111", padding: "30px 20px", boxShadow: "4px 4px 0px #111", textAlign: "center" },
  emptyTitle: { fontSize: "18px", fontWeight: "900", margin: "0 0 8px 0" },
  emptySub: { fontSize: "13px", color: "#666", margin: 0, lineHeight: "1.4", fontWeight: "bold" },
  card: { background: "#FFF", color: "#1E1E1E", border: "2px solid #111", padding: "16px", boxShadow: "4px 4px 0px #111", cursor: "pointer" },
  cardTopRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" },
  cardDate: { fontSize: "11px", fontWeight: "900", color: "#888" },
  sectionLabel: { fontSize: "11px", fontWeight: "900", color: "#C71585", margin: "0 0 2px 0", letterSpacing: "0.5px" },
  sectionLabelResponse: { fontSize: "11px", fontWeight: "900", color: "#111", margin: "10px 0 2px 0", letterSpacing: "0.5px" },
  transcriptText: { fontSize: "14px", color: "#333", margin: 0, lineHeight: "1.5", fontStyle: "italic" },
  responseTextStyle: { fontSize: "14px", color: "#111", margin: 0, lineHeight: "1.5", fontWeight: "bold" },
  expandHint: { fontSize: "11px", color: "#999", margin: "10px 0 0 0", textAlign: "right" },
  floatingArea: { position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", width: "calc(100% - 40px)", maxWidth: "380px", zIndex: 100 },
  floatingButton: {
    width: "100%", background: "#E5FF5D", color: "#C71585", border: "3px solid #111",
    boxShadow: "4px 4px 0px #111", padding: "16px", fontSize: "16px", fontWeight: "900",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
  },
  micIcon: { fontSize: "18px" },
};
