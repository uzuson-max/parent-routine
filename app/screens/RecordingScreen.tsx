

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { BRAND, inkAlpha, pageBackground, radius, shadow, border, tactile, typography, TACTILE_PRESS_CLASS } from "@/lib/theme";
import { IconMic, IconMore } from "@/components/icons";

interface RecordingScreenProps {
  initialTopic?: string;
  onFinish: (input: Blob | string) => void;
}

// 녹음 중 상태를 텍스트 타이머 하나로만 보여주던 것 대신, 듣고 있다는 걸 시각적으로
// 표현하는 작은 waveform. 실제 입력 레벨을 분석하지 않고(별도 오디오 분석 파이프라인 없이도)
// 각 바가 서로 다른 딜레이로 오르내리게 해서 "말하는 리듬"처럼 보이게 한다.
function Waveform({ color }: { color: string }) {
  const bars = [0, 120, 60, 200, 40, 160, 90];
  return (
    <div style={styles.waveform} aria-hidden>
      {bars.map((delay, i) => (
        <span
          key={i}
          className="tactile-wave-bar"
          style={{
            ...styles.waveBar,
            background: color,
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </div>
  );
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

  // initialTopic은 지금 이 화면에서는 항상 하나의 의미만 가진다 — 홈에서 참견이가 먼저 던진
  // proactive callback(대답하기)으로 들어왔을 때만 채워진다. 그냥 새 녹음을 시작하는 화면처럼
  // 보이지 않도록, 이 문장이 "참견이가 방금 한 말"이라는 걸 짧게 티내준다 (새 화면/레이아웃 변경 없음).
  const isReplyingToGanseobi = Boolean(initialTopic);

  if (mode === "text") {
    return (
      <div style={styles.container}>
        <div style={styles.contentWrapper}>
          {isReplyingToGanseobi && <span style={styles.replyStamp}>참견이한테 대답하는 중</span>}
          <div style={styles.topBar}>
            <div style={styles.topicBadge}>
              {initialTopic ? `참견이: "${initialTopic}"` : "생각 남기기"}
            </div>
            <button
              className={TACTILE_PRESS_CLASS}
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
            className={TACTILE_PRESS_CLASS}
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
        {isReplyingToGanseobi && <span style={styles.replyStamp}>참견이한테 대답하는 중</span>}
        <div style={styles.topBar}>
          <div style={styles.topicBadge}>
            {initialTopic ? `참견이: "${initialTopic}"` : "생각 털어놓기"}
          </div>
          {!isRecording && (
            <button
              className={TACTILE_PRESS_CLASS}
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
          <button className={TACTILE_PRESS_CLASS} style={styles.heroBox} onClick={start} aria-label="말하기 시작">
            <span style={styles.heroBoxHighlight} />
            <IconMic style={{ width: 40, height: 40, color: "#fff", position: "relative" }} />
          </button>
        ) : (
          <div className="tactile-breathe" style={styles.heroBoxRecording}>
            <span style={styles.heroBoxHighlight} />
            <Waveform color="rgba(255,255,255,0.92)" />
            <span style={styles.timerText}>{formatTime(seconds)}</span>
          </div>
        )}

        {isRecording ? (
          <>
            <button className={TACTILE_PRESS_CLASS} style={styles.stopButton} onClick={stop}>
              그만 말할래
            </button>
            <p style={styles.mainCopy}>응, 듣고 있어</p>
            <p style={styles.subCopy}>정리 안 해도 됨. 중간에 생각 바뀌어도 됨</p>
          </>
        ) : (
          <>
            <p style={styles.mainCopy}>{isReplyingToGanseobi ? "말해서 대답해줘" : "생각나는 대로 해도 돼"}</p>
            <p style={styles.subCopy}>{isReplyingToGanseobi ? "짧게 툭 던져도 됨. 참견이는 알아듣거든~" : "횡설수설해도 됨. 참견이는 알아듣거든~"}</p>
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

const heroBoxBase: CSSProperties = {
  width: "144px",
  height: "144px",
  borderRadius: "50%", // 마이크 버튼은 브리핑이 지목한 유일한 "의도된 원형" 오브젝트로 남긴다
  border: border.onLavender,
  background: `radial-gradient(circle at 35% 28%, ${BRAND.lavenderSoft} 0%, ${BRAND.lavender} 62%, ${BRAND.lavenderDeep} 100%)`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  boxShadow: shadow.lavender,
  padding: 0,
  position: "relative",
  overflow: "hidden",
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", ...pageBackground, color: BRAND.ink, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "24px" },
  contentWrapper: { width: "100%", maxWidth: "380px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "20px" },
  topBar: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  topicBadge: { ...tactile.badge, padding: "8px 14px", fontSize: "13px", fontWeight: 700 },
  // TimelineScreen의 "참견이 등장." 스탬프와 같은 시각 언어(캐릭터 전용 스티커 스타일) 재사용 —
  // 새 스타일 시스템을 만들지 않고 기존 것만 가져다 쓴다. 이 스탬프만은 브리핑 4번 예외를 적용한다.
  replyStamp: { ...tactile.stamp, alignSelf: "flex-start", padding: "4px 10px", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px" },
  modeToggleButton: { ...tactile.secondaryButton, borderRadius: "50%", width: "40px", height: "40px", fontSize: "18px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  listeningTag: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: BRAND.lavenderDeep, letterSpacing: "0.3px" },
  recDot: { width: "8px", height: "8px", borderRadius: "50%", background: "#E2604F" },
  heroBox: heroBoxBase,
  heroBoxRecording: { ...heroBoxBase, cursor: "default", gap: "6px" },
  heroBoxHighlight: {
    position: "absolute",
    top: "8%",
    left: "18%",
    width: "38%",
    height: "22%",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.30)",
    filter: "blur(2px)",
  },
  waveform: { display: "flex", alignItems: "center", gap: "3px", height: "26px", position: "relative" },
  waveBar: { width: "3px", height: "100%", borderRadius: "2px" },
  timerText: { fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "1px", position: "relative" },
  textarea: { width: "100%", minHeight: "180px", padding: "16px", ...tactile.input, fontSize: "16px", fontWeight: 500, resize: "vertical", fontFamily: "inherit" },
  recordingButton: { width: "100%", padding: "16px", ...tactile.primaryButton, ...typography.ctaLabel },
  stopButton: { width: "100%", padding: "14px", ...tactile.secondaryButton, fontSize: "15px", fontWeight: 700 },
  disabledButton: { opacity: 0.45, cursor: "not-allowed" },
  mainCopy: { color: BRAND.ink, fontSize: "18px", fontWeight: 700, margin: 0 },
  subCopy: { color: inkAlpha.muted, fontSize: "13px", margin: 0 },
};
