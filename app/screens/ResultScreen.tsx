
"use client";
export default function ResultScreen({
  result,
  onRestart,
  onHome,
}: {
  result: any;
  onRestart: () => void;
  onHome: () => void;
}) {
  if (!result) return null;
  const responseText: string = result.response?.response || result.call_message || "";
  const memoryRef: string | null = result.response?.memory_reference || null;
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>방금 통화</h2>
      <Card label="내가 한 말" value={result.transcript} />
      {memoryRef && <Card label="참견이가 떠올린 기억" value={memoryRef} />}
      <Card label="참견이가 한 말" value={responseText} highlight />
      <p style={styles.savedNote}>오늘 기록해뒀어.</p>
      <div style={styles.actions}>
        <button style={styles.restartButton} onClick={onRestart}>또 말할래</button>
        <button style={styles.homeButton} onClick={onHome}>홈으로</button>
      </div>
    </div>
  );
}
function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ ...styles.card, ...(highlight ? styles.cardHighlight : {}) }}>
      <p style={styles.cardLabel}>{label}</p>
      <p style={styles.cardValue}>{value}</p>
    </div>
  );
}
const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", padding: 24, display: "flex", flexDirection: "column", gap: 12 },
  title: { color: "#fff", fontSize: 20, marginBottom: 8 },
  card: { background: "#1a1a1f", borderRadius: 12, padding: 16 },
  cardHighlight: { background: "#2a1418", border: "1px solid #ff5f6d" },
  cardLabel: { color: "#999", fontSize: 12, marginBottom: 6 },
  cardValue: { color: "#fff", fontSize: 15, lineHeight: 1.5 },
  savedNote: { color: "#777", fontSize: 12, marginTop: 4, marginBottom: 0 },
  actions: { display: "flex", gap: 10, marginTop: 8 },
  restartButton: { flex: 1, padding: 14, borderRadius: 12, border: "1px solid #333", background: "transparent", color: "#fff" },
  homeButton: { flex: 1, padding: 14, borderRadius: 12, border: "1px solid #333", background: "#E5FF5D", color: "#111", fontWeight: 700 },
};
