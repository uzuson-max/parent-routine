
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
    main: "내가 한 말을\n기억해둘게.",
  },
  {
    type: "dialogue",
    main: "가끔 다시 꺼내서\n참견할 거야.",
    lines: ["운동한다며?", "그거 아직 안 했네?", "어? 이번엔 했네."],
  },
  {
    type: "text",
    main: "문자도 하고.\n전화도 할게.",
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
          한번 만나볼까?
        </button>
      ) : (
        <p style={styles.tapHint}>화면 누르면 계속돼</p>
      )}
    </div>
  );
}

// 참견이 브랜드 컬러 — 하늘색을 메인으로, 아이보리/노랑/피치는 보조색으로만 제한적으로 사용.
// (이번 작업 범위는 온보딩 화면뿐이라 이 팔레트는 아직 이 파일 안에서만 쓰인다.)
const BRAND = {
  sky: "#86A9D5", // 메인 브랜드 컬러 — 기존 #C71585 대체
  ivory: "#FFF9EF", // 보조 배경(이 화면엔 카드 영역이 없어 아직 미사용)
  yellow: "#F5D77E", // 포인트 — 버튼/작은 강조
  peach: "#F2B7A5", // 포인트 — 말풍선 전용
  text: "#3F3835", // 순수 검정 대신 짙은 브라운
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    background: BRAND.sky,
    color: BRAND.text,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "48px 24px 32px",
    cursor: "pointer",
  },
  dots: { display: "flex", gap: "8px" },
  dot: { width: "8px", height: "8px", borderRadius: "50%", background: "rgba(63, 56, 53, 0.25)" },
  dotActive: { background: BRAND.yellow },
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
  mainCopy: { color: BRAND.text, fontSize: "30px", fontWeight: 900, margin: 0, lineHeight: 1.3, whiteSpace: "pre-line" },
  subBlock: { display: "flex", flexDirection: "column", gap: "4px" },
  subLine: { color: "rgba(63, 56, 53, 0.75)", fontSize: "16px", margin: 0, fontWeight: 700 },
  tailCopy: { color: BRAND.yellow, fontSize: "18px", fontWeight: 900, margin: 0 },
  dialogueBlock: { display: "flex", flexDirection: "column", gap: "10px", width: "100%" },
  bubble: {
    background: BRAND.peach,
    color: BRAND.text,
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
    background: BRAND.yellow,
    color: BRAND.text,
    fontSize: "17px",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "3px 3px 0px #111",
  },
  tapHint: { color: "rgba(63, 56, 53, 0.6)", fontSize: "13px", margin: 0 },
};
