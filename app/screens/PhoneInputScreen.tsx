"use client";

import { useState } from "react";

export default function PhoneInputScreen({ onSubmit }: { onSubmit: (phone: string) => void }) {
  const [phone, setPhone] = useState("");

  return (
    <div style={styles.container}>
      <p style={styles.copy}>전화해서 직접 말해줄게.{"\n"}어디로 걸어줄까?</p>
      <input style={styles.input} type="tel" placeholder="010-1234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <button style={styles.button} disabled={!phone} onClick={() => onSubmit(phone)}>전화 걸어줘</button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px" },
  copy: { color: "#fff", fontSize: 22, textAlign: "center", whiteSpace: "pre-line", marginBottom: 32 },
  input: { width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 12, border: "1px solid #333", background: "#1a1a1f", color: "#fff", fontSize: 16, marginBottom: 16 },
  button: { width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 12, border: "none", background: "#ff5f6d", color: "#fff", fontSize: 16, fontWeight: 600 },
};
