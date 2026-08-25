"use client";

export default function MessageScreen({
  title,
  subtitle,
  onRestart,
}: {
  title: string;
  subtitle?: string;
  onRestart: () => void;
}) {
  return (
    <div style={styles.container}>
      <p style={styles.title}>{title}</p>
      {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
      <button style={styles.button} onClick={onRestart}>또 말하기</button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px", textAlign: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 8, whiteSpace: "pre-line" },
  subtitle: { color: "#999", fontSize: 14, marginBottom: 32, whiteSpace: "pre-line", lineHeight: 1.5 },
  button: { padding: "14px 32px", borderRadius: 12, border: "1px solid #333", background: "transparent", color: "#fff", fontSize: 15 },
};
