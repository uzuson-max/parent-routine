"use client";

export default function HookScreen() {
  return (
    <div style={styles.container}>
      <p style={styles.copy}>방금 네 얘기를 듣고,{"\n"}할 말이 생겼어.</p>
      <div style={styles.pulse} />
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" },
  copy: { color: "#fff", fontSize: 24, fontWeight: 600, whiteSpace: "pre-line", textAlign: "center", marginBottom: 40 },
  pulse: { width: 16, height: 16, borderRadius: "50%", background: "#ff5f6d" },
};
