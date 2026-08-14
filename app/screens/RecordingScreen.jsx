// frontend/screens/RecordingScreen.jsx
import { useRef, useState } from "react";

export default function RecordingScreen({ onFinish }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const stop = () => {
    clearInterval(timerRef.current);
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      onFinish(blob);
    };
    setRecording(false);
  };

  return (
    <div style={styles.container}>
      <p style={styles.timer}>{formatTime(seconds)}</p>
      <button
        style={{ ...styles.micButton, background: recording ? "#ff3b30" : "#ff5f6d" }}
        onClick={recording ? stop : start}
      >
        {recording ? "■" : "🎤"}
      </button>
      <p style={styles.hint}>{recording ? "말 다 했으면 눌러서 끝내기" : "눌러서 녹음 시작"}</p>
    </div>
  );
}

function formatTime(s) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  },
  timer: { color: "#fff", fontSize: 32, marginBottom: 32, fontVariantNumeric: "tabular-nums" },
  micButton: {
    width: 120,
    height: 120,
    borderRadius: "50%",
    border: "none",
    fontSize: 40,
    color: "#fff",
    cursor: "pointer",
  },
  hint: { color: "#999", marginTop: 24, fontSize: 14 },
};
