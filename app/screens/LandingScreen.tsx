"use client";

import { useState } from "react";

interface LandingScreenProps {
  onStart: (initialText?: string) => void;
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

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <span style={styles.badge}>GANSEOBI.EXE</span>
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
              onClick={() => setSelectedChip(chip)}
              style={{
                ...styles.chip,
                background: isSelected ? "#E5FF5D" : "#FFF",
                color: isSelected ? "#C71585" : "#1E1E1E",
                transform: `rotate(${((idx % 3) - 1) * 2}deg)`,
              }}
            >
              #{chip}
            </button>
          );
        })}
      </div>

      <div style={styles.ctaArea}>
        <button style={styles.ctaButton} onClick={() => onStart(selectedChip || undefined)}>
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
    background: "#C71585",
    color: "#FFF",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "24px 20px 36px 20px",
    fontFamily: "monospace, sans-serif",
    boxSizing: "border-box",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  badge: {
    background: "#E5FF5D",
    color: "#C71585",
    padding: "4px 8px",
    fontSize: "11px",
    fontWeight: "900",
    letterSpacing: "1px",
  },
  dateStamp: {
    fontSize: "12px",
    fontWeight: "bold",
    color: "rgba(255,255,255,0.8)",
  },
  heroSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    margin: "20px 0",
  },
  mainQuestion: {
    fontSize: "42px",
    fontWeight: "900",
    lineHeight: "1.1",
    letterSpacing: "-1px",
    color: "#FFF",
    textShadow: "3px 3px 0px #111",
    margin: "0 0 12px 0",
  },
  subGuide: {
    fontSize: "14px",
    color: "rgba(255, 255, 255, 0.85)",
    lineHeight: "1.4",
    margin: 0,
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
    border: "2px solid #111",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "3px 3px 0px #111",
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
    background: "#E5FF5D",
    color: "#C71585",
    border: "3px solid #111",
    boxShadow: "4px 4px 0px #111",
    padding: "18px",
    fontSize: "18px",
    fontWeight: "900",
    cursor: "pointer",
  },
  footerNote: {
    fontSize: "11px",
    color: "rgba(255, 255, 255, 0.6)",
    margin: 0,
  },
};
