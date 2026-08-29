"use client";

interface ReactionScreenProps {
  onHome: () => void;
}

export default function ReactionScreen({ onHome }: ReactionScreenProps) {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.headerTag}>GANSEOBI_NOTE</div>
        <p style={styles.mainCopy}>잘 들었어.</p>
        <p style={styles.subCopy}>
          일단 접수해둠.<br />
          나중에 또 딴소리하면 그때 잡아낸다.
        </p>
        <button style={styles.ctaButton} onClick={onHome}>
          닫기 (생각나면 또 와)
        </button>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    background: "#C71585",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
    fontFamily: "monospace, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "380px",
    background: "#FFF",
    border: "3px solid #111",
    boxShadow: "6px 6px 0px #111",
    padding: "32px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "20px",
  },
  headerTag: {
    background: "#111",
    color: "#E5FF5D",
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: "bold",
    alignSelf: "flex-start",
  },
  mainCopy: {
    color: "#111",
    fontSize: "22px",
    fontWeight: "900",
    margin: 0,
  },
  subCopy: {
    color: "#555",
    fontSize: "14px",
    lineHeight: "1.5",
    margin: 0,
  },
  ctaButton: {
    width: "100%",
    background: "#C71585",
    color: "#FFF",
    border: "2px solid #111",
    boxShadow: "3px 3px 0px #111",
    padding: "14px",
    fontSize: "15px",
    fontWeight: "bold",
    cursor: "pointer",
    marginTop: "10px",
  },
};
