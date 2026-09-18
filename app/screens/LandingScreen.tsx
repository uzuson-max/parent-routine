

"use client";

import { useState } from "react";
import { BRAND, inkAlpha, pageBackground, tactile, typography, radius, TACTILE_PRESS_CLASS } from "@/lib/theme";

interface LandingScreenProps {
  onStart: (selectedText?: string) => void;
}

const DRAFT_CHIPS = [
  "요즘 자꾸 미루는 거",
  "이번 주에 하고 싶은 거",
  "괜히 사고 싶은 거",
  "아무한테도 말 안 한 거",
  "요즘 짜증나는 거",
  "최근에 꽂힌 거",
  "계속 생각나는 사람",
  "요즘 좀 잘하고 있는 거",
];

export default function LandingScreen({ onStart }: LandingScreenProps) {
  const [selectedChip, setSelectedChip] = useState<string | null>(null);

  const handleChipClick = (chip: string) => {
    // 칩을 누르면 바로 선택하고 녹음 화면으로 넘어가거나, 선택 상태만 유지할 수 있음
    setSelectedChip(chip);
    onStart(chip);
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <span style={styles.badge}>GANSEOBI</span>
        <span style={styles.dateStamp}>08.29 SAT</span>
      </div>

      <div style={styles.heroSection}>
        <h1 style={styles.mainQuestion}>오늘 뭐가<br />좀 걸려?</h1>
        <p style={styles.subGuide}>
          그냥 지나가도 되고,<br />
          나한테 던져놓고 가도 돼.
        </p>
      </div>

      <div style={styles.chipContainer}>
        {DRAFT_CHIPS.map((chip, idx) => {
          const isSelected = selectedChip === chip;
          return (
            <button
              key={idx}
              className={TACTILE_PRESS_CLASS}
              onClick={() => handleChipClick(chip)}
              style={{
                ...styles.chip,
                ...(isSelected ? styles.chipSelected : {}),
              }}
            >
              #{chip}
            </button>
          );
        })}
      </div>

      <div style={styles.ctaArea}>
        <button className={TACTILE_PRESS_CLASS} style={styles.ctaButton} onClick={() => onStart(selectedChip || "그냥 아무 생각이나")}>
          + 생각 하나 던지기
        </button>
        <p style={styles.footerNote}>정리할 필요 없음. 욕해도 됨.</p>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    ...pageBackground,
    color: BRAND.ink,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "24px 20px 36px 20px",
    boxSizing: "border-box",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  badge: {
    ...tactile.badge,
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.06em",
  },
  dateStamp: {
    fontSize: "12px",
    fontWeight: 600,
    color: inkAlpha.faint,
  },
  heroSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    margin: "20px 0",
  },
  mainQuestion: {
    fontSize: "40px",
    fontWeight: 800,
    lineHeight: "1.15",
    letterSpacing: "-0.02em",
    color: BRAND.ink,
    margin: "0 0 12px 0",
  },
  subGuide: {
    fontSize: "14px",
    color: inkAlpha.muted,
    lineHeight: "1.4",
    margin: 0,
    fontWeight: 500,
  },
  chipContainer: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    justifyContent: "center",
    maxHeight: "160px",
    overflowY: "auto",
    padding: "4px",
  },
  chip: {
    ...tactile.secondaryButton,
    padding: "8px 14px",
    fontSize: "12px",
    fontWeight: 600,
    color: BRAND.ink,
  },
  chipSelected: {
    background: BRAND.lavenderPale,
    color: BRAND.lavenderDeep,
    border: `1px solid rgba(77,63,115,0.25)`,
  },
  ctaArea: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    width: "100%",
  },
  ctaButton: {
    width: "100%",
    maxWidth: "360px",
    ...tactile.primaryButton,
    padding: "18px",
    ...typography.ctaLabel,
    fontSize: "18px",
  },
  footerNote: {
    fontSize: "11px",
    color: inkAlpha.faint,
    margin: 0,
  },
};
