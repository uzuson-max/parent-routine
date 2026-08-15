"use client";

import { useEffect, useState } from "react";

export default function HookScreen() {
  const [stage, setStage] = useState<0 | 1>(0);

  useEffect(() => {
    const t = setTimeout(() => setStage(1), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={styles.container}>
      {stage === 0 ? (
        <>
          <p style={styles.copy}>잠깐만.</p>
          <p style={styles.copy}>방금 한 말 좀 생각해볼게.</p>
        </>
      ) : (
        <p style={styles.copy}>음... 할 말이 생겼는데.</p>
      )}
      <div style={styles.pulse} />
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" },
  copy: { color: "#fff", fontSize: 22, fontWeight: 600, textAlign: "center", marginBottom: 4 },
  pulse: { width: 16, height: 16, borderRadius: "50%", background: "#ff5f6d", marginTop: 36 },
};
