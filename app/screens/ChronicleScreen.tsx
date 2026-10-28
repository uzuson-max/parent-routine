"use client";

// ============================================================================
// 두 번째 탭 — 지난 이야기 (2026-10-28)
// 참견이가 해설한 문장들을 날짜(장)별로 모아 읽는 곳. 녹음 하나하나를 다시 듣는 화면이 아니다.
// 해설이 크게, 주인공이 실제로 한 말은 작게 아래에.
// ============================================================================
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { HeroTabs } from "./HeroScreen";

interface Entry {
  id: string;
  createdAt: string;
  transcript: string;
  responseText: string | null;
}

const DAY = 86400000;
const kstDay = (iso: string) => Math.floor((new Date(iso).getTime() + 9 * 3600000) / DAY);

function dayLabel(iso: string): string {
  const k = new Date(new Date(iso).getTime() + 9 * 3600000);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 (${days[k.getUTCDay()]})`;
}

export default function ChronicleScreen({ onHero }: { onHero: () => void }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        if (!session) return setEntries([]);
        const res = await fetch("/api/user/entries", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const body = await res.json();
        setEntries(body.success ? (body.data as Entry[]).filter((e) => e.responseText) : []);
      } catch {
        setEntries([]);
      }
    })();
  }, []);

  // 장 번호는 첫 기록한 날 = 제1장
  const firstDay = entries && entries.length ? kstDay(entries[entries.length - 1].createdAt) : 0;
  const groups: { day: number; label: string; items: Entry[] }[] = [];
  for (const e of entries ?? []) {
    const d = kstDay(e.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === d) last.items.push(e);
    else groups.push({ day: d, label: dayLabel(e.createdAt), items: [e] });
  }

  return (
    <div style={S.page}>
      <style dangerouslySetInnerHTML={{ __html: ".narr, .narr * { font-family: 'Nanum Myeongjo', serif !important; }" }} />
      <header style={S.header}>
        <h1 className="narr" style={S.title}>지난 이야기</h1>
        <p style={S.sub}>참견이가 적어둔 주인공의 날들</p>
      </header>

      {entries === null && <p style={S.empty}>참견이가 두루마리를 펼치는 중…</p>}
      {entries && entries.length === 0 && <p style={S.empty}>아직 아무 이야기도 없다. 주인공의 첫 장면을 기다리는 중이다.</p>}

      {groups.map((g) => (
        <section key={g.day} style={S.section}>
          <div style={S.chapterRow}>
            <span className="narr" style={S.chapter}>제{g.day - firstDay + 1}장</span>
            <span style={S.date}>{g.label}</span>
          </div>
          {g.items
            .slice()
            .reverse()
            .map((e) => (
              <article key={e.id} style={S.card}>
                <p className="narr" style={S.narration}>{e.responseText}</p>
                <p style={S.quote}>주인공: “{e.transcript}”</p>
              </article>
            ))}
        </section>
      ))}

      <HeroTabs active="chronicle" onHero={onHero} onChronicle={() => {}} />
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    boxSizing: "border-box",
    background: "linear-gradient(180deg, #13321F 0%, #1D4A2F 100%)",
    color: "#F7F0DF",
    fontFamily: "Jua, sans-serif",
    padding: "20px 16px calc(80px + env(safe-area-inset-bottom, 0px))",
  },
  header: { marginBottom: 18 },
  title: { margin: 0, fontSize: 26, fontWeight: 800 },
  sub: { margin: "4px 0 0", fontSize: 14, color: "rgba(247,240,223,0.55)" },
  empty: { fontSize: 16, color: "rgba(247,240,223,0.72)", lineHeight: 1.5, marginTop: 40, textAlign: "center", wordBreak: "keep-all" },
  section: { marginBottom: 22 },
  chapterRow: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 },
  chapter: { fontSize: 17, fontWeight: 800, color: "#FFD26F" },
  date: { fontSize: 13, color: "rgba(247,240,223,0.5)" },
  card: { background: "rgba(20,16,25,0.55)", border: "1px solid rgba(247,240,223,0.14)", borderRadius: 12, padding: "12px 14px", marginBottom: 8 },
  narration: { margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.55, wordBreak: "keep-all" },
  quote: { margin: "6px 0 0", fontSize: 13, lineHeight: 1.4, color: "rgba(247,240,223,0.55)", wordBreak: "keep-all" },
};
