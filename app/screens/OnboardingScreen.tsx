
"use client";

import { useState } from "react";

interface OnboardingScreenProps {
  onComplete: () => void;
}

type Slide =
  | { type: "text"; main: string; sub?: string[]; tail?: string }
  | { type: "dialogue"; main: string; lines: string[] };

// 참견이가 어떤 서비스인지 "기능 설명"이 아니라 "존재"로 아주 짧게 이해시키는 것이 목적.
// 그래서 슬라이드 하나당 한 문장, 군더더기 없이.
const SLIDES: Slide[] = [
  {
    type: "text",
    main: "내가 한 말을 기억해.",
  },
  {
    type: "dialogue",
    main: "가끔 다시 꺼내서 참견해.",
    lines: ["운동한다며?", "지난주에도 한다고 했는데.", "오, 이번엔 진짜 했네."],
  },
  {
    type: "text",
    main: "필요하면 문자도 하고,\n전화도 해.",
  },
];

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  const goNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setIndex((i) => i + 1);
    }
  };

  return (
    <div style={styles.container} onClick={!isLast ? goNext : undefined}>
      <div style={styles.dots}>
        {SLIDES.map((_, i) => (
          <span key={i} style={{ ...styles.dot, ...(i === index ? styles.dotActive : {}) }} />
        ))}
      </div>

      <div style={styles.contentWrapper}>
        <h1 style={styles.mainCopy}>{slide.main}</h1>

        {slide.type === "text" && (
          <>
            {slide.sub && slide.sub.length > 0 && (
              <div style={styles.subBlock}>
                {slide.sub.map((line, i) => (
                  <p key={i} style={styles.subLine}>{line}</p>
                ))}
              </div>
            )}
            {slide.tail && <p style={styles.tailCopy}>{slide.tail}</p>}
          </>
        )}

        {slide.type === "dialogue" && (
          <div style={styles.dialogueBlock}>
            {slide.lines.map((line, i) => (
              <div key={i} style={styles.bubble}>{line}</div>
            ))}
          </div>
        )}
      </div>

      {isLast ? (
        <button
          style={styles.ctaButton}
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
        >
          참견이 만나보기
        </button>
      ) : (
        <p style={styles.tapHint}>화면을 눌러서 계속</p>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    background: "#C71585",
    color: "#E5FF5D",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "48px 24px 32px",
    cursor: "pointer",
  },
  dots: { display: "flex", gap: "8px" },
  dot: { width: "8px", height: "8px", borderRadius: "50%", background: "rgba(229, 255, 93, 0.3)" },
  dotActive: { background: "#E5FF5D" },
  contentWrapper: {
    flex: 1,
    width: "100%",
    maxWidth: "380px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    gap: "20px",
  },
  mainCopy: { color: "#fff", fontSize: "30px", fontWeight: 900, margin: 0, lineHeight: 1.3, whiteSpace: "pre-line" },
  subBlock: { display: "flex", flexDirection: "column", gap: "4px" },
  subLine: { color: "rgba(255,255,255,0.85)", fontSize: "16px", margin: 0, fontWeight: 700 },
  tailCopy: { color: "#E5FF5D", fontSize: "18px", fontWeight: 900, margin: 0 },
  dialogueBlock: { display: "flex", flexDirection: "column", gap: "10px", width: "100%" },
  bubble: {
    background: "#E5FF5D",
    color: "#C71585",
    padding: "12px 16px",
    fontSize: "15px",
    fontWeight: 900,
    border: "2px solid #111",
    boxShadow: "3px 3px 0px #111",
    alignSelf: "flex-start",
  },
  ctaButton: {
    width: "100%",
    maxWidth: "380px",
    padding: "18px",
    border: "2px solid #111",
    background: "#E5FF5D",
    color: "#C71585",
    fontSize: "17px",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "3px 3px 0px #111",
  },
  tapHint: { color: "rgba(255,255,255,0.5)", fontSize: "13px", margin: 0 },
};
