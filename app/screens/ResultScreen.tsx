
"use client";
import { BRAND, inkAlpha, pageBackground, tactile, typography, TACTILE_PRESS_CLASS } from "@/lib/theme";
import { IconMemory } from "@/components/icons";
export default function ResultScreen({
  result,
  onTalkMore,
  onHome,
}: {
  result: any;
  onTalkMore: () => void;
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
        <button className={TACTILE_PRESS_CLASS} style={styles.talkMoreButton} onClick={onTalkMore}>＋ 더 이야기하기</button>
        <button className={TACTILE_PRESS_CLASS} style={styles.homeButton} onClick={onHome}>홈으로</button>
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
  container: { ...pageBackground, minHeight: "100dvh", color: BRAND.ink, padding: "28px 20px 0", paddingTop: "max(28px, calc(env(safe-area-inset-top, 0px) + 16px))", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" },
  eyebrow: { color: inkAlpha.faint, fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", marginBottom: 4 },
  card: { ...tactile.card, padding: 16 },
  cardHighlight: tactile.cardAccent,
  cardLabel: { color: BRAND.ink, fontSize: 12, marginBottom: 6, fontWeight: 700, opacity: 0.6 },
  cardLabelHighlight: { color: BRAND.lavenderDeep, opacity: 1 },
  cardValue: { color: BRAND.ink, fontSize: 15, lineHeight: 1.5, margin: 0, fontWeight: 500 },
  savedNote: { color: inkAlpha.faint, fontSize: 12, marginTop: 4, marginBottom: 0, fontWeight: 500 },
  // 응답 화면과 같은 위계: ＋ 더 이야기하기(primary) → 홈으로(secondary). 카드가 길어져도
  // 스크롤 중 항상 하단에 붙어 있게 sticky로 둔다.
  actions: { position: "sticky", bottom: 0, marginTop: "auto", paddingTop: 12, paddingBottom: "max(8px, env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "linear-gradient(180deg, rgba(251,245,232,0) 0%, #FBF5E8 28%)" },
  talkMoreButton: { width: "100%", padding: 16, ...tactile.primaryButton, ...typography.ctaLabel },
  homeButton: { ...tactile.ghostButton, padding: "12px 20px", fontSize: 14, fontWeight: 600, minHeight: 44 },
};
