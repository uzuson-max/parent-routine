"use client";

export default function ResultScreen({ result, onRestart }: { result: any; onRestart: () => void }) {
  if (!result) return null;

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>오늘의 참견 리포트</h2>

      <Card label="내가 한 말" value={result.transcript} />
      <Card label="AI가 발견한 핑계·모순" value={(result.contradictions || []).join(" / ") || "-"} />
      <Card label="오늘의 참견" value={result.ai_callout} highlight />

      {result.show_pro_banner && (
        <div style={styles.proBanner}>
          <p style={styles.proText}>내가 널 계속 기억하게 할까?</p>
          <p style={styles.proSub}>Pro로 가면 패턴을 계속 기억하고 더 세게 참견해줄게 — $7.99/mo</p>
          <button style={styles.proButton}>Pro 시작하기</button>
        </div>
      )}

      <button style={styles.restartButton} onClick={onRestart}>오늘도 한마디 하기</button>
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
  proBanner: { background: "#1a1a1f", border: "1px solid #ffc371", borderRadius: 12, padding: 16, marginTop: 12 },
  proText: { color: "#ffc371", fontWeight: 700, marginBottom: 4 },
  proSub: { color: "#ccc", fontSize: 13, marginBottom: 12 },
  proButton: { width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#ffc371", fontWeight: 700 },
  restartButton: { marginTop: 16, padding: 14, borderRadius: 12, border: "1px solid #333", background: "transparent", color: "#fff" },
};
