"use client";

import { useState, useRef } from "react";

interface RecordingScreenProps {
  onFinish: (blob: Blob) => void;
}

export default function RecordingScreen({ onFinish }: RecordingScreenProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        onFinish(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } catch (e) {
      alert("마이크 권한이 필요해!");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={headerTag}>🎙️ GANSEOBI_REC.exe</div>

        <div style={contentArea}>
          <p style={guideText}>
            {isRecording ? "속 시원하게 털어놔봐. 다 듣고 있다." : "오늘 어떤 핑계를 대고 싶어?"}
          </p>

          <div style={timerBox}>
            {isRecording ? formatTime(seconds) : "00:00"}
          </div>

          <div style={tapeDecoration}>
            {isRecording ? "▶ REC RUNNING..." : "■ READY TO RECORD"}
          </div>
        </div>

        <div style={buttonArea}>
          {!isRecording ? (
            <button style={retroButtonPrimary} onClick={startRecording}>
              녹음 시작하기
            </button>
          ) : (
            <button style={retroButtonDanger} onClick={stopRecording}>
              그만 말할래 (제출)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#F9F6F0", // 따뜻한 미색 크림지 (Option A 무드)
  color: "#1E1E1E",
  display: "flex",
  flexDirection: "column",
  alignItem: "center",
  justifyContent: "center",
  padding: "20px",
  fontFamily: "monospace, sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "400px",
  background: "#FFF",
  border: "3px solid #1E1E1E",
  boxShadow: "6px 6px 0px #1E1E1E", // Y2K 특유의 하드한 그림자
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
};

const headerTag: React.CSSProperties = {
  background: "#1E1E1E",
  color: "#FFF",
  padding: "6px 12px",
  fontSize: "12px",
  fontWeight: "bold",
  letterSpacing: "1px",
  alignSelf: "flex-start",
};

const contentArea: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "16px",
  textAlign: "center",
  padding: "20px 0",
};

const guideText: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: "bold",
  lineHeight: "1.4",
};

const timerBox: React.CSSProperties = {
  fontSize: "42px",
  fontWeight: "900",
  letterSpacing: "2px",
  color: "#FF5C35", // 포인트 팝 오렌지
  margin: "10px 0",
};

const tapeDecoration: React.CSSProperties = {
  fontSize: "11px",
  color: "#666",
  background: "#eee",
  padding: "4px 8px",
  border: "1px dashed #999",
};

const buttonArea: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const retroButtonPrimary: React.CSSProperties = {
  background: "#FF5C35",
  color: "#FFF",
  border: "2px solid #1E1E1E",
  boxShadow: "3px 3px 0px #1E1E1E",
  padding: "16px",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
  textAlign: "center",
};

const retroButtonDanger: React.CSSProperties = {
  background: "#111",
  color: "#FF5C35",
  border: "2px solid #1E1E1E",
  boxShadow: "3px 3px 0px #FF5C35",
  padding: "16px",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
  textAlign: "center",
};
