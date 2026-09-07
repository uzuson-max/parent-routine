"use client";

import { useState } from "react";
import { BRAND, textAlpha, texturedSkyBackground } from "@/lib/theme";

interface MicPermissionScreenProps {
  // granted: 실제 브라우저 마이크 권한이 허용됐는지 여부. 거부되어도 앱은 계속 진행시키고
  // (텍스트 입력으로도 첫 대화를 할 수 있으므로) 이 값은 이후 화면 문구 참고용으로만 쓰인다.
  onNext: (granted: boolean) => void;
}

type Phase = "explain" | "requesting" | "denied";

export default function MicPermissionScreen({ onNext }: MicPermissionScreenProps) {
  const [phase, setPhase] = useState<Phase>("explain");

  const requestPermission = async () => {
    setPhase("requesting");
    try {
      // 여기서 실제 브라우저/OS 마이크 권한 프롬프트를 띄운다.
      // 이미 허용된 상태라면 브라우저가 다시 묻지 않고 바로 스트림을 준다.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 권한 확인이 목적이므로 트랙은 바로 정리한다 — 실제 녹음은 RecordingScreen에서 새로 시작한다.
      stream.getTracks().forEach((t) => t.stop());
      onNext(true);
    } catch (e) {
      setPhase("denied");
    }
  };

  if (phase === "denied") {
    return (
      <div style={styles.container}>
        <div style={styles.contentWrapper}>
          <h1 style={styles.headline}>괜찮아.</h1>
          <p style={styles.subhead}>
            나중에 말할 때 다시 물어볼게.{"\n"}그때까지는 타이핑으로 해도 돼.
          </p>
        </div>
        <button style={styles.ctaButton} onClick={() => onNext(false)}>
          일단 가보자
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.contentWrapper}>
        <h1 style={styles.headline}>
          참견이가 니 말을 들으려면{"\n"}마이크가 필요해.
        </h1>
        <p style={styles.subhead}>말할 때만 사용할 거야.</p>
      </div>
      <button style={styles.ctaButton} onClick={requestPermission} disabled={phase === "requesting"}>
        {phase === "requesting" ? "물어보는 중..." : "그럼 물어볼게"}
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
  headline: { color: BRAND.text, fontSize: "28px", fontWeight: 900, margin: 0, lineHeight: 1.35, whiteSpace: "pre-line" },
  subhead: { color: textAlpha.soft, fontSize: "15px", fontWeight: 700, margin: 0, whiteSpace: "pre-line", lineHeight: 1.5 },
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
