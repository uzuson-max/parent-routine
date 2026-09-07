
"use client";

import { BRAND, textAlpha, texturedSkyBackground } from "@/lib/theme";

interface FirstTalkScreenProps {
  onStart: () => void;
}

// 첫 권한 허용 직후, 바로 홈으로 보내지 않고 첫 번째 실제 행동(첫 녹음)으로 연결하는 화면.
export default function FirstTalkScreen({ onStart }: FirstTalkScreenProps) {
  return (
    <div style={styles.container}>
      <div style={styles.contentWrapper}>
        <span style={styles.stamp}>참견이 등장.</span>
        <h1 style={styles.headline}>아무 말이나 해볼래?</h1>
        <p style={styles.subhead}>진짜 아무 말이나 괜찮아.</p>
      </div>
      <button style={styles.ctaButton} onClick={onStart}>
        말해보기
      </button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    ...texturedSkyBackground,
    color: BRAND.text,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "48px 24px 32px",
  },
  contentWrapper: {
    flex: 1,
    width: "100%",
    maxWidth: "380px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    gap: "16px",
  },
  stamp: {
    background: BRAND.yellow,
    color: BRAND.text,
    border: "2px solid #111",
    boxShadow: "3px 3px 0px #111",
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.5px",
  },
  headline: { color: BRAND.text, fontSize: "28px", fontWeight: 900, margin: 0, lineHeight: 1.35 },
  subhead: { color: textAlpha.soft, fontSize: "15px", fontWeight: 700, margin: 0 },
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
};
