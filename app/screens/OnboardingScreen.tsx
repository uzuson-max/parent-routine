
"use client";

import { useState } from "react";

interface OnboardingScreenProps {
  onComplete: () => void;
}

type Slide =
  | { type: "text"; main: string; sub: string[]; tail: string }
  | { type: "dialogue"; main: string; lines: string[] };

const SLIDES: Slide[] = [
  {
    type: "text",
    main: "내 얘기 좀 들어봐.",
    sub: ["오늘 있었던 일도", "내일 할 일도", "그냥 아무 말이나 해."],
    tail: "참견이는 그걸 기억해.",
  },
  {
    type: "dialogue",
    main: "그리고 가끔 참견해.",
    lines: ["운동한다며?", "그거 지난주에도 한다고 했는데.", "오. 이번엔 진짜 했네."],
  },
  {
    type: "text",
    main: "시간이 지나면 더 재밌어져.",
    sub: ["네가 했던 말", "하겠다고 한 것", "실제로 한 것", "자꾸 반복하는 것까지"],
    tail: "참견이가 기억해둘게.",
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
            <div style={styles.subBlock}>
              {slide.sub.map((line, i) => (
                <p key={i} style={styles.subLine}>{line}</p>
              ))}
            </div>
            <p style={styles.tailCopy}>{slide.tail}</p>
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
          참견이 시작하기
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
  mainCopy: { color: "#fff", fontSize: "30px", fontWeight: 900, margin: 0, lineHeight: 1.3 },
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
