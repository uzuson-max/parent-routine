
"use client";

import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";
import Mascot from "@/components/Mascot";
import { IconHome, IconRecord, IconMemory, IconMic, IconGear } from "@/components/icons";

export interface RecordEntry {
  id: string;
  createdAt: string;
  transcript: string;
  responseText: string | null;
}

interface TimelineScreenProps {
  onOpenRecording: () => void;
  onOpenCalendar: () => void;
  onOpenMyPage: () => void;
  onOpenInsights: () => void;
  entries: RecordEntry[] | null;
  nickname?: string | null;
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

// entries가 어떤 순서로 내려오든(최신순/오래된순 상관없이) 안전하게 가장 최근 항목을 고른다.
function pickLatestEntry(entries: RecordEntry[] | null): RecordEntry | null {
  if (!entries || entries.length === 0) return null;
  return entries.reduce((latest, e) =>
    new Date(e.createdAt).getTime() > new Date(latest.createdAt).getTime() ? e : latest
  );
}

export default function TimelineScreen({
  onOpenRecording,
  onOpenCalendar,
  onOpenMyPage,
  onOpenInsights,
  entries,
  nickname,
}: TimelineScreenProps) {
  // 홈의 주인공은 "니가 남긴 기록 목록"이 아니라 "참견이가 지금 하고 싶은 한마디"다.
  // 그래서 니가 방금 한 말에 참견이가 뭐라고 반응했는지(가장 최근 entry의 responseText)를
  // 그대로 끌어와서 말풍선에 띄운다 — 새로운 데이터 소스나 API 호출 없이 이미 홈에서 받고
  // 있던 entries만으로 계산한다. 아직 아무 말도 안 한 사람(또는 로딩 중)에게는 담백한
  // 기본 한마디로 대체한다.
  const latestEntry = pickLatestEntry(entries);
  const currentLine =
    latestEntry?.responseText && latestEntry.responseText.trim()
      ? truncate(latestEntry.responseText, 70)
      : nickname
      ? `${nickname}, 오늘은 무슨 얘기해볼까?`
      : "오늘은 무슨 얘기해볼까?";

  return (
    <div style={styles.container}>
      {/* TOP — 참견이가 여기서 기다리고 있다는 느낌: 마스코트 + 말풍선(= 참견이의 현재 한마디) */}
      <div style={styles.topSection}>
        <Mascot pose="말을거는" size={72} />
        <div style={styles.speechBubble}>
          <span style={styles.eyebrow}>{nickname ? `HEY, ${nickname}` : "참견이"}</span>
          <h1 style={styles.greeting}>{currentLine}</h1>
        </div>
      </div>

      {/* 화면 중앙의 여백 — 홈에 정보가 몰려있지 않게, 한마디와 버튼 사이를 비워둔다 */}
      <div style={{ flex: 1 }} />

      {/* MAIN CTA — 화면에서 가장 큰 행동, 유일한 주 버튼 */}
      <button style={styles.mainCta} onClick={onOpenRecording}>
        <span style={styles.ctaMicWrap}>
          <IconMic style={{ width: 22, height: 22, color: "#fff" }} />
        </span>
        <span style={styles.ctaText}>아무 얘기나 해도 돼</span>
        <span style={styles.ctaLabel}>TALK TO ME~</span>
      </button>

      <div style={{ height: "76px" }} />

      {/* NAVIGATION — 최근 내가 남긴 말(기록)·이전 참견(MEMORY)으로 가는 아주 작은 보조 진입점 */}
      <div style={styles.bottomNav}>
        <div style={{ ...styles.navItem, ...styles.navItemActive }}>
          <IconHome style={{ width: 20, height: 20 }} />
          <span style={styles.navText}>HOME</span>
        </div>
        <button style={styles.navItem} onClick={onOpenCalendar}>
          <IconRecord style={{ width: 20, height: 20 }} />
          <span style={styles.navText}>기록</span>
        </button>
        <button style={styles.navItem} onClick={onOpenInsights}>
          <IconMemory style={{ width: 20, height: 20 }} />
          <span style={styles.navText}>MEMORY</span>
        </button>
        <button style={styles.navItem} onClick={onOpenMyPage}>
          <IconGear style={{ width: 20, height: 20 }} />
          <span style={styles.navText}>MY</span>
        </button>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    ...pageBackground,
    color: BRAND.ink,
    padding: "24px 20px 0 20px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  topSection: { display: "flex", alignItems: "flex-end", gap: "10px" },
  speechBubble: {
    position: "relative",
    flex: 1,
    background: BRAND.card,
    border: "2.5px solid #111",
    borderRadius: "18px 18px 18px 4px",
    padding: "12px 16px",
    boxShadow: "3px 4px 0px rgba(30,26,38,0.12)",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  eyebrow: {
    fontSize: "11px",
    fontWeight: "900",
    letterSpacing: "1.5px",
    color: inkAlpha.faint,
  },
  greeting: {
    fontSize: "20px",
    fontWeight: "900",
    margin: 0,
    letterSpacing: "-0.3px",
    lineHeight: 1.3,
  },
  mainCta: {
    width: "100%",
    background: BRAND.lavender,
    color: "#fff",
    border: "3px solid #111",
    boxShadow: "4px 4px 0px #111",
    borderRadius: "18px",
    padding: "20px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    cursor: "pointer",
  },
  ctaMicWrap: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontSize: "18px", fontWeight: "900" },
  ctaLabel: { fontSize: "10px", fontWeight: "900", letterSpacing: "1.5px", opacity: 0.85 },
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    background: BRAND.card,
    borderTop: "2.5px solid #111",
    display: "flex",
    zIndex: 100,
  },
  navItem: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: inkAlpha.faint,
    padding: "10px 0 14px 0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "3px",
    cursor: "pointer",
  },
  navItemActive: { color: BRAND.lavenderDeep },
  navText: { fontSize: "10px", fontWeight: "900", letterSpacing: "0.5px" },
};
