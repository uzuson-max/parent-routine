"use client";

import { useState } from "react";

export default function PhoneInputScreen({ onSubmit }: { onSubmit: (phone: string) => void }) {
  const [phone, setPhone] = useState("");

  return (
    <div style={styles.container}>
      <p style={styles.headline}>방금 한 얘기를 가지고</p>
      <p style={styles.headline}>전화할게요.</p>
      <p style={styles.subhead}>전화번호를 알려주세요.</p>

      <input style={styles.input} type="tel" placeholder="010-0000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <p style={styles.privacy}>🔒 전화 연결을 위해서만 사용하며, 공개되지 않습니다.</p>

      <button style={styles.button} disabled={!phone} onClick={() => onSubmit(phone)}>전화 받기</button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px" },
  headline: { color: "#fff", fontSize: 22, fontWeight: 700, textAlign: "center", margin: 0 },
  subhead: { color: "#999", fontSize: 15, marginTop: 8, marginBottom: 32 },
  input: { width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 12, border: "1px solid #333", background: "#1a1a1f", color: "#fff", fontSize: 16 },
  privacy: { color: "#666", fontSize: 12, marginTop: 10, marginBottom: 24 },
  button: { width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 12, border: "none", background: "#ff5f6d", color: "#fff", fontSize: 16, fontWeight: 600 },
};
