
//
// 참견이가 memory_insights에 쌓아둔 "발견"(반복 발견/연결 발견)을 훑어보고, 그중 하나를
// 카드 이미지로 만들어 공유/저장할 수 있게 해주는 화면. 새 알림함이 아니라 "참견이가 나에 대해
// 뭘 알아챘는지" 훑어보는 아카이브라, 이미 문자로 나간 것과 아직 안 나간 것 구분 없이 다 보여준다.
// 카드 생성은 서버(app/api/insight-card)가 이미지를 직접 그려서 내려주고, 여기서는 그걸 받아
// Web Share API 또는 다운로드로 넘겨주는 역할만 한다 — 새 테이블/새 LLM 호출 없음.
"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";
import Mascot from "@/components/Mascot";
import { IconShare } from "@/components/icons";

interface Insight {
  id: number;
  content: string;
  confidence: number;
  createdAt: string;
  isNew: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function DiscoveryScreen({ onBack }: { onBack: () => void }) {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/user/insights", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const body = await res.json();
        if (body.success) setInsights(body.data);
      } catch (e) {
        console.error("[DiscoveryScreen] fetch insights failed:", e);
        setInsights([]);
      }
    })();
  }, []);

  const shareInsight = async (insight: Insight) => {
    setBusyId(insight.id);
    setError(null);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) throw new Error("로그인 세션이 없어.");

      const res = await fetch("/api/insight-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ insightId: insight.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "카드를 만들지 못했어.");
      }

      const blob = await res.blob();
      const fileName = `참견이_발견_${insight.id}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "참견이가 발견한 거" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      // 방금 카드로 꺼낸 건 새 발견 뱃지를 뗀다 (서버에서도 last_surfaced_at이 이미 갱신됨).
      setInsights((prev) => prev?.map((i) => (i.id === insight.id ? { ...i, isNew: false } : i)) ?? prev);
    } catch (e: any) {
      // 사용자가 공유 시트를 그냥 닫은 것도 AbortError로 들어오는데, 이건 실패가 아니라서 무시.
      if (e?.name === "AbortError") return;
      console.error("[DiscoveryScreen] share failed:", e);
      setError(e.message || "카드를 만들지 못했어.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={styles.container}>
      <button style={styles.backButton} onClick={onBack}>← 뒤로</button>

      <div style={styles.topSection}>
        <Mascot pose="기억남" size={64} />
        <div>
          <span style={styles.eyebrow}>DISCOVERY</span>
          <h1 style={styles.headline}>참견이가 발견한 거</h1>
        </div>
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      <div style={styles.listContainer}>
        {insights === null ? (
          <div style={styles.emptyCard}>
            <p style={styles.emptyTitle}>불러오는 중...</p>
          </div>
        ) : insights.length === 0 ? (
          <div style={styles.emptyCard}>
            <p style={styles.emptyTitle}>아직 발견한 게 없어.</p>
            <p style={styles.emptySub}>말이 좀 더 쌓이면, 반복되거나 연결되는 걸 알아채서 여기 보여줄게.</p>
          </div>
        ) : (
          insights.map((insight) => (
            <div key={insight.id} style={styles.card}>
              {insight.isNew && <span style={styles.newBadge}>새로 발견</span>}
              <p style={styles.contentText}>&ldquo;{insight.content}&rdquo;</p>
              <div style={styles.cardBottomRow}>
                <span style={styles.dateText}>{formatDate(insight.createdAt)}</span>
                <button
                  style={styles.shareButton}
                  onClick={() => shareInsight(insight)}
                  disabled={busyId === insight.id}
                >
                  <IconShare style={{ width: 15, height: 15 }} />
                  {busyId === insight.id ? "만드는 중..." : "카드로 공유"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", ...pageBackground, padding: "24px 20px 40px 20px", boxSizing: "border-box" },
  backButton: { background: "transparent", border: "none", color: inkAlpha.muted, fontSize: 14, fontWeight: 900, cursor: "pointer", padding: 0, marginBottom: 16 },
  topSection: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 },
  eyebrow: { display: "block", fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: inkAlpha.faint },
  headline: { color: BRAND.ink, fontSize: 20, fontWeight: 900, margin: "2px 0 0 0" },
  errorText: { color: "#D14343", fontSize: 12, fontWeight: 700, marginBottom: 12 },
  listContainer: { display: "flex", flexDirection: "column", gap: 12 },
  emptyCard: {
    background: BRAND.card,
    color: BRAND.ink,
    border: "2px solid #111",
    borderRadius: 16,
    padding: "30px 20px",
    boxShadow: "3px 4px 0px rgba(30,26,38,0.10)",
    textAlign: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: 900, margin: "0 0 8px 0" },
  emptySub: { fontSize: 13, color: inkAlpha.muted, margin: 0, lineHeight: 1.5, fontWeight: 700 },
  card: {
    position: "relative",
    background: BRAND.lavenderPale,
    border: `2px solid ${BRAND.lavenderDeep}`,
    borderRadius: 16,
    padding: "18px 16px 14px 16px",
    boxShadow: "3px 4px 0px rgba(77,63,115,0.16)",
  },
  newBadge: {
    position: "absolute",
    top: -10,
    right: 14,
    background: BRAND.yellow,
    color: BRAND.ink,
    border: "2px solid #111",
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 0.3,
  },
  contentText: { fontSize: 15, fontWeight: 900, color: BRAND.ink, margin: "0 0 14px 0", lineHeight: 1.5 },
  cardBottomRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  dateText: { fontSize: 11, fontWeight: 900, color: BRAND.lavenderDeep },
  shareButton: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: BRAND.lavender,
    color: "#fff",
    border: "2px solid #111",
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
};
