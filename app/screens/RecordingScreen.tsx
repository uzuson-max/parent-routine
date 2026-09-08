
import { useEffect, useRef, useState } from "react";
import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";
import { IconMic, IconMore } from "@/components/icons";

interface RecordingScreenProps {
  initialTopic?: string;
  onFinish: (input: Blob | string) => void;
}

export default function RecordingScreen({ initialTopic, onFinish }: RecordingScreenProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [textValue, setTextValue] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 녹음이 끝난 뒤(혹은 컴포넌트가 언마운트될 때) 마이크 스트림을 반드시 해제하기 위한 참조.
  // 이전 스트림을 stop() 하지 않고 두면 트랙이 계속 살아있는 채로 다음 녹음이 새 getUserMedia를
  // 또 호출하게 되어, 브라우저/OS에 따라 마이크 권한이 매번 다시 뜨는 것처럼 보이는 원인이 된다.
  const streamRef = useRef<MediaStream | null>(null);
  // start()가 완료되기 전에 heroBox를 연속 클릭하면 getUserMedia가 중복 호출될 수 있어 가드한다.
  const startingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const start = async () => {
    if (startingRef.current || isRecording) return;
    startingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
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
    } finally {
      startingRef.current = false;
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    recorder.stop();
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      // 녹음이 끝났으니 마이크 트랙을 즉시 해제 — 다음 녹음 때 깨끗한 상태에서 다시 요청한다.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsRecording(false);
      onFinish(blob);
    };
  };

  const submitText = () => {
    const trimmed = textValue.trim();
    if (!trimmed) return;
    onFinish(trimmed);
  };

  if (mode === "text") {
    return (
      <div style={styles.container}>
        <div style={styles.contentWrapper}>
          <div style={styles.topBar}>
            <div style={styles.topicBadge}>
              {initialTopic ? `"${initialTopic}"` : "생각 남기기"}
            </div>
            <button
              style={styles.modeToggleButton}
              onClick={() => setMode("voice")}
              aria-label="음성 입력으로 전환"
              title="음성으로 말할래"
            >
              <IconMic style={{ width: 18, height: 18, color: BRAND.ink }} />
            </button>
          </div>

          <textarea
            style={styles.textarea}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder="그냥 생각나는 대로 써도 돼."
            autoFocus
          />

          <button
            style={{ ...styles.recordingButton, ...(textValue.trim() ? {} : styles.disabledButton) }}
            onClick={submitText}
            disabled={!textValue.trim()}
          >
            보내기
          </button>
          <p style={styles.subCopy}>정리 안 해도 됨. 짧아도 됨.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.contentWrapper}>
        <div style={styles.topBar}>
          <div style={styles.topicBadge}>
            {initialTopic ? `"${initialTopic}"` : "생각 털어놓기"}
          </div>
          {!isRecording && (
            <button
              style={styles.modeToggleButton}
              onClick={() => setMode("text")}
              aria-label="텍스트 입력으로 전환"
              title="타이핑으로 남길래"
            >
              <IconMore style={{ width: 18, height: 18, color: BRAND.ink }} />
            </button>
          )}
        </div>

        {isRecording && (
          <div style={styles.listeningTag}>
            <span style={styles.recDot} />
            듣는 중
          </div>
        )}

        {!isRecording ? (
          <button style={styles.heroBox} onClick={start} aria-label="말하기 시작">
            <IconMic style={{ width: 44, height: 44, color: "#fff" }} />
          </button>
        ) : (
          <div style={styles.timerBox}>
            {formatTime(seconds)}
          </div>
        )}

        {isRecording ? (
          <>
            <button style={styles.stopButton} onClick={stop}>
              그만 말할래
            </button>
            <p style={styles.mainCopy}>응, 듣고 있어</p>
            <p style={styles.subCopy}>정리 안 해도 됨. 중간에 생각 바뀌어도 됨</p>
          </>
        ) : (
          <>
            <p style={styles.mainCopy}>생각나는 대로 해도 돼</p>
            <p style={styles.subCopy}>횡설수설해도 됨. 참견이는 알아듣거든~</p>
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
  container: { minHeight: "100vh", ...pageBackground, color: BRAND.ink, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "24px" },
  contentWrapper: { width: "100%", maxWidth: "380px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "20px" },
  topBar: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  topicBadge: { background: BRAND.lavenderPale, color: BRAND.lavenderDeep, padding: "8px 14px", borderRadius: "20px", fontSize: "13px", fontWeight: "900", border: `1.5px solid ${BRAND.lavenderDeep}` },
  modeToggleButton: { background: BRAND.card, color: BRAND.ink, border: "2px solid #111", borderRadius: "50%", width: "40px", height: "40px", fontSize: "18px", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  listeningTag: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "900", color: BRAND.lavenderDeep, letterSpacing: "0.5px" },
  recDot: { width: "8px", height: "8px", borderRadius: "50%", background: "#F04848" },
  heroBox: {
    width: "148px",
    height: "148px",
    borderRadius: "50%",
    border: "3px solid #111",
    background: BRAND.lavender,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "5px 5px 0px #111",
    padding: 0,
  },
  timerBox: { fontSize: "48px", fontWeight: "900", color: BRAND.ink, letterSpacing: "4px", margin: "16px 0" },
  textarea: { width: "100%", minHeight: "180px", padding: "16px", border: "2px solid #111", borderRadius: "16px", background: BRAND.card, color: BRAND.ink, fontSize: "16px", fontWeight: "600", boxShadow: "3px 3px 0px rgba(30,26,38,0.12)", resize: "vertical", fontFamily: "inherit" },
  recordingButton: { width: "100%", padding: "16px", border: "3px solid #111", borderRadius: "18px", background: BRAND.lavender, color: "#fff", fontSize: "16px", fontWeight: "900", cursor: "pointer", boxShadow: "4px 4px 0px #111" },
  stopButton: { width: "100%", padding: "14px", border: "2px solid #111", borderRadius: "16px", background: BRAND.card, color: BRAND.ink, fontSize: "15px", fontWeight: "900", cursor: "pointer", boxShadow: "3px 3px 0px rgba(30,26,38,0.12)" },
  disabledButton: { opacity: 0.5, cursor: "not-allowed" },
  mainCopy: { color: BRAND.ink, fontSize: "18px", fontWeight: "900", margin: 0 },
  subCopy: { color: inkAlpha.muted, fontSize: "13px", margin: 0 },
};
