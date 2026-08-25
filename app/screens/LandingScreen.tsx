// app/screens/LandingScreen.tsx
"use client";

export default function LandingScreen({ onStart }: { onStart: () => void }) {
  return (
    <div style={styles.container}>
      <p style={styles.copy}>
        지금 생각나는 대로 말해보세요.{"\n"}
        잘 말하려고 하지 않아도 됩니다.{"\n\n"}
        정리하지 않아도 되고,{"\n"}횡설수설해도 괜찮아요.
      </p>
      <button style={styles.micButton} onClick={onStart} aria-label="말해볼게">🎙️</button>
      <p style={styles.buttonLabel}>말해볼게</p>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px", textAlign: "center" },
  copy: { color: "#fff", fontSize: 20, lineHeight: 1.6, whiteSpace: "pre-line", marginBottom: 48 },
  micButton: { width: 120, height: 120, borderRadius: "50%", border: "none", background: "linear-gradient(135deg,#ff5f6d,#ffc371)", fontSize: 48, boxShadow: "0 0 40px rgba(255,95,109,0.5)", cursor: "pointer" },
  buttonLabel: { color: "#ccc", fontSize: 14, marginTop: 16 },
};
