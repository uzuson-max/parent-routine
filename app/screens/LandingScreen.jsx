// frontend/screens/LandingScreen.jsx
export default function LandingScreen({ onStart }) {
  return (
    <div style={styles.container}>
      <p style={styles.copy}>
        오늘 머릿속에 있는 거,{"\n"}아무 말이나 해보세요.{"\n"}
        핑계든, 투덜거림이든 다 괜찮아요.
      </p>
      <button style={styles.micButton} onClick={onStart} aria-label="녹음 시작">
        🎤
      </button>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: "0 32px",
    textAlign: "center",
  },
  copy: {
    color: "#fff",
    fontSize: 20,
    lineHeight: 1.6,
    whiteSpace: "pre-line",
    marginBottom: 48,
  },
  micButton: {
    width: 120,
    height: 120,
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg,#ff5f6d,#ffc371)",
    fontSize: 48,
    boxShadow: "0 0 40px rgba(255,95,109,0.5)",
    cursor: "pointer",
  },
};
