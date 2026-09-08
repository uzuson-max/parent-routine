
"use client";
import { useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";
import { IconMemory } from "@/components/icons";

export default function ConfirmScreen({
  reaction,
  commitment,
  commitmentType,
  commitmentConfidence,
  entryId,
  phone,
  onDone,
  firstRun,
}: {
  reaction?: string;
  commitment: string;
  commitmentType: string | null;
  commitmentConfidence: string | null;
  entryId: string;
  phone: string;
  onDone: (kept: boolean) => void;
  // 사용자의 첫 번째 기록에 대한 응답일 때만 true.
  firstRun?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const keep = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        console.error("[ConfirmScreen] 로그인 세션이 없습니다.");
        return;
      }
      await fetch("/api/voice/confirm-commitment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
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
      {firstRun && <span style={styles.stamp}>참견이 등장.</span>}
      {reaction && <p style={styles.reaction}>{reaction}</p>}
      <p style={styles.headline}>이건 기억해야지~</p>
      <div style={styles.commitmentBox}>
        <div style={styles.commitmentTag}>
          <IconMemory style={{ width: 16, height: 16, color: BRAND.lavenderDeep }} />
          <span>기억할 거</span>
        </div>
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
  container: { minHeight: "100vh", ...pageBackground, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px", textAlign: "center" },
  stamp: { background: BRAND.yellow, color: BRAND.ink, border: "2px solid #111", boxShadow: "3px 3px 0px #111", padding: "4px 10px", fontSize: 12, fontWeight: 900, letterSpacing: "0.5px", marginBottom: 16 },
  reaction: { color: inkAlpha.muted, fontSize: 15, marginBottom: 16, fontWeight: 700 },
  headline: { color: BRAND.ink, fontSize: 22, fontWeight: 900, marginBottom: 20 },
  commitmentBox: { background: BRAND.lavenderPale, border: `2px solid ${BRAND.lavenderDeep}`, borderRadius: 18, padding: "16px 20px", maxWidth: 320, marginBottom: 12, boxShadow: "3px 4px 0px rgba(77,63,115,0.16)" },
  commitmentTag: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, fontWeight: 900, color: BRAND.lavenderDeep, marginBottom: 8, letterSpacing: "0.3px" },
  commitmentText: { color: BRAND.ink, fontSize: 17, lineHeight: 1.5, fontWeight: 700, margin: 0 },
  subhead: { color: inkAlpha.muted, fontSize: 15, marginBottom: 32, fontWeight: 700 },
  buttonRow: { display: "flex", gap: 12, width: "100%", maxWidth: 320 },
  secondaryButton: { flex: 1, padding: "14px 0", borderRadius: 16, border: `2px solid ${inkAlpha.hairline}`, background: "transparent", color: inkAlpha.muted, fontSize: 15, fontWeight: 700, cursor: "pointer" },
  primaryButton: { flex: 1, padding: "14px 0", borderRadius: 16, border: "3px solid #111", boxShadow: "4px 4px 0px #111", background: BRAND.lavender, color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer" },
};
