"use client";

import { useRef, useState } from "react";

type Phase = "idle" | "recording" | "finished";

export default function RecordingScreen({ onFinish }: { onFinish: (blob: Blob) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.start();
      mediaRecorderRef.current = recorder;
      setPhase("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      alert("마이크 권한이 필요해!");
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    recorder.stop();
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      setPhase("finished");
      setTimeout(() => onFinish(blob), 900);
    };
  };

  if (phase === "idle") {
    return (
      <div style={styles.container}>
        <div style={styles.contentWrapper}>
          <div style={styles.brandTitle}>GANSEOBI_REC</div>
          <div style={styles.heroBox} onClick={start}>
            <span style={styles.micIcon}>🎙</span>
            <div style={styles.circleTextOverlay}>CLICK TO TALK</div>
          </div>
          <p style={styles.mainCopy}>지금 생각나는 대로 말해보세요.</p>
          <p style={styles.subCopy}>잘 말하려고 하지 않아도 됩니다.</p>
        </div>
      </div>
    );
  }

  if (phase === "recording") {
    return (
      <div style={styles.container}>
        <div style={styles.contentWrapper}>
          <div style={styles.brandTitle}>REC RUNNING...</div>
          <div style={styles.timerBox}>
            {formatTime(seconds)}
          </div>
          <button style={styles.recordingButton} onClick={stop}>
            ■ 그만 말할래
          </button>
          <p style={styles.mainCopy}>듣고 있어요.</p>
          <p style={styles.subCopy}>정리해서 말할 필요 없어요.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.contentWrapper}>
        <p style={styles.mainCopy}>잘 들었습니다.</p>
        <p style={styles.subCopy}>잠시만 기다려봐.</p>
      </div>
    </div>
  );
}

function formatTime(s: number) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    background: "#C71585", // 레퍼런스의 쨍한 마젠타 핑크
    color: "#E5FF5D", // 네온 연두/레몬 포인트 컬러
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: "24px",
    fontFamily: "monospace, sans-serif",
  },
  contentWrapper: {
    width: "100%",
    maxWidth: "380px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "24px",
  },
  brandTitle: {
    fontSize: "14px",
    letterSpacing: "3px",
    fontWeight: "900",
    color: "#E5FF5D",
    borderBottom: "2px dashed #E5FF5D",
    paddingBottom: "8px",
    width: "100%",
  },
  heroBox: {
    width: "160px",
    height: "160px",
    borderRadius: "50%",
    border: "3px solid #E5FF5D",
    background: "transparent",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    position: "relative",
    boxShadow: "0 0 20px rgba(229, 255, 93, 0.3)",
    transition: "transform 0.1s ease",
  },
  micIcon: {
    fontSize: "56px",
  },
  circleTextOverlay: {
    fontSize: "10px",
    fontWeight: "bold",
    color: "#FFF",
    letterSpacing: "1px",
    marginTop: "-4px",
  },
  timerBox: {
    fontSize: "56px",
    fontWeight: "900",
    color: "#E5FF5D",
    letterSpacing: "4px",
    fontVariantNumeric: "tabular-nums",
    margin: "10px 0",
  },
  recordingButton: {
    width: "100%",
    padding: "16px",
    borderRadius: "0px",
    border: "2px solid #E5FF5D",
    background: "#E5FF5D",
    color: "#C71585",
    fontSize: "16px",
    fontWeight: "900",
    cursor: "pointer",
    letterSpacing: "1px",
  },
  mainCopy: {
    color: "#FFF",
    fontSize: "20px",
    fontWeight: "900",
    letterSpacing: "-0.5px",
    margin: 0,
  },
  subCopy: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: "13px",
    lineHeight: "1.4",
    margin: 0,
  },
};
