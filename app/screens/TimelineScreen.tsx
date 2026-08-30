"use client";

import { useState } from "react";

interface TimelineItem {
  id: string;
  date: string;
  type: "GOAL" | "EVENT" | "TASK" | "PATTERN";
  title: string;
  subText: string;
  sourceText?: string;
}

interface TimelineScreenProps {
  onOpenRecording: () => void;
}

// 더미 데이터 (실제 연동 시 Supabase에서 가져올 데이터)
const DUMMY_TIMELINE: TimelineItem[] = [
  {
    id: "1",
    date: "08.29",
    type: "GOAL",
    title: "킥복싱",
    subText: "이번 달 3회 목표 (현재 1회)",
    sourceText: "이번 달에는 적어도 세 번은 가야지.",
  },
  {
    id: "2",
    date: "08.27",
    type: "EVENT",
    title: "엄마와 저녁",
    subText: "금요일 저녁 약속",
    sourceText: "금요일에 엄마랑 저녁 먹기로 함.",
  },
  {
    id: "3",
    date: "08.25",
    type: "PATTERN",
    title: "또 미루는 중?",
    subText: "이번 주에만 '내일부터' 3번 나옴",
  },
];

export default function TimelineScreen({ onOpenRecording }: TimelineScreenProps) {
  const [activeTab, setActiveTab] = useState<"ALL" | "THREAD">("ALL");

  return (
    <div style={styles.container}>
      {/* 상단 헤더: 글로벌한 비주얼 + 한국어 툭 던지는 톤 */}
      <div style={styles.header}>
        <div>
          <span style={styles.badge}>GANSEOBI_ARCHIVE</span>
          <h1 style={styles.headerTitle}>요즘 뭐 하고 살지?</h1>
        </div>
        <div style={styles.dateStamp}>08.30 SUN</div>
      </div>

      {/* 참견이의 툭 던지는 관찰 코멘트 */}
      <div style={styles.commentBox}>
        <span style={styles.commentTag}>참견이의 관찰</span>
        <p style={styles.commentText}>
          &quot;운동 간다더니 이번 주에 벌써 세 번째 말만 바꾸네?&quot;
        </p>
      </div>

      {/* 탭 전환 */}
      <div style={styles.tabRow}>
        <button
          onClick={() => setActiveTab("ALL")}
          style={{
            ...styles.tabBtn,
            background: activeTab === "ALL" ? "#E5FF5D" : "transparent",
            color: activeTab === "ALL" ? "#C71585" : "#FFF",
          }}
        >
          기록 타임라인
        </button>
        <button
          onClick={() => setActiveTab("THREAD")}
          style={{
            ...styles.tabBtn,
            background: activeTab === "THREAD" ? "#E5FF5D" : "transparent",
            color: activeTab === "THREAD" ? "#C71585" : "#FFF",
          }}
        >
          기억 Thread 🧵
        </button>
      </div>

      {/* 타임라인 리스트 (생산성 앱 느낌 배제, 힙한 카드 형태) */}
      <div style={styles.listContainer}>
        {DUMMY_TIMELINE.map((item) => (
          <div key={item.id} style={styles.card}>
            <div style={styles.cardTopRow}>
              <span style={styles.cardDate}>{item.date}</span>
              <span style={styles.cardTypeBadge}>{item.type}</span>
            </div>
            <h3 style={styles.cardTitle}>{item.title}</h3>
            <p style={styles.cardSub}>{item.subText}</p>
            {item.sourceText && (
              <div style={styles.sourceBox}>
                &ldquo;{item.sourceText}&rdquo;
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 하단 플로팅 녹음 버튼 (핵심 루프 진입점) */}
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
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  badge: {
    fontSize: "10px",
    fontWeight: "900",
    letterSpacing: "1.5px",
    background: "#E5FF5D",
    color: "#C71585",
    padding: "2px 6px",
  },
  headerTitle: {
    fontSize: "28px",
    fontWeight: "900",
    margin: "6px 0 0 0",
    letterSpacing: "-0.5px",
    textShadow: "2px 2px 0px #111",
  },
  dateStamp: {
    fontSize: "12px",
    fontWeight: "bold",
    color: "rgba(255,255,255,0.7)",
  },
  commentBox: {
    background: "#1E1E1E",
    border: "2px solid #E5FF5D",
    padding: "14px",
    boxShadow: "4px 4px 0px #111",
  },
  commentTag: {
    fontSize: "10px",
    fontWeight: "900",
    color: "#E5FF5D",
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  commentText: {
    fontSize: "15px",
    fontWeight: "bold",
    margin: "6px 0 0 0",
    color: "#FFF",
  },
  tabRow: {
    display: "flex",
    gap: "8px",
    marginTop: "4px",
  },
  tabBtn: {
    flex: 1,
    padding: "10px",
    border: "2px solid #111",
    fontWeight: "900",
    fontSize: "13px",
    cursor: "pointer",
    boxShadow: "3px 3px 0px #111",
  },
  listContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  card: {
    background: "#FFF",
    color: "#1E1E1E",
    border: "2px solid #111",
    padding: "16px",
    boxShadow: "4px 4px 0px #111",
  },
  cardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "6px",
  },
  cardDate: {
    fontSize: "11px",
    fontWeight: "900",
    color: "#888",
  },
  cardTypeBadge: {
    fontSize: "10px",
    fontWeight: "900",
    background: "#C71585",
    color: "#E5FF5D",
    padding: "2px 6px",
  },
  cardTitle: {
    fontSize: "18px",
    fontWeight: "900",
    margin: "0 0 4px 0",
  },
  cardSub: {
    fontSize: "13px",
    color: "#555",
    margin: 0,
    fontWeight: "bold",
  },
  sourceBox: {
    marginTop: "10px",
    background: "#F4F4F4",
    borderLeft: "3px solid #C71585",
    padding: "6px 10px",
    fontSize: "12px",
    color: "#333",
    fontStyle: "italic",
  },
  floatingArea: {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "calc(100% - 40px)",
    maxWidth: "380px",
    zIndex: 100,
  },
  floatingButton: {
    width: "100%",
    background: "#E5FF5D",
    color: "#C71585",
    border: "3px solid #111",
    boxShadow: "4px 4px 0px #111",
    padding: "16px",
    fontSize: "16px",
    fontWeight: "900",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  micIcon: {
    fontSize: "18px",
  },
};
