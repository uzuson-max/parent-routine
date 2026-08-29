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
        <div style={styles.card}>
          <div style={styles.headerTag}>🎙️ GANSEOBI_REC.exe</div>
          <div style={styles.contentArea}>
            <p style={styles.mainCopy}>지금 생각나는 대로 말해보세요.</p>
            <p style={styles.subCopy}>잘 말하려고 하지 않아도 됩니다.</p>
          </div>
          <button style={styles.micButton} onClick={start} aria-label="말하기">
            🎙
          </button>
        </div>
      </div>
    );
  }

  if (phase === "recording") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.headerTag}>🔴 REC RUNNING...</div>
          <div style={styles.contentArea}>
            <p style={styles.timer}>{formatTime(seconds)}</p>
            <p style={styles.mainCopy}>듣고 있어요.</p>
            <p style={styles.subCopy}>생각나는 대로 말하세요.{"\n"}정리해서 말할 필요 없어요.</p>
          </div>
          <button style={styles.recordingButton} onClick={stop} aria-label="녹음 종료">
            ■ 종료
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
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
    background: "#F9F6F0", // 따뜻한 크림지 미색
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center", // 오타 수정 완료
    padding: "0 20px",
    fontFamily: "monospace, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "380px",
    background: "#FFF",
    border: "3px solid #1E1E1E",
    boxShadow: "6px 6px 0px #1E1E1E",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "20px",
  },
  headerTag: {
    background: "#1E1E1E",
    color: "#FFF",
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: "bold",
    letterSpacing: "1px",
    alignSelf: "flex-start",
  },
  contentArea: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
  },
  timer: {
    color: "#FF5C35",
    fontSize: "40px",
    fontWeight: "900",
    marginBottom: "8px",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "2px",
  },
  micButton: {
    width: "100px",
    height: "100px",
    borderRadius: "50%",
    border: "3px solid #1E1E1E",
    background: "#FF5C35",
    color: "#FFF",
    fontSize: "36px",
    cursor: "pointer",
    boxShadow: "3px 3px 0px #1E1E1E",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  recordingButton: {
    width: "100%",
    padding: "14px",
    borderRadius: "0px",
    border: "3px solid #1E1E1E",
    background: "#1E1E1E",
    color: "#FF5C35",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "3px 3px 0px #FF5C35",
  },
  mainCopy: {
    color: "#1E1E1E",
    fontSize: "18px",
    fontWeight: "bold",
    marginBottom: "4px",
  },
  subCopy: {
    color: "#666",
    fontSize: "13px",
    whiteSpace: "pre-line",
    lineHeight: "1.4",
  },
};
