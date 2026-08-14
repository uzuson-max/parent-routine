// frontend/screens/HookScreen.jsx
// "분석 중..." 같은 뻔한 로딩 대신 호기심을 유발하는 문구만 노출
export default function HookScreen() {
  return (
    <div style={styles.container}>
      <p style={styles.copy}>방금 네 얘기를 듣고,{"\n"}할 말이 생겼어.</p>
      <div style={styles.pulse} />
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
  },
  copy: {
    color: "#fff",
    fontSize: 24,
    fontWeight: 600,
    whiteSpace: "pre-line",
    textAlign: "center",
    marginBottom: 40,
  },
  pulse: {
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "#ff5f6d",
    animation: "pulse 1.2s infinite ease-in-out",
  },
};
