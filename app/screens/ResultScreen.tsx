
"use client";
import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";
import { IconMemory } from "@/components/icons";
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
      <span style={styles.eyebrow}>방금 통화</span>
      <Card label="니가 한 말" value={result.transcript} />
      {memoryRef && <Card label="참견이가 떠올린 기억" value={memoryRef} icon />}
      <Card label="참견이가 한 말" value={responseText} highlight />
      <p style={styles.savedNote}>오늘 기록해뒀어.</p>
      <div style={styles.actions}>
        <button style={styles.restartButton} onClick={onRestart}>또 말할래</button>
        <button style={styles.homeButton} onClick={onHome}>홈으로</button>
      </div>
    </div>
  );
}
function Card({ label, value, highlight, icon }: { label: string; value: string; highlight?: boolean; icon?: boolean }) {
  return (
    <div style={{ ...styles.card, ...(highlight ? styles.cardHighlight : {}) }}>
      <p style={{ ...styles.cardLabel, ...(highlight ? styles.cardLabelHighlight : {}) }}>
        {icon && <IconMemory style={{ width: 13, height: 13, marginRight: 4, verticalAlign: "-2px" }} />}
        {label}
      </p>
      <p style={styles.cardValue}>{value}</p>
    </div>
  );
}
const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", ...pageBackground, color: BRAND.ink, padding: "28px 20px", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" },
  eyebrow: { color: inkAlpha.faint, fontSize: 11, fontWeight: 900, letterSpacing: "1.5px", marginBottom: 4 },
  card: { background: BRAND.card, border: "2px solid #111", boxShadow: "3px 4px 0px rgba(30,26,38,0.10)", borderRadius: 16, padding: 16 },
  cardHighlight: { background: BRAND.lavenderPale, border: `2px solid ${BRAND.lavenderDeep}`, boxShadow: "3px 4px 0px rgba(77,63,115,0.16)" },
  cardLabel: { color: BRAND.ink, fontSize: 12, marginBottom: 6, fontWeight: 900, opacity: 0.6 },
  cardLabelHighlight: { color: BRAND.lavenderDeep, opacity: 1 },
  cardValue: { color: BRAND.ink, fontSize: 15, lineHeight: 1.5, margin: 0, fontWeight: 700 },
  savedNote: { color: inkAlpha.faint, fontSize: 12, marginTop: 4, marginBottom: 0, fontWeight: 700 },
  actions: { display: "flex", gap: 10, marginTop: 8 },
  restartButton: { flex: 1, padding: 14, borderRadius: 16, border: `2px solid ${inkAlpha.hairline}`, background: "transparent", color: BRAND.ink, fontWeight: 700, cursor: "pointer" },
  homeButton: { flex: 1, padding: 14, borderRadius: 16, border: "3px solid #111", boxShadow: "4px 4px 0px #111", background: BRAND.lavender, color: "#fff", fontWeight: 900, cursor: "pointer" },
};
