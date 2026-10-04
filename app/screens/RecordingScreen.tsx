
"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { BRAND, inkAlpha, pageBackground, radius, shadow, border, tactile, typography, TACTILE_PRESS_CLASS } from "@/lib/theme";
import { IconMic, IconMore } from "@/components/icons";
import { acquireMicStream } from "@/lib/micStream";
import { playFx } from "@/lib/fx";

interface RecordingScreenProps {
  initialTopic?: string;
  onFinish: (input: Blob | string) => void;
  // true면 화면이 뜨자마자 바로 녹음을 시작한다 (홈 마이크 / ＋ 더 이야기하기).
  // 중간 안내 화면 없이 "누르면 바로 듣고 있음" 상태가 되게 하기 위함.
  autoStart?: boolean;
  // 빈 녹음 안내 화면의 [홈으로]. 업로드/분석 없이 그냥 녹음 화면만 닫는다.
  onCancel?: () => void;
}

// 이보다 짧게 녹음하고 멈추면 "실수로 바로 멈춘 것"으로 보고 업로드/STT/분석으로 보내지 않는다.
const MIN_RECORDING_MS = 800;

// 무음 녹음 판정 — 말소리를 "알아듣는" 게 아니라, 실제로 소리가 들어왔는지만 본다.
// Whisper는 무음을 받으면 "MBC 뉴스 ○○○입니다" 같은 문장을 지어내기 때문에, 녹음 시간이 길어도
// 입력이 거의 없었으면 서버로 보내지 않는다.
//   - METER_INTERVAL_MS마다 입력 음량(RMS, 0~1)을 잰다.
//   - INPUT_RMS_THRESHOLD(약 -36dBFS)를 넘은 시간을 합쳐서 MIN_INPUT_MS 이상이면 "소리가 있었던 녹음".
// 음량 측정이 안 되는 환경(AudioContext 미지원/초기화 실패/suspended 상태로 측정이 안 됨)에서는
// 이 판정을 건너뛰고 기존 정상 녹음 경로를 그대로 탄다.
const METER_INTERVAL_MS = 50;
const INPUT_RMS_THRESHOLD = 0.015;
const MIN_INPUT_MS = 150;
// 녹음 시작 직후 이 시간 동안은 음량을 세지 않는다 — 마이크 시작 효과음(lib/fx.ts)이
// 스피커→마이크로 다시 들어와서 무음 녹음이 "소리 있음"으로 판정되는 걸 막기 위함.
const METER_WARMUP_MS = 200;

type InputMeter = {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  timer: ReturnType<typeof setInterval>;
  samples: number; // 실제로 측정에 성공한 횟수
  maxRms: number; // 측정 중 가장 큰 음량 — 계속 정확히 0이면 측정 경로가 죽은 것으로 본다
  inputMs: number; // 기준 음량을 넘은 시간 합계
};

function startInputMeter(stream: MediaStream): InputMeter | null {
  try {
    const Ctx: typeof AudioContext | undefined =
      typeof window !== "undefined" ? window.AudioContext || (window as any).webkitAudioContext : undefined;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser); // destination에는 연결하지 않는다 — 스피커로 소리가 나가지 않음
    const buf = new Float32Array(analyser.fftSize);
    const meter: InputMeter = { ctx, source, timer: 0 as any, samples: 0, maxRms: 0, inputMs: 0 };
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const startedAt = Date.now();
    meter.timer = setInterval(() => {
      if (ctx.state !== "running") return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      meter.samples += 1;
      if (rms > meter.maxRms) meter.maxRms = rms;
      if (Date.now() - startedAt < METER_WARMUP_MS) return;
      if (rms >= INPUT_RMS_THRESHOLD) meter.inputMs += METER_INTERVAL_MS;
    }, METER_INTERVAL_MS);
    return meter;
  } catch {
    return null;
  }
}

function stopInputMeter(meter: InputMeter | null) {
  if (!meter) return;
  clearInterval(meter.timer);
  // 마이크 트랙은 lib/micStream.ts 소유라 끄지 않는다 — 측정용 연결과 AudioContext만 정리.
  try { meter.source.disconnect(); } catch {}
  meter.ctx.close().catch(() => {});
}

