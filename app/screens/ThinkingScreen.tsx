
"use client";

import { useEffect, useState } from "react";

// 순차 문구: 실제 API가 끝나기 전까지 이 컴포넌트는 계속 떠 있고,
// page.tsx에서 step이 "uploading"을 벗어나는 순간(=API 완료) 언마운트되어 결과 화면으로 넘어간다.
// 즉 애니메이션 자체는 고정 타이머로 돌되, "다음 화면 전환"은 실제 API 응답이 트리거함.
const PHRASES: { text: string; label: string; withDots?: boolean }[] = [
  { text: "잠깐.", label: "LISTENED" },
  { text: "참견할 거 찾는 중", label: "THINKING", withDots: true },
  { text: "흠...", label: "THINKING" },
  { text: "할 말 생겼어.", label: "READY" },
];

const STEP_DELAYS = [1000, 1000, 1200]; // 각 단계로 넘어가기까지 걸리는 시간(ms)

export default function ThinkingScreen() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    STEP_DELAYS.forEach((delay, i) => {
      elapsed += delay;
      timers.push(setTimeout(() => setPhraseIndex(i + 1), elapsed));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setDotCount((d) => (d % 3) + 1), 400);
    return () => clearInterval(interval);
  }, []);

  const current = PHRASES[phraseIndex];

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes ganseobiThinkPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
      `}</style>

      <span style={styles.label}>{current.label}</span>

      <div style={styles.micWrap}>
        <span style={styles.mic}>🎙️</span>
      </div>

      <p style={styles.phrase}>
        {current.text}
        {current.withDots ? ".".repeat(dotCount) : ""}
      </p>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    background: "#C71585",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "20px",
    padding: "24px",
  },
  label: {
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "2px",
    color: "rgba(229,255,93,0.75)",
  },
  micWrap: {
    width: "88px",
    height: "88px",
    borderRadius: "50%",
    border: "3px solid #E5FF5D",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "ganseobiThinkPulse 1.4s ease-in-out infinite",
  },
  mic: { fontSize: "32px" },
  phrase: {
    color: "#fff",
    fontSize: "22px",
    fontWeight: 900,
    margin: 0,
    minHeight: "28px",
    textAlign: "center",
  },
};
