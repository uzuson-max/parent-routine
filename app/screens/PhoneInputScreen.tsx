// app/screens/PhoneInputScreen.tsx


"use client";

import { useState } from "react";
import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";

function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

export default function PhoneInputScreen({
  onSubmit,
  titleLines = ["번호를 남겨두면", "참견이가 필요할 때 전화할게."],
  subhead = "한 번만 물어볼게. 다음부턴 안 물어봐.",
  buttonLabel = "됐어",
}: {
  onSubmit: (phone: string) => void;
  titleLines?: string[];
  subhead?: string;
  buttonLabel?: string;
}) {
  const [phone, setPhone] = useState("");

  const submit = () => {
    const normalized = normalizePhone(phone);
    if (typeof window !== "undefined") {
      localStorage.setItem("ganseobi_phone", normalized);
    }
    onSubmit(normalized);
  };

  return (
    <div style={styles.container}>
      {titleLines.map((line, i) => (
        <p key={i} style={styles.headline}>{line}</p>
      ))}
      {subhead && <p style={styles.subhead}>{subhead}</p>}

      <input style={styles.input} type="tel" placeholder="010-0000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />

      <button style={styles.button} disabled={!phone} onClick={submit}>{buttonLabel}</button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", ...pageBackground, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px" },
  headline: { color: BRAND.ink, fontSize: 22, fontWeight: 900, textAlign: "center", margin: 0 },
  subhead: { color: inkAlpha.muted, fontSize: 14, marginTop: 8, marginBottom: 32, textAlign: "center", fontWeight: 700 },
  input: { width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 16, border: "2px solid #111", background: BRAND.card, color: BRAND.ink, fontSize: 16, boxShadow: "3px 3px 0px rgba(30,26,38,0.10)" },
  button: { marginTop: 20, width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 18, border: "3px solid #111", boxShadow: "4px 4px 0px #111", background: BRAND.lavender, color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer" },
};
