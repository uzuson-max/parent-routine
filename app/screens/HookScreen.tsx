// app/screens/HookScreen.tsx
"use client";

import { useEffect, useState } from "react";

export default function HookScreen({
  ready,
  onContinue,
}: {
  ready: boolean;
  onContinue: () => void;
}) {
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinTimeElapsed(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const showButton = ready && minTimeElapsed;

  return (
    <div style={styles.container}>
      {!showButton ? (
        <>
          <p style={styles.copy}>잠깐만.</p>
          <p style={styles.copy}>방금 한 말 좀 생각해볼게.</p>
          <div style={styles.pulse} />
        </>
      ) : (
        <>
          <p style={styles.copy}>음... 할 말이 생겼는데.</p>
          <p style={styles.copySub}>전화할게.</p>
          <button style={styles.button} onClick={onContinue}>전화 받기</button>
        </>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px" },
  copy: { color: "#fff", fontSize: 22, fontWeight: 600, textAlign: "center", margin: 0 },
  copySub: { color: "#ff5f6d", fontSize: 18, fontWeight: 600, marginTop: 8, marginBottom: 32 },
  pulse: { width: 16, height: 16, borderRadius: "50%", background: "#ff5f6d", marginTop: 36 },
  button: { marginTop: 16, padding: "14px 32px", borderRadius: 12, border: "none", background: "#ff5f6d", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer" },
};
