
"use client";

import { useState } from "react";

export default function PhoneInputScreen({ onSubmit }: { onSubmit: (phone: string) => void }) {
  const [phone, setPhone] = useState("");

  const submit = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ganseobi_phone", phone);
    }
    onSubmit(phone);
  };

  return (
    <div style={styles.container}>
      <p style={styles.headline}>번호를 남겨두면</p>
      <p style={styles.headline}>참견이가 필요할 때 전화할게.</p>
      <p style={styles.subhead}>한 번만 물어볼게, 다음부턴 안 물어봐.</p>

      <input style={styles.input} type="tel" placeholder="010-0000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />

      <button style={styles.button} disabled={!phone} onClick={submit}>됐어</button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px" },
  headline: { color: "#fff", fontSize: 22, fontWeight: 700, textAlign: "center", margin: 0 },
  subhead: { color: "#999", fontSize: 14, marginTop: 8, marginBottom: 32, textAlign: "center" },
  input: { width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 12, border: "1px solid #333", background: "#1a1a1f", color: "#fff", fontSize: 16 },
  button: { marginTop: 20, width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 12, border: "none", background: "#ff5f6d", color: "#fff", fontSize: 16, fontWeight: 600 },
};