// 측정이 실제로 동작했는지: 충분히 여러 번 쟀고, 신호가 한 번이라도 0이 아니었어야 한다.
// (실제 마이크는 조용해도 아주 작은 잡음이 있다 — 끝까지 정확히 0이면 측정 경로 이상으로 보고 판정을 건너뛴다.)
function meterIsReliable(meter: InputMeter | null): meter is InputMeter {
  return !!meter && meter.samples >= 5 && meter.maxRms > 0;
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

export default function RecordingScreen({ initialTopic, onFinish, autoStart, onCancel }: RecordingScreenProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [textValue, setTextValue] = useState("");
  const [micFailed, setMicFailed] = useState(false);
  // 자동 시작을 시도하는 그 짧은 순간에만 true — 그동안 "눌러서 시작" 안내가 깜빡 보이지 않게.
  const [autoStarting, setAutoStarting] = useState(Boolean(autoStart));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // start()가 완료되기 전에 연속 클릭하면 녹음이 중복 시작될 수 있어 가드한다.
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  // 텍스트 모드로 바꾸면서 녹음을 버릴 때는 onFinish(업로드)로 넘기지 않는다.
  const discardRef = useRef(false);
  const autoStartedRef = useRef(false);
  // 빈 녹음 판정용 — recorder.start() 직전 시각(ms).
  const startedAtRef = useRef(0);
  // 무음 판정용 입력 음량 측정기 — 녹음 한 번마다 새로 만들고 끝나면 정리한다.
  const meterRef = useRef<InputMeter | null>(null);
  // true = 방금 녹음이 비어 있어서 업로드하지 않고 이 화면 안에서 안내 중.
  const [emptyNotice, setEmptyNotice] = useState(false);

  // 마이크 스트림은 lib/micStream.ts가 대화 루프 내내 들고 있다. 여기서는 녹음기(MediaRecorder)만
  // 정리하고 트랙은 끄지 않는다 — 끄면 ＋ 더 이야기하기 때 iOS에서 권한 팝업이 다시 뜰 수 있다.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopInputMeter(meterRef.current);
      meterRef.current = null;
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        discardRef.current = true;
        try { rec.stop(); } catch {}
      }
    };
  }, []);

  const start = async () => {
    if (startingRef.current || isRecording) return;
    startingRef.current = true;
    try {
      const stream = await acquireMicStream();
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      discardRef.current = false;
      stoppingRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        const meter = meterRef.current;
        meterRef.current = null;
        stopInputMeter(meter);
        setIsRecording(false);
        if (discardRef.current) return;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // 빈 녹음(즉시 중지 / 데이터 없음 / 무음)은 AI가 판단할 문제가 아니다 — 서버로 보내지 않고 여기서 끝낸다.
        const durationMs = Date.now() - startedAtRef.current;
        const reliable = meterIsReliable(meter);
        const silent = reliable && meter.inputMs < MIN_INPUT_MS;
        console.log("[recording] stop", {
          durationMs,
          bytes: blob.size,
          meter: reliable ? { inputMs: meter.inputMs, maxRms: Number(meter.maxRms.toFixed(4)) } : "unavailable",
        });
        if (durationMs < MIN_RECORDING_MS || blob.size === 0 || silent) {
          setEmptyNotice(true);
          return;
        }
        onFinish(blob);
      };
      stopInputMeter(meterRef.current);
      meterRef.current = startInputMeter(stream);
      startedAtRef.current = Date.now();
      recorder.start();
      mediaRecorderRef.current = recorder;
      setEmptyNotice(false);
      setMicFailed(false);
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      stopInputMeter(meterRef.current);
      meterRef.current = null;
      // 권한 거부/마이크 없음 — 알림창 대신 화면 안에서 조용히 알려주고, 글로 남기는 길은 열어둔다.
      setMicFailed(true);
    } finally {
      startingRef.current = false;
    }
  };

  useEffect(() => {
    if (autoStart && !autoStartedRef.current) {
      autoStartedRef.current = true;
      start().finally(() => setAutoStarting(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const stop = () => {
    const recorder = mediaRecorderRef.current;
    // inactive = 트랙이 먼저 끊겨(백그라운드 전환 등) 브라우저가 이미 onstop을 불러준 상태.
    if (!recorder || stoppingRef.current || recorder.state === "inactive") return;
    stoppingRef.current = true;
    // 중지 효과음이 마이크로 다시 들어와 무음 판정을 흐리지 않도록, 소리 내기 전에 음량 측정을 먼저 멈춘다.
    if (meterRef.current) clearInterval(meterRef.current.timer);
    playFx("micStop");
    recorder.stop();
  };

  // 사용자가 직접 누른 녹음 시작(마이크 동그라미 / 다시 말하기)에만 시작음을 낸다.
  // 자동 시작(autoStart)은 홈에서 누른 순간 page.tsx가 이미 소리를 냈으므로 여기서 다시 내지 않는다.
  const startByTap = () => {
    if (startingRef.current || isRecording) return;
    playFx("micStart");
    start();
  };

  const switchToText = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      discardRef.current = true;
      try { recorder.stop(); } catch {}
    }
    setMode("text");
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
          {initialTopic ? (
            <div style={styles.topicBadge}>{`참견이: "${initialTopic}"`}</div>
          ) : (
            <span style={styles.wordmark}>참견이</span>
          )}
          <button
            className={TACTILE_PRESS_CLASS}
            style={styles.modeToggleButton}
            onClick={switchToText}
            aria-label="텍스트 입력으로 전환"
            title="타이핑으로 남길래"
          >
            <IconMore style={{ width: 18, height: 18, color: BRAND.ink }} />
          </button>
        </div>

        {isRecording && (
          <div style={styles.listeningTag}>
            <span style={styles.recDot} />
            듣는 중
          </div>
        )}

        {!isRecording ? (
          <button className={TACTILE_PRESS_CLASS} style={styles.heroBox} onClick={startByTap} aria-label="말하기 시작">
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
            <p style={styles.mainCopy}>응, 듣고 있어</p>
            <p style={styles.subCopy}>정리 안 해도 됨. 중간에 생각 바뀌어도 됨</p>
            <button className={TACTILE_PRESS_CLASS} style={styles.stopButton} onClick={stop}>
              <span style={styles.stopSquare} />
              다 말했어
            </button>
          </>
        ) : emptyNotice ? (
          <>
            <p style={styles.mainCopy}>아직 아무 말도 안 했는데?</p>
            <button className={TACTILE_PRESS_CLASS} style={styles.stopButton} onClick={startByTap}>
              다시 말하기
            </button>
            {onCancel && (
              <button className={TACTILE_PRESS_CLASS} style={styles.homeButton} onClick={onCancel}>
                홈으로
              </button>
            )}
          </>
        ) : micFailed ? (
          <>
            <p style={styles.mainCopy}>마이크가 안 잡히네</p>
            <p style={styles.subCopy}>마이크 동그라미를 다시 눌러보거나,{"\n"}오른쪽 위 버튼으로 써서 보내도 돼.</p>
          </>
        ) : autoStarting ? (
          // 자동 시작 중(권한 확인 ~ 녹음 시작 사이 아주 짧은 순간) — 안내 문구로 화면이 깜빡이지 않게 비워둔다.
          <p style={styles.subCopy}>&nbsp;</p>
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
  // 실제 기기 화면 한 장(100dvh) 기준 + 상/하단 안전영역을 직접 비운다(body가 안전영역 padding을 안 줌).
  container: { ...pageBackground, minHeight: "100dvh", color: BRAND.ink, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "24px", paddingTop: "max(24px, calc(env(safe-area-inset-top, 0px) + 16px))", paddingBottom: "max(24px, calc(env(safe-area-inset-bottom, 0px) + 16px))", boxSizing: "border-box" },
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
  // 녹음 중 유일한 행동 — primary로 크게.
  stopButton: { width: "100%", padding: "16px", ...tactile.primaryButton, ...typography.ctaLabel, display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "4px" },
  homeButton: { width: "100%", padding: "14px", ...tactile.secondaryButton, ...typography.ctaLabel },
  stopSquare: { width: "12px", height: "12px", borderRadius: "3px", background: "#fff", flexShrink: 0 },
  wordmark: { ...typography.eyebrow, color: inkAlpha.faint },
  disabledButton: { opacity: 0.45, cursor: "not-allowed" },
  mainCopy: { color: BRAND.ink, fontSize: "18px", fontWeight: 700, margin: 0 },
  subCopy: { color: inkAlpha.muted, fontSize: "13px", margin: 0, whiteSpace: "pre-line", lineHeight: 1.5 },
};
