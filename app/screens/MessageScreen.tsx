
"use client";

import { BRAND, inkAlpha, pageBackground, tactile, typography, TACTILE_PRESS_CLASS } from "@/lib/theme";
import Mascot from "@/components/Mascot";

function truncate(text: string | undefined, max: number): string | null {
  if (!text) return null;
  const clean = text.trim();
  if (!clean || clean === "(음성 변환 실패)") return null;
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

export default function MessageScreen({
  title,
  subtitle,
  transcriptPreview,
  onRestart,
  firstRun,
}: {
  title: string;
  subtitle?: string;
  transcriptPreview?: string;
  onRestart: () => void;
  // 사용자의 첫 번째 기록에 대한 응답일 때만 true — "참견이와 첫 대화를 했다"는 느낌을 살짝 더 강조한다.
  firstRun?: boolean;
}) {
  const preview = truncate(transcriptPreview, 42);

  return (
    <div style={styles.container}>
      <Mascot pose="기본" size={80} />
      {firstRun && <span style={styles.stamp}>참견이 등장.</span>}
      <p style={styles.title}>{title}</p>
      {subtitle && <p style={styles.subtitle}>{subtitle}</p>}

      {preview && (
        <div style={styles.previewBox}>
          <p style={styles.previewLabel}>니가 한 말</p>
          <p style={styles.previewText}>“{preview}”</p>
        </div>
      )}

      <button className={TACTILE_PRESS_CLASS} style={styles.button} onClick={onRestart}>또 말할래</button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", ...pageBackground, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px", textAlign: "center" },
  stamp: { ...tactile.stamp, padding: "4px 10px", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px", marginTop: 14, marginBottom: 2 },
  title: { color: BRAND.ink, fontSize: 22, fontWeight: 800, margin: "18px 0 8px 0", whiteSpace: "pre-line", lineHeight: 1.4 },
  subtitle: { color: inkAlpha.muted, fontSize: 14, marginBottom: 24, whiteSpace: "pre-line", lineHeight: 1.5, fontWeight: 500 },
  previewBox: { marginTop: 20, marginBottom: 32, maxWidth: 320, ...tactile.cardAccent, padding: "14px 16px" },
  previewLabel: { color: BRAND.lavenderDeep, fontSize: 12, marginBottom: 4, fontWeight: 700 },
  previewText: { color: BRAND.ink, fontSize: 14, fontStyle: "italic", lineHeight: 1.5 },
  button: { padding: "14px 32px", ...tactile.primaryButton, ...typography.ctaLabel, fontSize: 15 },
};
