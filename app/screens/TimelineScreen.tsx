"use client";

interface TimelineItem {
  id: string;
  date: string;
  type: string;
  title: string;
  subText: string;
  sourceText?: string;
}

interface TimelineScreenProps {
  onOpenRecording: () => void;
  items?: TimelineItem[]; // 실제 부모에서 전달받을 AI 추출 아이템들
}

export default function TimelineScreen({ onOpenRecording, items = [] }: TimelineScreenProps) {
  return (
    <div style={styles.container}>
      {/* 상단 헤더 */}
      <div style={styles.header}>
        <div>
          <span style={styles.badge}>GANSEOBI_ARCHIVE</span>
          <h1 style={styles.headerTitle}>요즘 뭐 하고 살지?</h1>
        </div>
        <div style={styles.dateStamp}>08.30 SUN</div>
      </div>

      {/* 참견이의 관찰 코멘트 (데이터가 있을 때와 없을 때 분기) */}
      <div style={styles.commentBox}>
        <span style={styles.commentTag}>참견이의 관찰</span>
        <p style={styles.commentText}>
          {items.length > 0
            ? `"요즘 기록이 좀 쌓였네? 너 요즘 바쁘다?"`
            : `"아직 아무 말도 안 했어. 조용하네."`}
        </p>
      </div>

      {/* 탭 전환 */}
      <div style={styles.tabRow}>
        <button style={{ ...styles.tabBtn, background: "#E5FF5D", color: "#C71585" }}>
          기록 타임라인
        </button>
        <button style={{ ...styles.tabBtn, background: "transparent", color: "#FFF" }}>
          기억 Thread 🧵
        </button>
      </div>

      {/* 타임라인 리스트 또는 빈 상태(Empty State) */}
      <div style={styles.listContainer}>
        {items.length === 0 ? (
          <div style={styles.emptyCard}>
            <p style={styles.emptyTitle}>비어 있음</p>
            <p style={styles.emptySub}>
              아직 AI가 주워간 정보가 없어.<br />
              아래 버튼을 눌러서 오늘 있었던 일이나 계획을 툭 뱉어봐.
            </p>
          </div>
        ) : (
          items.map((item, index) => (
            <div key={item.id || index} style={styles.card}>
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
          ))
        )}
      </div>

      {/* 하단 플로팅 녹음 버튼 */}
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
  emptyCard: {
    background: "#FFF",
    color: "#1E1E1E",
    border: "2px solid #111",
    padding: "30px 20px",
    boxShadow: "4px 4px 0px #111",
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: "18px",
    fontWeight: "900",
    margin: "0 0 8px 0",
  },
  emptySub: {
    fontSize: "13px",
    color: "#666",
    margin: 0,
    lineHeight: "1.4",
    fontWeight: "bold",
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
