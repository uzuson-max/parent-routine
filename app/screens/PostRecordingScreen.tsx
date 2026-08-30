"use client";

interface ExtractedItem {
  type: string;
  title: string;
  desc: string;
}

interface PostRecordingScreenProps {
  extractedItems: ExtractedItem[];
  onConfirm: () => void;
}

export default function PostRecordingScreen({ extractedItems, onConfirm }: PostRecordingScreenProps) {
  return (
    <div style={styles.container}>
      <div style={styles.contentBox}>
        <span style={styles.badge}>INTERVENTION.LOG</span>
        <h2 style={styles.title}>참견이가<br />몇 가지 주워갔어. 👀</h2>
        <p style={styles.subTitle}>이건 기억해둘게.</p>

        <div style={styles.itemCardList}>
          {extractedItems.map((item, idx) => (
            <div key={idx} style={styles.itemCard}>
              <span style={styles.itemType}>{item.type}</span>
              <div style={styles.itemContent}>
                <strong>{item.title}</strong> — {item.desc}
              </div>
            </div>
          ))}
        </div>

        <button style={styles.ctaButton} onClick={onConfirm}>
          확인, 구경하러 가기 →
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
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: "24px",
    boxSizing: "border-box",
  },
  contentBox: {
    width: "100%",
    maxWidth: "380px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  badge: {
    fontSize: "10px",
    fontWeight: "900",
    background: "#E5FF5D",
    color: "#C71585",
    padding: "2px 6px",
    alignSelf: "flex-start",
  },
  title: {
    fontSize: "32px",
    fontWeight: "900",
    lineHeight: "1.2",
    margin: 0,
    textShadow: "2px 2px 0px #111",
  },
  subTitle: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.8)",
    margin: "-8px 0 10px 0",
    fontWeight: "bold",
  },
  itemCardList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  itemCard: {
    background: "#FFF",
    color: "#1E1E1E",
    border: "2px solid #111",
    padding: "14px",
    boxShadow: "3px 3px 0px #111",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  itemType: {
    fontSize: "10px",
    fontWeight: "900",
    color: "#C71585",
  },
  itemContent: {
    fontSize: "14px",
    fontWeight: "bold",
  },
  ctaButton: {
    width: "100%",
    background: "#E5FF5D",
    color: "#C71585",
    border: "3px solid #111",
    boxShadow: "4px 4px 0px #111",
    padding: "16px",
    fontSize: "16px",
    fontWeight: "900",
    cursor: "pointer",
    marginTop: "10px",
  },
};
