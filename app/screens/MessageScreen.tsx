
"use client";

import { BRAND, textAlpha } from "@/lib/theme";

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
      {firstRun && <span style={styles.stamp}>참견이 등장.</span>}
      <p style={styles.title}>{title}</p>
      {subtitle && <p style={styles.subtitle}>{subtitle}</p>}

      {preview && (
        <div style={styles.previewBox}>
          <p style={styles.previewLabel}>니가 한 말</p>
          <p style={styles.previewText}>“{preview}”</p>
        </div>
      )}

      <button style={styles.button} onClick={onRestart}>또 말할래</button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px", textAlign: "center" },
  stamp: { background: BRAND.yellow, color: BRAND.text, border: "2px solid #111", boxShadow: "3px 3px 0px #111", padding: "4px 10px", fontSize: 12, fontWeight: 900, letterSpacing: "0.5px", marginBottom: 16 },
  title: { color: BRAND.text, fontSize: 22, fontWeight: 700, marginBottom: 8, whiteSpace: "pre-line", lineHeight: 1.4 },
  subtitle: { color: textAlpha.muted, fontSize: 14, marginBottom: 24, whiteSpace: "pre-line", lineHeight: 1.5 },
  previewBox: { marginTop: 20, marginBottom: 32, maxWidth: 320, background: BRAND.ivory, border: "2px solid #111", boxShadow: "3px 3px 0px #111", padding: "14px 16px" },
  previewLabel: { color: BRAND.skyDeep, fontSize: 12, marginBottom: 4, fontWeight: 900 },
  previewText: { color: BRAND.text, fontSize: 14, fontStyle: "italic", lineHeight: 1.5 },
  button: { padding: "14px 32px", borderRadius: 12, border: "2px solid #111", background: "transparent", color: BRAND.text, fontSize: 15, fontWeight: 700, cursor: "pointer" },
};
