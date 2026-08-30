// app/screens/RecordingScreen.tsx (전체)
"use client";

import { useRef, useState } from "react";

interface RecordingScreenProps {
  initialTopic?: string;
  onFinish: (blob: Blob) => void;
}

export default function RecordingScreen({ initialTopic, onFinish }: RecordingScreenProps) {
  const [isRecording, setIsRecording] = useState(false);
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
      setIsRecording(true);
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
      onFinish(blob);
    };
  };

  return (
    <div style={styles.container}>
      <div style={styles.contentWrapper}>
        <div style={styles.topicBadge}>
          🎯 {initialTopic ? `"${initialTopic}"` : "생각 털어놓기"}
        </div>

        {isRecording && <div style={styles.brandTitle}>● 듣는 중</div>}

        {!isRecording ? (
          <div style={styles.heroBox} onClick={start}>
            <span style={styles.micIcon}>🎙</span>
          </div>
        ) : (
          <div style={styles.timerBox}>
            {formatTime(seconds)}
          </div>
        )}

        {isRecording ? (
          <>
            <button style={styles.recordingButton} onClick={stop}>
              ■ 그만 말할래
            </button>
            <p style={styles.mainCopy}>듣고 있어.</p>
            <p style={styles.subCopy}>정리해서 말할 필요 없어. 욕해도 됨.</p>
          </>
        ) : (
          <>
            <p style={styles.mainCopy}>마이크를 누르고 털어놔봐.</p>
            <p style={styles.subCopy}>앞뒤 안 맞아도 상관없어.</p>
          </>
        )}
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
  container: { minHeight: "100vh", background: "#C71585", color: "#E5FF5D", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "24px" },
  contentWrapper: { width: "100%", maxWidth: "380px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "20px" },
  topicBadge: { background: "#E5FF5D", color: "#C71585", padding: "8px 14px", fontSize: "14px", fontWeight: "900", border: "2px solid #111", boxShadow: "3px 3px 0px #111", marginBottom: "4px" },
  brandTitle: { fontSize: "13px", fontWeight: "700", color: "#E5FF5D", width: "100%" },
  heroBox: { width: "140px", height: "140px", borderRadius: "50%", border: "3px solid #E5FF5D", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 0 20px rgba(229, 255, 93, 0.3)" },
  micIcon: { fontSize: "48px" },
  timerBox: { fontSize: "48px", fontWeight: "900", color: "#E5FF5D", letterSpacing: "4px", margin: "16px 0" },
  recordingButton: { width: "100%", padding: "16px", border: "2px solid #111", background: "#E5FF5D", color: "#C71585", fontSize: "16px", fontWeight: "900", cursor: "pointer", boxShadow: "3px 3px 0px #111" },
  mainCopy: { color: "#FFF", fontSize: "18px", fontWeight: "900", margin: 0 },
  subCopy: { color: "rgba(255, 255, 255, 0.7)", fontSize: "13px", margin: 0 },
};
