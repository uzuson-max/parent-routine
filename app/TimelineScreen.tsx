
import React from "react";

export interface RecordEntry {
  id: string;
  created_at: string;
  transcript?: string;
  response?: {
    response?: string;
  };
  analysis?: {
    commitment?: string;
  };
}

interface TimelineScreenProps {
  onOpenRecording: () => void;
  onOpenCalendar: () => void;
  entries: RecordEntry[] | null;
}

export default function TimelineScreen({ onOpenRecording, onOpenCalendar, entries }: TimelineScreenProps) {
  return (
    <div style={styles.container}>
      {/* 헤더 */}
      <div style={styles.header}>
        <div>
          <span style={styles.badge}>GANSEOBI_ARCHIVE</span>
          <h1 style={styles.headerTitle}>요즘 뭐 하고 살지?</h1>
        </div>
        <button style={styles.calendarBtn} onClick={onOpenCalendar} title="캘린더 보기">
          📅
        </button>
      </div>

      {/* 기록 추가 버튼 */}
      <button style={styles.recordBtn} onClick={onOpenRecording}>
        + 오늘 얘기 남기기
      </button>

      {/* 타임라인 기록 리스트 */}
      <div style={styles.listContainer}>
        {!entries ? (
          <p style={styles.emptyText}>기록을 불러오는 중...</p>
        ​) : entries.length === 0 ? (
          <p style={styles.emptyText}>아직 남긴 기록이 없어. 첫 이야기를 들려줘!</p>
        ​) : (
          entries.map((entry) => (
            <div key={entry.id} style={styles.card}>
              <span style={styles.dateText}>
                {new Date(entry.created_at).toLocaleDateString("ko-KR", {
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {entry.analysis?.commitment && (
                <p style={styles.commitmentText}>🎯 {entry.analysis.commitment}</p>
              )}
              <p style={styles.transcriptText}>
                {entry.transcript || entry.response?.response || "기록된 내용"}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: "600px",
    margin: "0 auto",
    padding: "24px 20px",
    color: "#fff",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  },
  headerTitle: {
    fontSize: "22px",
    fontWeight: "bold",
    color: "#fff",
    margin: "4px 0 0 0",
  },
  badge: {
    fontSize: "11px",
    color: "#E5FF5D",
    background: "#222",
    padding: "2px 6px",
    borderRadius: "4px",
    fontWeight: "bold",
  },
  calendarBtn: {
    background: "#1E1E1E",
    border: "2px solid #E5FF5D",
    color: "#E5FF5D",
    fontSize: "16px",
    width: "40px",
    height: "40px",
    borderRadius: "10px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  recordBtn: {
    width: "100%",
    background: "#E5FF5D",
    color: "#111",
    border: "none",
    padding: "14px",
    fontSize: "16px",
    fontWeight: "bold",
    borderRadius: "12px",
    cursor: "pointer",
    marginBottom: "24px",
  },
  listContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  emptyText: {
    textAlign: "center",
    color: "#eee",
    fontSize: "14px",
    marginTop: "40px",
  },
  card: {
    background: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    padding: "16px",
    borderRadius: "12px",
  },
  dateText: {
    fontSize: "12px",
    color: "#E5FF5D",
    display: "block",
    marginBottom: "6px",
  },
  commitmentText: {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#fff",
    margin: "0 0 6px 0",
  },
  transcriptText: {
    fontSize: "13px",
    color: "#ddd",
    margin: 0,
    lineHeight: "1.4",
  },
};
