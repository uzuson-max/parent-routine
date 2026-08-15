"use client";

import { useState } from "react";

export default function PhoneInputScreen({
  onSubmit,
}: {
  onSubmit: (phone: string, minutesDelay: number) => void;
}) {
  const [phone, setPhone] = useState("");
  const [minutesDelay, setMinutesDelay] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    onSubmit(phone, minutesDelay);
  };

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <h2 style={styles.title}>전화 받을 번호를 입력해주세요</h2>
        <input
          type="tel"
          placeholder="01012345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={styles.input}
          required
        />
        <div style={styles.delayContainer}>
          <label style={styles.label}>지연 시간 (분):</label>
          <input
            type="number"
            min="0"
            value={minutesDelay}
            onChange={(e) => setMinutesDelay(Number(e.target.value))}
            style={styles.numberInput}
          />
        </div>
        <button type="submit" style={styles.button}>
          전화 신청하기
        </button>
      </form>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", backgroundColor: "#111" },
  form: { display: "flex", flexDirection: "column", width: "100%", maxWidth: "360px", padding: "24px" },
  title: { color: "#fff", fontSize: 18, marginBottom: "20px", textAlign: "center" },
  input: { padding: "12px", fontSize: 16, borderRadius: "8px", border: "1px solid #333", marginBottom: "16px", backgroundColor: "#222", color: "#fff" },
  delayContainer: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" },
  label: { color: "#ccc", fontSize: 14 },
  numberInput: { width: "60px", padding: "8px", fontSize: 16, borderRadius: "6px", border: "1px solid #333", backgroundColor: "#222", color: "#fff", textAlign: "center" },
  button: { padding: "14px", fontSize: 16, fontWeight: "bold", backgroundColor: "#0070f3", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" },
};
