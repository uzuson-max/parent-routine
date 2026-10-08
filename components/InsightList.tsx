// components/InsightList.tsx
"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { IconShare } from "@/components/icons";
import { stickerCard, INK, YELLOW } from "@/components/WorldNav";

// ============================================================================
// 참견이가 알아챈 거 (memory_insights) — 편지 탭 안에 들어가는 목록.
// 예전 MEMORY 탭(DiscoveryScreen)이 하던 일을 편지 탭 안으로 옮겼다:
// "참견이가 나한테 뭐라고 했지?"라는 같은 질문에 대한 답이라서.
// 카드 공유(서버 app/api/insight-card가 이미지를 그림)는 그대로 쓴다.
// ============================================================================

interface Insight {
  id: number;
  content: string;
  createdAt: string;
  isNew: boolean;
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear()
    ? `${d.getMonth() + 1}월 ${d.getDate()}일`
    : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function InsightList() {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/user/insights", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const body = await res.json();
        setInsights(body.success ? body.data : []);
        // 편지 탭에서 봤으니 홈 배지에서 뺀다 (app/page.tsx INSIGHTS_SEEN_KEY)
        try {
          localStorage.setItem("ganseobi_insights_seen_at", String(Date.now()));
        } catch {
          /* 저장 못 하면 배지가 한 번 더 보일 뿐 */
        }
      } catch (e) {
        console.error("[InsightList] 불러오기 실패:", e);
        setInsights([]);
      }
    })();
  }, []);

  const share = async (insight: Insight) => {
    setBusyId(insight.id);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) throw new Error("로그인 세션이 없어.");
      const res = await fetch("/api/insight-card", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ insightId: insight.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "카드를 만들지 못했어.");
      }
      const blob = await res.blob();
      const fileName = `참견이_${insight.id}.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "참견이가 알아챈 거" });
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
      setInsights((prev) => prev?.map((i) => (i.id === insight.id ? { ...i, isNew: false } : i)) ?? prev);
    } catch (e: any) {
      if (e?.name === "AbortError") return; // 공유 시트를 그냥 닫은 것
      console.error("[InsightList] 공유 실패:", e);
      setError(e.message || "카드를 만들지 못했어.");
    } finally {
      setBusyId(null);
    }
  };

  if (insights === null) return <p style={st.muted}>잠깐만.</p>;
  if (insights.length === 0) {
    return <p style={st.muted}>말이 좀 더 쌓이면, 반복되거나 이어지는 걸 알아채서 여기 남겨둘게.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && <p style={{ ...st.muted, color: "#C24444" }}>{error}</p>}
      {insights.map((i) => (
        <div key={i.id} style={{ ...stickerCard, ...st.card }}>
          {i.isNew && <span style={st.badge}>새로</span>}
          <p style={st.text}>&ldquo;{i.content}&rdquo;</p>
          <div style={st.bottom}>
            <span style={st.date}>{dateLabel(i.createdAt)}</span>
            <button className="wn-sticker" style={st.share} onClick={() => share(i)} disabled={busyId === i.id}>
              <IconShare style={{ width: 15, height: 15 }} />
              {busyId === i.id ? "만드는 중..." : "카드로 공유"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const st: { [k: string]: React.CSSProperties } = {
  muted: { fontSize: 14, color: "rgba(27,22,48,.6)", margin: "4px 2px", lineHeight: 1.5 },
  card: { position: "relative", padding: "16px 16px 12px" },
  badge: {
    position: "absolute",
    top: -12,
    right: 14,
    padding: "1px 10px",
    borderRadius: 999,
    background: YELLOW,
    border: `2.5px solid ${INK}`,
    fontSize: 12,
  },
  text: { margin: "0 0 12px", fontSize: 16, lineHeight: 1.5, wordBreak: "keep-all" },
  bottom: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  date: { fontSize: 13, color: "#4D3F73" },
  share: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minHeight: 38,
    padding: "0 12px",
    borderRadius: 14,
    border: `2.5px solid ${INK}`,
    background: YELLOW,
    boxShadow: `3px 3px 0 ${INK}`,
    fontFamily: "'Jua', sans-serif",
    fontSize: 14,
    color: INK,
    cursor: "pointer",
  },
};
