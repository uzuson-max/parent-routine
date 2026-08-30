"use client";

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
}: {
  title: string;
  subtitle?: string;
  transcriptPreview?: string;
  onRestart: () => void;
}) {
  const preview = truncate(transcriptPreview, 42);

  return (
    <div style={styles.container}>
      <p style={styles.title}>{title}</p>
      {subtitle && <p style={styles.subtitle}>{subtitle}</p>}

      {preview && (
        <div style={styles.previewBox}>
          <p style={styles.previewLabel}>내가 한 말</p>
          <p style={styles.previewText}>“{preview}”</p>
        </div>
      )}

      <button style={styles.button} onClick={onRestart}>또 말할래</button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px", textAlign: "center" },
  title: { color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 8, whiteSpace: "pre-line", lineHeight: 1.4 },
  subtitle: { color: "#999", fontSize: 14, marginBottom: 24, whiteSpace: "pre-line", lineHeight: 1.5 },
  previewBox: { marginTop: 20, marginBottom: 32, maxWidth: 320 },
  previewLabel: { color: "#666", fontSize: 12, marginBottom: 4 },
  previewText: { color: "#aaa", fontSize: 14, fontStyle: "italic", lineHeight: 1.5 },
  button: { padding: "14px 32px", borderRadius: 12, border: "1px solid #333", background: "transparent", color: "#fff", fontSize: 15 },
};
