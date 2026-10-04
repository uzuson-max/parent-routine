"use client";

import { BRAND, TACTILE_PRESS_CLASS, inkAlpha, border } from "@/lib/theme";
import FishTank from "@/components/FishTank";
import { IconHome, IconRecord, IconMemory, IconGear, IconLetter } from "@/components/icons";

export interface RecordEntry {
  id: string;
  createdAt: string;
  transcript: string;
  responseText: string | null;
}

// 아직 아무 데도(문자/대화) 안 꺼낸 진짜 proactive callback 한 건. 없으면 null.
// 로딩이 끝났는지 여부는 이 값 자체가 아니라 page.tsx가 undefined로 구분해서 넘겨준다.
export interface ProactiveLine {
  id: number;
  content: string;
}

interface TimelineScreenProps {
  onOpenRecording: (topic?: string) => void;
  onOpenCalendar: () => void;
  onOpenMyPage: () => void;
  onOpenInsights: () => void;
  // 참견이의 편지 진입점. 넘기지 않으면 아이콘 자체를 그리지 않는다(기존 사용처 호환).
  onOpenLetters?: () => void;
  // 실제 DB의 안 읽은 편지 개수. 0이거나 없으면 badge를 그리지 않는다.
  unreadLetterCount?: number;
  entries: RecordEntry[] | null;
  proactiveLine?: ProactiveLine | null;
  nickname?: string | null;
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

// ============================================================================
// Home C안 — 금붕어 어항.
// 홈의 주인공은 어항이다. 이번 달에 남긴 생각이 치어/금붕어로 살고 있고, 마이크 하나만 있다.
// 설명 문구("오늘의 생각 말하기" 등)는 넣지 않는다.
// 참견이가 먼저 꺼낼 말(proactiveLine)이 있을 때만 어항 위에 말풍선 카드가 뜨고,
// 그때 마이크/카드를 누르면 기존처럼 그 문장을 주제로 들고 녹음 화면으로 간다.
// 녹음 → 분석 → 응답 흐름(page.tsx / RecordingScreen)은 전혀 건드리지 않는다.
// ============================================================================
export default function TimelineScreen({
  onOpenRecording,
  onOpenCalendar,
  onOpenMyPage,
  onOpenInsights,
  onOpenLetters,
  unreadLetterCount = 0,
  entries,
  proactiveLine,
}: TimelineScreenProps) {
  const hasCallback = !!(proactiveLine && proactiveLine.content);

  const handleMic = () => {
    if (hasCallback && proactiveLine) {
      onOpenRecording(proactiveLine.content);
    } else {
      onOpenRecording();
    }
  };

  return (
    <div style={styles.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Jua&display=swap');
        @keyframes tlMicBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); } }
        @keyframes tlCardIn {
          0% { opacity: 0; transform: translateY(8px) scale(0.94) rotate(-1deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) rotate(-1deg); }
        }
        .tl-mic { animation: tlMicBreathe 2.8s ease-in-out infinite; transition: box-shadow .12s, transform .12s; }
        .tl-mic:active { animation: none; transform: translate(4px,4px); box-shadow: 1px 1px 0 #1B1630 !important; }
        .tl-mic:focus-visible, .tl-sticker:focus-visible { outline: 3px dashed #1B1630; outline-offset: 5px; }
        .tl-sticker:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 #1B1630 !important; }
        .tl-callback { animation: tlCardIn .35s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .tl-mic, .tl-callback { animation: none; } }
      `}</style>

      {/* HEADER — 로고 + 편지 아이콘만 */}
      <div style={styles.header}>
        <span style={styles.logo}>참견이</span>
        {onOpenLetters && (
          <button
            className="tl-sticker"
            style={styles.letterButton}
            onClick={onOpenLetters}
            aria-label={unreadLetterCount > 0 ? `참견이의 편지, 안 읽은 편지 ${unreadLetterCount}통` : "참견이의 편지"}
          >
            <IconLetter style={{ width: 24, height: 24 }} />
            {unreadLetterCount > 0 && (
              <span style={styles.letterBadge} aria-hidden>
                {unreadLetterCount > 9 ? "9+" : unreadLetterCount}
              </span>
            )}
          </button>
        )}
      </div>

      <div style={styles.core}>
        {/* 참견이가 먼저 꺼낼 말이 있을 때만 — 어항 위에 붙는 말풍선 카드 */}
        <div style={styles.callbackSlot}>
          {hasCallback && proactiveLine && (
            <button className="tl-callback tl-sticker" style={styles.callbackCard} onClick={handleMic}>
              <span style={styles.callbackStamp}>참견이 등장.</span>
              <span style={styles.callbackText}>{truncate(proactiveLine.content, 90)}</span>
            </button>
          )}
        </div>

        <FishTank entries={entries} onTankPress={handleMic} />

        <button
          className="tl-mic"
          style={styles.mic}
          onClick={handleMic}
          aria-label={hasCallback ? "대답하기" : "생각 말하기"}
        >
          <svg width="38" height="38" viewBox="0 0 24 24" aria-hidden>
            <rect x="8.5" y="3" width="7" height="12" rx="3.5" fill="#FFFFFF" stroke="#1B1630" strokeWidth={2.2} />
            <path d="M5.5 11.5 C5.5 15.5 8.5 18 12 18 C15.5 18 18.5 15.5 18.5 11.5" fill="none" stroke="#1B1630" strokeWidth={2.2} strokeLinecap="round" />
            <path d="M12 18 V21.5" fill="none" stroke="#1B1630" strokeWidth={2.2} strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* NAVIGATION — 기존 그대로 */}
      <div style={styles.bottomNav}>
        <div style={{ ...styles.navItem, ...styles.navItemActive }}>
          <IconHome style={{ width: 20, height: 20 }} />
          <span style={styles.navText}>HOME</span>
        </div>
        <button className={TACTILE_PRESS_CLASS} style={styles.navItem} onClick={onOpenCalendar}>
          <IconRecord style={{ width: 20, height: 20 }} />
          <span style={styles.navText}>기록</span>
        </button>
        <button className={TACTILE_PRESS_CLASS} style={styles.navItem} onClick={onOpenInsights}>
          <IconMemory style={{ width: 20, height: 20 }} />
          <span style={styles.navText}>MEMORY</span>
        </button>
        <button className={TACTILE_PRESS_CLASS} style={styles.navItem} onClick={onOpenMyPage}>
          <IconGear style={{ width: 20, height: 20 }} />
          <span style={styles.navText}>MY</span>
        </button>
      </div>
    </div>
  );
}

const INK = "#1B1630";

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100dvh",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    maxWidth: "480px",
    marginLeft: "auto",
    marginRight: "auto",
    overflowX: "hidden",
    fontFamily: "'Jua', sans-serif",
    color: INK,
    backgroundColor: "#FFE9A8",
    backgroundImage: "radial-gradient(#FFDA78 17%, transparent 18%)",
    backgroundSize: "34px 34px",
    paddingTop: "max(20px, calc(env(safe-area-inset-top, 0px) + 12px))",
    paddingLeft: "20px",
    paddingRight: "20px",
    paddingBottom: "calc(78px + env(safe-area-inset-bottom, 0px))",
  },
  header: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "48px",
  },
  logo: {
    fontSize: 26,
    letterSpacing: "-0.5px",
    transform: "rotate(-4deg)",
    display: "inline-block",
    textShadow: "3px 3px 0 #FFFFFF",
  },
  letterButton: {
    position: "relative",
    width: 46,
    height: 46,
    borderRadius: "50%",
    border: `3px solid ${INK}`,
    background: "#FFFFFF",
    boxShadow: `3px 3px 0 ${INK}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    color: INK,
    cursor: "pointer",
  },
  letterBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    padding: "0 5px",
    boxSizing: "border-box",
    borderRadius: 999,
    background: "#FF5B4A",
    border: `2px solid ${INK}`,
    color: "#fff",
    fontSize: 11,
    lineHeight: "16px",
    textAlign: "center",
  },
  core: {
    flex: "1 1 auto",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "18px",
  },
  // 콜백 카드가 없어도 어항 위치가 크게 흔들리지 않도록 최소 높이만 확보
  callbackSlot: {
    width: "100%",
    minHeight: 8,
    display: "flex",
    justifyContent: "center",
  },
  callbackCard: {
    width: "100%",
    maxWidth: 340,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "12px 16px 14px",
    background: "#FFFFFF",
    border: `3px solid ${INK}`,
    borderRadius: 22,
    boxShadow: `4px 4px 0 ${INK}`,
    cursor: "pointer",
    fontFamily: "'Jua', sans-serif",
    color: INK,
    textAlign: "center",
  },
  callbackStamp: {
    padding: "2px 10px",
    borderRadius: 10,
    background: "#FFD23F",
    border: `2px solid ${INK}`,
    fontSize: 12,
  },
  callbackText: {
    fontSize: 18,
    lineHeight: 1.4,
    wordBreak: "keep-all",
  },
  mic: {
    flexShrink: 0,
    width: 84,
    height: 84,
    borderRadius: "50%",
    border: `4px solid ${INK}`,
    background: "#FFD23F",
    boxShadow: `5px 5px 0 ${INK}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  },
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: "480px",
    background: BRAND.card,
    borderTop: border.onCream,
    boxShadow: "0 -6px 20px rgba(34,28,44,0.06)",
    display: "flex",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
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
  navText: { fontSize: "10px", fontWeight: 700, letterSpacing: "0.3px" },
};
