


"use client";

import { BRAND, inkAlpha, pageBackground, tactile, typography, shadow, border, radius, TACTILE_PRESS_CLASS } from "@/lib/theme";
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

// "이전 참견" 미니 프리뷰용 — 이미 있는 entry.createdAt만 가지고 상대적인 날짜 라벨을 만든다.
// 새 데이터/새 API 없이 기존 값만 재활용.
function formatRelativeDate(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((startOfNow - startOfThen) / 86400000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
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

  // callback 모드일 때만: 지금 화면 주인공(방금 도착한 참견)과 겹치지 않는 "직전 흔적" 하나를
  // 아주 작게 보여준다. recent/idle 모드에서는 currentLine 자체가 이미 최신 기록이라 중복이라
  // 표시하지 않는다. 새 fetch 없이 이미 내려온 entries만 재사용.
  const recentPreview =
    mode === "callback" && latestEntry?.responseText && latestEntry.responseText.trim()
      ? {
          text: truncate(latestEntry.responseText, 40),
          dateLabel: formatRelativeDate(latestEntry.createdAt),
        }
      : null;

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

      {/* HEADER — 아주 작고 차분한 앱 셸 상단. Home에서 주인공이 되면 안 되므로 wordmark 하나만. */}
      <div style={styles.header}>
        <span style={styles.headerLabel}>참견이</span>
      </div>

      {/* CORE — 마스코트·참견 메시지·답변 입력을 하나의 그룹으로 묶어 화면에 남는 공간(헤더 아래 ~
          하단 네비 위) 안에서 세로로 중앙 정렬한다. 예전처럼 고정 높이 spacer div로 자리를 억지로
          만드는 대신, 이 그룹을 담은 wrapper 자체가 flex: 1을 갖고 justifyContent: center로 정렬되기
          때문에 어떤 화면 높이에서도 위/아래에 의미 없는 빈 공간이 남지 않는다. */}
      <div style={styles.coreGroup}>
        <div style={styles.topSection}>
          <div className="ganseobi-mascot-in">
            <Mascot pose={pose} size={64} />
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

        {/* 답변 입력 — 예전의 거대한 CTA 카드를 "말 걸 수 있는 입력창"에 가까운 작은 pill로 줄였다.
            메시지보다 시각적으로 강하면 안 되므로 한 줄, compact padding만 사용한다. */}
        <button className={TACTILE_PRESS_CLASS} style={styles.mainCta} onClick={handleCtaClick}>
          <span style={styles.ctaMicWrap}>
            <IconMic style={{ width: 16, height: 16, color: "#fff" }} />
          </span>
          <span style={styles.ctaText}>{ctaText}</span>
        </button>

        {/* 이전 참견의 아주 작은 흔적 — SNS 피드가 아니라 한 줄짜리 잔상. callback 모드에서만,
            이미 내려온 entries 데이터로만 표시한다(새 fetch/새 스키마 없음). */}
        {recentPreview && (
          <div style={styles.recentPreview}>
            <span style={styles.recentPreviewLabel}>최근 참견</span>
            <span style={styles.recentPreviewText}>“{recentPreview.text}”</span>
            <span style={styles.recentPreviewDate}>{recentPreview.dateLabel}</span>
          </div>
        )}
      </div>

      {/* NAVIGATION — 최근 내가 남긴 말(기록)·이전 참견(MEMORY)으로 가는 아주 작은 보조 진입점.
          position:fixed라 문서 흐름 밖에 있으므로, 이 네비가 콘텐츠를 가리지 않도록
          컨테이너의 paddingBottom으로 공간을 미리 확보해둔다(아래 styles.container 참고). */}
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

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    ...pageBackground,
    color: BRAND.ink,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    // 16px 고정값만으로는 기기에 따라 env(safe-area-inset-top)이 기대만큼 안 잡히면서
    // 상태표시줄과 겹쳐 보이는 경우가 있어서, max()로 최소 여백을 항상 보장한다.
    paddingTop: "max(20px, calc(env(safe-area-inset-top, 0px) + 12px))",
    paddingLeft: "20px",
    paddingRight: "20px",
    // 하단 고정 네비(약 60px) + 여백을 항상 확보 — 76px짜리 빈 div를 문서 흐름에 끼워넣는 대신
    // 컨테이너 자체의 padding으로만 처리해서, 실제 네비 높이보다 화면을 더 길게 만들지 않는다.
    paddingBottom: "calc(78px + env(safe-area-inset-bottom, 0px))",
  },
  header: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    height: "28px",
  },
  headerLabel: {
    ...typography.eyebrow,
    color: inkAlpha.faint,
    textTransform: "none",
  },
  // 헤더 아래 ~ 하단 네비 위까지 "남는 공간"을 이 wrapper가 갖고, 그 안에서 콘텐츠를 세로
  // 중앙 정렬한다. 고정 높이 spacer 없이도 화면 높이에 따라 자연스럽게 여백이 분배된다.
  coreGroup: {
    flex: "1 1 auto",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "18px",
  },
  topSection: { display: "flex", alignItems: "center", gap: "12px" },
  speechBubbleWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "6px",
  },
  stamp: { ...tactile.stamp, padding: "4px 10px", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px" },
  speechBubble: {
    ...tactile.card,
    borderRadius: "18px 18px 18px 4px",
    padding: "14px 16px",
    width: "100%",
    boxSizing: "border-box",
  },
  greeting: {
    ...typography.headline,
    margin: 0,
    lineHeight: 1.35,
  },
  // 예전의 큰 세로형 CTA 카드 대신, "눌러서 말 걸기" 입력창에 가까운 한 줄짜리 pill.
  // 참견이 메시지보다 시각적으로 강해지면 안 되므로 compact padding만 쓴다.
  mainCta: {
    width: "100%",
    ...tactile.primaryButton,
    padding: "12px 16px",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
  },
  ctaMicWrap: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.18)",
    border: "1px solid rgba(255,255,255,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ctaText: { ...typography.ctaLabel, fontSize: 15 },
  recentPreview: {
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
    padding: "0 4px",
    color: inkAlpha.faint,
    flexWrap: "wrap",
  },
  recentPreviewLabel: { fontSize: 11, fontWeight: 700, flexShrink: 0 },
  recentPreviewText: { fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  recentPreviewDate: { fontSize: 11, flexShrink: 0 },
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    background: BRAND.card,
    borderTop: border.onCream,
    boxShadow: "0 -6px 20px rgba(34,28,44,0.06)",
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
  navText: { fontSize: "10px", fontWeight: 700, letterSpacing: "0.3px" },
};
