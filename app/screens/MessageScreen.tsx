
"use client";

import { BRAND, inkAlpha, pageBackground, tactile, typography, TACTILE_PRESS_CLASS } from "@/lib/theme";
import Mascot from "@/components/Mascot";

function truncate(text: string | undefined, max: number): string | null {
  if (!text) return null;
  const clean = text.trim();
  if (!clean || clean === "(음성 변환 실패)") return null;
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

// 참견이 응답 화면 — 대화 루프의 한가운데.
//   참견이 → 응답 → [＋ 더 이야기하기](primary, 누르면 곧바로 녹음) → 홈으로(secondary)
// 응답이 길어져도 버튼이 화면 밖으로 밀리지 않도록, 화면 높이를 고정하고 응답 영역만 스크롤한다.
export default function MessageScreen({
  title,
  subtitle,
  transcriptPreview,
  onTalkMore,
  onHome,
  firstRun,
}: {
  title: string;
  subtitle?: string;
  transcriptPreview?: string;
  onTalkMore: () => void;
  onHome: () => void;
  // 사용자의 첫 번째 기록에 대한 응답일 때만 true — "참견이와 첫 대화를 했다"는 느낌을 살짝 더 강조한다.
  firstRun?: boolean;
}) {
  const preview = truncate(transcriptPreview, 42);

  return (
    <div style={styles.container}>
      <div style={styles.scrollArea}>
        <div style={styles.content}>
          <Mascot pose="기본" size={72} />
          {firstRun && <span style={styles.stamp}>참견이 등장.</span>}
          <p style={styles.title}>{title}</p>
          {subtitle && <p style={styles.subtitle}>{subtitle}</p>}

          {preview && (
            <div style={styles.previewBox}>
              <p style={styles.previewLabel}>니가 한 말</p>
              <p style={styles.previewText}>“{preview}”</p>
            </div>
          )}
        </div>
      </div>

      <div style={styles.actions}>
        <button className={TACTILE_PRESS_CLASS} style={styles.primaryButton} onClick={onTalkMore}>
          ＋ 더 이야기하기
        </button>
        <button className={TACTILE_PRESS_CLASS} style={styles.homeButton} onClick={onHome}>
          홈으로
        </button>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  // 실제 기기 화면 한 장(100dvh)에 딱 맞춘다. 넘치는 건 scrollArea 안에서만 스크롤.
  // 참고: app/globals.css가 현재 layout에서 import되지 않아 body가 안전영역 padding을 주지 않는다.
  // 그래서 다른 화면들(Home/MY/캘린더)처럼 이 화면도 안전영역을 직접 비운다.
  container: {
    ...pageBackground,
    minHeight: "100dvh",
    height: "100dvh",
    paddingTop: "env(safe-area-inset-top, 0px)",
    display: "flex",
    flexDirection: "column",
    maxWidth: 480,
    margin: "0 auto",
    boxSizing: "border-box",
  },
  scrollArea: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain",
    display: "flex",
    flexDirection: "column",
    padding: "24px 28px 8px",
  },
  // margin:auto로 내용이 짧을 땐 세로 중앙, 길면 위에서부터 자연스럽게 스크롤.
  content: { margin: "auto 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  stamp: { ...tactile.stamp, padding: "4px 10px", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px", marginTop: 14, marginBottom: 2 },
  title: { color: BRAND.ink, fontSize: 21, fontWeight: 800, margin: "18px 0 8px 0", whiteSpace: "pre-line", lineHeight: 1.45, wordBreak: "keep-all", overflowWrap: "anywhere" },
  subtitle: { color: inkAlpha.muted, fontSize: 14, margin: "0 0 8px", whiteSpace: "pre-line", lineHeight: 1.5, fontWeight: 500 },
  previewBox: { marginTop: 16, width: "100%", maxWidth: 320, boxSizing: "border-box", ...tactile.cardAccent, padding: "12px 16px" },
  previewLabel: { color: BRAND.lavenderDeep, fontSize: 12, margin: "0 0 4px", fontWeight: 700 },
  previewText: { color: BRAND.ink, fontSize: 14, fontStyle: "italic", lineHeight: 1.5, margin: 0 },
  // 하단 버튼 영역 — flexShrink 0이라 응답이 아무리 길어도 항상 화면 안에 남는다.
  // 홈 인디케이터(제스처 바)와 겹치지 않도록 하단 안전영역만큼 더 띄운다.
  actions: {
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "12px 24px max(16px, calc(env(safe-area-inset-bottom, 0px) + 8px))",
  },
  primaryButton: { width: "100%", maxWidth: 360, padding: "16px 20px", ...tactile.primaryButton, ...typography.ctaLabel },
  homeButton: { ...tactile.ghostButton, padding: "12px 20px", fontSize: 14, fontWeight: 600, minHeight: 44 },
};
