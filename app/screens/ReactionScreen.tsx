

"use client";

import { BRAND, inkAlpha, pageBackground, tactile, typography, TACTILE_PRESS_CLASS } from "@/lib/theme";

interface ReactionScreenProps {
  onHome: () => void;
}

export default function ReactionScreen({ onHome }: ReactionScreenProps) {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.headerTag}>GANSEOBI NOTE</div>
        <p style={styles.mainCopy}>잘 들었어.</p>
        <p style={styles.subCopy}>
          일단 접수해둠.<br />
          나중에 또 딴소리하면 그때 잡아낸다.
        </p>
        <button className={TACTILE_PRESS_CLASS} style={styles.ctaButton} onClick={onHome}>
          닫기 (생각나면 또 와)
        </button>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    ...pageBackground,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
  },
  card: {
    width: "100%",
    maxWidth: "380px",
    ...tactile.card,
    padding: "32px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "20px",
  },
  headerTag: {
    ...tactile.badge,
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: 700,
    alignSelf: "flex-start",
  },
  mainCopy: {
    color: BRAND.ink,
    fontSize: "22px",
    fontWeight: 800,
    margin: 0,
  },
  subCopy: {
    color: inkAlpha.muted,
    fontSize: "14px",
    lineHeight: "1.5",
    margin: 0,
    fontWeight: 500,
  },
  ctaButton: {
    width: "100%",
    ...tactile.primaryButton,
    padding: "14px",
    ...typography.ctaLabel,
    fontSize: "15px",
    marginTop: "10px",
  },
};
