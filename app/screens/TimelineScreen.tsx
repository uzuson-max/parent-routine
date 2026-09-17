
"use client";

import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";
import Mascot, { type MascotPose } from "@/components/Mascot";
import { IconHome, IconRecord, IconMemory, IconMic, IconGear } from "@/components/icons";

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
  entries: RecordEntry[] | null;
  proactiveLine?: ProactiveLine | null;
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

// 아직 참견할 거리도, 지난 반응도 없을 때 쓰는 담백한 시작 문구.
// 고정 문구를 매번 반복하지 않으려고 날짜 기준으로 하나씩 돌려쓴다(같은 날 안에서는 안 바뀜).
const IDLE_LINES = ["왔어?", "오늘은 무슨 얘기 할 건데?", "어, 왔네.", "뭐 재밌는 거 없었어?"];

function pickIdleLine(nickname?: string | null): string {
  const line = IDLE_LINES[new Date().getDate() % IDLE_LINES.length];
  return nickname ? `${nickname}, ${line}` : line;
}

type LineMode = "callback" | "recent" | "idle";

export default function TimelineScreen({
  onOpenRecording,
  onOpenCalendar,
  onOpenMyPage,
  onOpenInsights,
  entries,
  proactiveLine,
  nickname,
}: TimelineScreenProps) {
  // 홈의 주인공은 "니가 남긴 기록 목록"이 아니라 "참견이가 지금 하고 싶은 한마디"다.
  // 우선순위: 1) 진짜 proactive callback(아직 아무 데도 안 꺼낸 memory_insight)이 있으면 그게
  // 곧 "참견이가 나를 찾아온 것". 2) 없으면 내가 방금 한 말에 참견이가 뭐라고 반응했는지
  // (가장 최근 entry). 3) 그마저 없으면(정말 처음) 날짜별로 도는 담백한 시작 문구.
  // entries와 proactiveLine 둘 다 아직 응답 전이면(로딩 중) 말풍선 자체를 비워둔다 —
  // "불러오는 중" 같은 문구 대신, 캐릭터만 먼저 등장하고 문장은 한 박자 뒤에 따라오게 한다.
  const ready = entries !== null && proactiveLine !== undefined;
  const latestEntry = pickLatestEntry(entries);

  let mode: LineMode = "idle";
  let currentLine = "";
  if (ready) {
    if (proactiveLine && proactiveLine.content) {
      mode = "callback";
      currentLine = truncate(proactiveLine.content, 80);
    } else if (latestEntry?.responseText && latestEntry.responseText.trim()) {
      mode = "recent";
      currentLine = truncate(latestEntry.responseText, 70);
    } else {
      mode = "idle";
      currentLine = pickIdleLine(nickname);
    }
  }

  const pose: MascotPose = mode === "callback" ? "궁금" : "말을거는";
  const ctaText = mode === "callback" ? "대답하기" : "아무 얘기나 해도 돼";

  const handleCtaClick = () => {
    if (mode === "callback" && proactiveLine && proactiveLine.content) {
      // 참견이가 던진 말에 답하러 가는 거라, 녹음 화면에 그 문장을 주제로 들고 간다.
      // 업로드는 기존 흐름(memory pipeline → responseEngine) 그대로.
      onOpenRecording(proactiveLine.content);
    } else {
      onOpenRecording();
    }
  };

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes ganseobiMascotIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.92); }
          60% { opacity: 1; transform: translateY(-2px) scale(1.03); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ganseobiBubbleIn {
          0% { opacity: 0; transform: translateY(6px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .ganseobi-mascot-in { animation: ganseobiMascotIn 0.45s ease-out both; }
        .ganseobi-bubble-in { animation: ganseobiBubbleIn 0.3s ease-out 0.15s both; }
        @media (prefers-reduced-motion: reduce) {
          .ganseobi-mascot-in, .ganseobi-bubble-in { animation: none; }
        }
      `}</style>

      {/* TOP — 참견이가 여기서 기다리고 있다는 느낌: 마스코트 + 말풍선(= 참견이의 현재 한마디) */}
      <div style={styles.topSection}>
        <div className="ganseobi-mascot-in">
          <Mascot pose={pose} size={72} />
        </div>
        {ready && (
          <div className="ganseobi-bubble-in" style={styles.speechBubbleWrap}>
            {mode === "callback" && <span style={styles.stamp}>참견이 등장.</span>}
            <div style={styles.speechBubble}>
              <h1 style={styles.greeting}>{currentLine}</h1>
            </div>
          </div>
        )}
      </div>

      {/* 화면 중앙의 여백 — 홈에 정보가 몰려있지 않게, 한마디와 버튼 사이를 비워둔다 */}
      <div style={{ flex: 1 }} />

      {/* MAIN CTA — 화면에서 가장 큰 행동, 유일한 주 버튼. 참견에 답하는 것도 이 버튼 하나로 */}
      <button style={styles.mainCta} onClick={handleCtaClick}>
        <span style={styles.ctaMicWrap}>
          <IconMic style={{ width: 22, height: 22, color: "#fff" }} />
        </span>
        <span style={styles.ctaText}>{ctaText}</span>
        <span style={styles.ctaLabel}>TALK TO ME~</span>
      </button>

      {/* NAVIGATION — 최근 내가 남긴 말(기록)·이전 참견(MEMORY)으로 가는 아주 작은 보조 진입점.
          position:fixed라 문서 흐름 밖에 있으므로, 이 네비가 CTA 버튼을 가리지 않도록
          컨테이너의 paddingBottom으로 공간을 미리 확보해둔다(아래 styles.container 참고). */}
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
    ...pageBackground,
    color: BRAND.ink,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    // 콘텐츠를 위쪽에 쌓아두고 남는 공간을 flex:1이 다 떠안는 대신, 마스코트~버튼 그룹을
    // 세로 중앙에 모아서 화면 위/아래로 쭉 벌어져 보이는 것을 막는다.
    justifyContent: "center",
    gap: "12px",
    // 16px 고정값만으로는 기기에 따라 env(safe-area-inset-top)이 기대만큼 안 잡히면서
    // 상태표시줄과 겹쳐 보이는 경우가 있어서, max()로 최소 여백을 항상 보장한다.
    paddingTop: "max(20px, calc(env(safe-area-inset-top, 0px) + 12px))",
    paddingLeft: "20px",
    paddingRight: "20px",
    paddingBottom: "calc(78px + env(safe-area-inset-bottom, 0px))",
  },
  topSection: { display: "flex", alignItems: "center", gap: "12px" },
  speechBubbleWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "6px",
  },
  stamp: {
    background: BRAND.yellow,
    color: BRAND.ink,
    border: "2px solid #111",
    boxShadow: "3px 3px 0px #111",
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.5px",
  },
  speechBubble: {
    background: BRAND.card,
    border: "2.5px solid #111",
    borderRadius: "18px 18px 18px 4px",
    padding: "14px 16px",
    boxShadow: "3px 4px 0px rgba(30,26,38,0.12)",
    width: "100%",
    boxSizing: "border-box",
  },
  greeting: {
    fontSize: "20px",
    fontWeight: "900",
    margin: 0,
    letterSpacing: "-0.3px",
    lineHeight: 1.35,
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
    // 홈 인디케이터가 있는 기기에서 네비 아이콘이 그 제스처 영역과 겹치지 않도록.
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
  navText: { fontSize: "10px", fontWeight: "900", letterSpacing: "0.5px" },
};
