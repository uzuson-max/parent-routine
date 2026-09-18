

"use client";

import { BRAND, inkAlpha, pageBackground, tactile, typography, TACTILE_PRESS_CLASS } from "@/lib/theme";

interface ExtractedItem {
  type: string;
  title: string;
  desc: string;
}

interface PostRecordingScreenProps {
  extractedItems: ExtractedItem[];
  onConfirm: () => void;
}

export default function PostRecordingScreen({ extractedItems, onConfirm }: PostRecordingScreenProps) {
  return (
    <div style={styles.container}>
      <div style={styles.contentBox}>
        <span style={styles.badge}>INTERVENTION LOG</span>
        <h2 style={styles.title}>참견이가<br />몇 가지 주워갔어. 👀</h2>
        <p style={styles.subTitle}>이건 기억해둘게.</p>

        <div style={styles.itemCardList}>
          {extractedItems.map((item, idx) => (
            <div key={idx} className="tactile-lift-in" style={styles.itemCard}>
              <span style={styles.itemType}>{item.type}</span>
              <div style={styles.itemContent}>
                <strong>{item.title}</strong> — {item.desc}
              </div>
            </div>
          ))}
        </div>

        <button className={TACTILE_PRESS_CLASS} style={styles.ctaButton} onClick={onConfirm}>
          확인, 구경하러 가기 →
        </button>
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
    justifyContent: "center",
    alignItems: "center",
    padding: "24px",
    boxSizing: "border-box",
  },
  contentBox: {
    width: "100%",
    maxWidth: "380px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  badge: {
    ...tactile.badge,
    fontSize: "10px",
    fontWeight: 700,
    padding: "2px 8px",
    alignSelf: "flex-start",
  },
  title: {
    fontSize: "30px",
    fontWeight: 800,
    lineHeight: "1.25",
    margin: 0,
    color: BRAND.ink,
  },
  subTitle: {
    fontSize: "14px",
    color: inkAlpha.muted,
    margin: "-8px 0 10px 0",
    fontWeight: 500,
  },
  itemCardList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  itemCard: {
    ...tactile.card,
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  itemType: {
    fontSize: "10px",
    fontWeight: 700,
    color: BRAND.lavenderDeep,
  },
  itemContent: {
    fontSize: "14px",
    fontWeight: 500,
    color: BRAND.ink,
  },
  ctaButton: {
    width: "100%",
    ...tactile.primaryButton,
    padding: "16px",
    ...typography.ctaLabel,
    marginTop: "10px",
  },
};
