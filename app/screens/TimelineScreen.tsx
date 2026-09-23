
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

// Home은 "참견이가 지금 나에게 할 말이 있는가"만 판단한다. 과거 기록을 훑어서 대신 보여주는
// 3번째 모드(예전의 "recent")는 두지 않는다 — 최신 기록을 재활용해 마치 지금 말을 거는 것처럼
// 보여주는 것도 결국 "기록 앱" UX라, 진짜 proactive callback이 없으면 그냥 조용한 empty state로 간다.
const EMPTY_HEADLINE = "오늘은 아직\n참견할 게 없는데?";
const EMPTY_SUBTEXT = "아침에 생각나는 거 있으면\n그냥 말해둬.";

export default function TimelineScreen({
  onOpenRecording,
  onOpenCalendar,
  onOpenMyPage,
  onOpenInsights,
  proactiveLine,
  nickname,
}: TimelineScreenProps) {
  // entries는 페이지 상위에서 여전히 불러오지만(기록/캘린더 탭 등 다른 곳에서 쓰임),
  // Home의 메시지는 오직 proactiveLine(아직 아무 데도 안 꺼낸 진짜 개입)에만 반응한다.
  // proactiveLine이 undefined = 아직 확인 중. 확인 중에도 홈 전체(마스코트·마이크 CTA·네비)는
  // 바로 보여주고, 메시지 자리만 옅은 skeleton으로 비워둔다 — 캐릭터만 서 있는 대기 화면 없음.
  const ready = proactiveLine !== undefined;
  const hasCallback = ready && !!(proactiveLine && proactiveLine.content);

  const callbackLine = hasCallback ? truncate(proactiveLine!.content, 90) : "";
  const headline = hasCallback ? callbackLine : nickname ? `${nickname},\n${EMPTY_HEADLINE}` : EMPTY_HEADLINE;

  const pose: MascotPose = !ready ? "기본" : hasCallback ? "궁금" : "기본";
  const ctaText = hasCallback ? "대답하기" : "오늘의 생각 말하기";

  const handleCtaClick = () => {
    if (hasCallback && proactiveLine) {
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

      {/* CORE — Home은 "기록을 보여주는 화면"이 아니라 "참견이가 지금 나에게 할 말이 있는 화면"이다.
          그래서 여기엔 딱 두 상태만 있다: (1) 참견이가 꺼낼 말이 있음 → 그 말이 화면의 유일한
          주인공. (2) 없음 → 차분한 empty state. 과거 기록을 다시 보여주는 3번째 모드는 없다.
          이 그룹은 flex: 1 + justifyContent: center로 헤더 아래 ~ 하단 네비 위의 남는 공간
          안에서 세로 중앙 정렬되고, 고정 높이 spacer는 쓰지 않는다. */}
      <div style={styles.coreGroup}>
        <div className="ganseobi-mascot-in" style={styles.mascotWrap}>
          <Mascot pose={pose} size={60} />
        </div>

        {ready && hasCallback && (
          // 참견이가 먼저 말을 거는 순간 — 이 카드가 화면에서 가장 강한 요소여야 한다.
          <div className="ganseobi-bubble-in" style={styles.callbackWrap}>
            <span style={styles.stamp}>참견이 등장.</span>
            <div style={styles.messageCard}>
              <h1 style={styles.messageText}>{headline}</h1>
            </div>
          </div>
        )}

        {!ready && (
          // 참견거리 확인 중 — 캐릭터만 덩그러니 세워두지 않고, 메시지 자리만 아주 옅게 비워둔다.
          // 홈의 나머지(마이크 CTA·하단 네비)는 이미 다 보이고 바로 누를 수 있다.
          <div style={styles.emptyWrap} aria-hidden>
            <span style={{ ...styles.skeletonLine, width: "62%" }} />
            <span style={{ ...styles.skeletonLine, width: "44%" }} />
            <span style={{ ...styles.skeletonLine, width: "52%", height: 12, marginTop: 6 }} />
          </div>
        )}

        {ready && !hasCallback && (
          // 참견할 거리가 없을 때 — 억지로 참견을 만들어내지 않고, 카드 없이 담백하게 보여준다.
          <div className="ganseobi-bubble-in" style={styles.emptyWrap}>
            <h1 style={styles.emptyHeadline}>{headline}</h1>
            <p style={styles.emptySubtext}>{EMPTY_SUBTEXT}</p>
          </div>
        )}

        {/* 대답하기 / 오늘의 생각 말하기 — Home에서 유일한 행동. 참견거리 확인을 기다리지 않고
            처음부터 보여준다(확인 전엔 "오늘의 생각 말하기", 참견이 도착하면 "대답하기"로 바뀜). */}
        <button className={TACTILE_PRESS_CLASS} style={styles.mainCta} onClick={handleCtaClick}>
          <span style={styles.ctaMicWrap}>
            <IconMic style={{ width: 18, height: 18, color: "#fff" }} />
          </span>
          <span style={styles.ctaText}>{ctaText}</span>
        </button>
      </div>

      {/* NAVIGATION — 기록(내가 남긴 이야기)·MEMORY(참견이가 축적한 기억)로 가는 보조 진입점.
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
    // 모바일 앱이 PC 브라우저에서 어색하게 옆으로 늘어나 보이지 않도록, 모바일 width를
    // 기준으로 max-width를 잡고 넓은 화면에서는 가운데 정렬한다.
    maxWidth: "480px",
    marginLeft: "auto",
    marginRight: "auto",
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
  mascotWrap: { display: "flex", justifyContent: "center" },
  // 참견이가 말을 걸 때 — 스탬프 + 메시지 카드가 화면의 시각적 주인공. 가운데 정렬로
  // "카드 하나가 나에게 도착했다"는 느낌을 준다.
  callbackWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    textAlign: "center",
  },
  stamp: { ...tactile.stamp, padding: "4px 10px", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px" },
  messageCard: {
    ...tactile.card,
    borderRadius: radius.xl,
    padding: "22px 20px",
    width: "100%",
    boxSizing: "border-box",
  },
  messageText: {
    ...typography.headline,
    fontSize: 20,
    margin: 0,
    lineHeight: 1.45,
    whiteSpace: "pre-line",
    textAlign: "center",
  },
  // 참견할 거리가 없을 때 — 카드 없이 담백한 텍스트만. 장식을 더해 눈에 띄게 만들지 않는다.
  emptyWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    textAlign: "center",
    padding: "0 8px",
  },
  emptyHeadline: {
    ...typography.headline,
    fontSize: 19,
    margin: 0,
    lineHeight: 1.45,
    whiteSpace: "pre-line",
    color: inkAlpha.soft,
    textAlign: "center",
  },
  // 메시지가 들어올 자리 — 옅은 막대 몇 개(애니메이션 없음). empty state 텍스트와 비슷한 높이.
  skeletonLine: {
    display: "block",
    height: 18,
    borderRadius: 9,
    background: inkAlpha.hairline,
  },
  emptySubtext: {
    ...typography.sub,
    margin: 0,
    lineHeight: 1.5,
    whiteSpace: "pre-line",
    color: inkAlpha.faint,
    textAlign: "center",
  },
  // 음성 입력은 핵심 행동이므로 시각적으로 충분히 강조하되, 메시지 카드보다 화면을 압도하지는
  // 않는 크기로 — 한 줄 pill이지만 탭하기 충분히 크고 존재감 있게.
  mainCta: {
    width: "100%",
    ...tactile.primaryButton,
    padding: "16px 20px",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
  },
  ctaMicWrap: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.18)",
    border: "1px solid rgba(255,255,255,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ctaText: { ...typography.ctaLabel, fontSize: 16 },
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    // container와 같은 max-width로 맞춰서, 넓은 화면에서 네비만 전체 폭으로 늘어나
    // 콘텐츠 컬럼과 어긋나 보이지 않도록 한다.
    maxWidth: "480px",
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
