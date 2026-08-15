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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.start();
    mediaRecorderRef.current = recorder;
    setPhase("recording");
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const recorder = mediaRecorderRef.current!;
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
        <button style={styles.micButton} onClick={start} aria-label="말하기">🎙️</button>
        <p style={styles.mainCopy}>준비됐으면 말해보세요.</p>
        <p style={styles.subCopy}>10초든 5분이든 상관없어요.{"\n"}생각나는 대로.</p>
      </div>
    );
  }

  if (phase === "recording") {
    return (
      <div style={styles.container}>
        <p style={styles.timer}>{formatTime(seconds)}</p>
        <button style={styles.recordingButton} onClick={stop} aria-label="녹음 종료">🔴</button>
        <p style={styles.mainCopy}>듣고 있어요.</p>
        <p style={styles.subCopy}>생각나는 대로 말하세요.{"\n"}정리해서 말할 필요 없어요.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <p style={styles.mainCopy}>잘 들었습니다.</p>
    </div>
  );
}

function formatTime(s: number) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px", textAlign: "center" },
  timer: { color: "#fff", fontSize: 32, marginBottom: 24, fontVariantNumeric: "tabular-nums" },
  micButton: { width: 120, height: 120, borderRadius: "50%", border: "none", background: "linear-gradient(135deg,#ff5f6d,#ffc371)", fontSize: 48, marginBottom: 32, cursor: "pointer" },
  recordingButton: { width: 120, height: 120, borderRadius: "50%", border: "none", background: "#ff3b30", fontSize: 40, marginBottom: 32, cursor: "pointer" },
  mainCopy: { color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 8 },
  subCopy: { color: "#999", fontSize: 14, whiteSpace: "pre-line", lineHeight: 1.5 },
};
