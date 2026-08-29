"use client";

import { useState } from "react";

export default function ConfirmScreen({
  reaction,
  commitment,
  commitmentType,
  commitmentConfidence,
  entryId,
  phone,
  onDone,
}: {
  reaction?: string;
  commitment: string;
  commitmentType: string | null;
  commitmentConfidence: string | null;
  entryId: string;
  phone: string;
  onDone: (kept: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);

  const keep = async () => {
    setLoading(true);
    try {
      await fetch("/api/voice/confirm-commitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId,
          phone,
          commitment,
          commitment_type: commitmentType,
          commitment_confidence: commitmentConfidence,
        }),
      });
    } catch (e) {
      console.error("[ConfirmScreen] confirm failed:", e);
    } finally {
      onDone(true);
    }
  };

  return (
    <div style={styles.container}>
      {reaction && <p style={styles.reaction}>{reaction}</p>}
      <p style={styles.headline}>오, 이건 기억해둘게.</p>
      <div style={styles.commitmentBox}>
        <p style={styles.commitmentText}>“{commitment}”</p>
      </div>
      <p style={styles.subhead}>이 말 맞지?</p>

      <div style={styles.buttonRow}>
        <button style={styles.secondaryButton} disabled={loading} onClick={() => onDone(false)}>
          그냥 넘겨
        </button>
        <button style={styles.primaryButton} disabled={loading} onClick={keep}>
          기억해둬
        </button>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px", textAlign: "center" },
  reaction: { color: "#999", fontSize: 15, marginBottom: 16 },
  headline: { color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 24 },
  commitmentBox: { background: "#1a1a1f", border: "1px solid #333", borderRadius: 12, padding: "16px 20px", maxWidth: 320, marginBottom: 12 },
  commitmentText: { color: "#ffc371", fontSize: 17, lineHeight: 1.5 },
  subhead: { color: "#999", fontSize: 15, marginBottom: 32 },
  buttonRow: { display: "flex", gap: 12, width: "100%", maxWidth: 320 },
  secondaryButton: { flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #333", background: "transparent", color: "#999", fontSize: 15 },
  primaryButton: { flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: "#ff5f6d", color: "#fff", fontSize: 15, fontWeight: 600 },
};
