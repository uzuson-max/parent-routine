"use client";

import { useEffect, useRef, useState } from "react";
import FishTank from "@/components/FishTank";
import { IconHome, IconRecord, IconMemory, IconGear, IconLetter } from "@/components/icons";
import { useTankRecorder, type TankRecordResult } from "@/lib/useTankRecorder";
import { playFx } from "@/lib/fx";

export interface RecordEntry {
  id: string;
  createdAt: string;
  transcript: string;
  responseText: string | null;
  // 참견이의 말에 대답한 녹음이면 true — 어항(생각)에는 넣지 않는다.
  isReply?: boolean;
}

// 아직 아무 데도(문자/대화) 안 꺼낸 진짜 proactive callback 한 건. 없으면 null.
// 로딩이 끝났는지 여부는 이 값 자체가 아니라 page.tsx가 undefined로 구분해서 넘겨준다.
export interface ProactiveLine {
  id: number;
  content: string;
}

// 어항 위에 뜨는 참견이 말풍선.
//   reply  — 방금 녹음에 대한 참견이의 대답. 이 상태에서 마이크를 누르면 "대답"으로 녹음된다.
//   notice — "아직 아무 말도 안 했는데?" 같은 짧은 안내. 대답 대상이 아니다.
export interface HomeBubble {
  kind: "reply" | "notice";
  text: string;
}

interface TimelineScreenProps {
  // 마이크를 못 잡았을 때만 쓰는 예비 경로(기존 녹음 화면 — 글로 남기기 가능).
  onOpenRecording: (topic?: string) => void;
  // 홈 안에서 녹음한 음성을 보낸다. 결과(대답/안내/다른 화면으로 넘기기)는 page.tsx가 처리하고,
  // 대답은 bubble로 다시 내려준다. 이 Promise가 끝날 때까지 어항은 "생각 중" 상태.
  onSubmitVoice: (blob: Blob, replyTo?: string) => Promise<void>;
  bubble?: HomeBubble | null;
  onBubbleChange: (b: HomeBubble | null) => void;
  onOpenCalendar: () => void;
  onOpenMyPage: () => void;
  onOpenInsights: () => void;
  // 참견이의 편지 진입점. 넘기지 않으면 아이콘 자체를 그리지 않는다(기존 사용처 호환).
  onOpenLetters?: () => void;
  // 실제 DB의 안 읽은 편지 개수. 0이거나 없으면 badge를 그리지 않는다.
  unreadLetterCount?: number;
  entries: RecordEntry[] | null;
  proactiveLine?: ProactiveLine | null;
  nickname?: string | null;
}

const NO_SPEECH_TEXT = "아직 아무 말도 안 했는데?";
const FISH_AT_MS = 6000; // 이 시간을 넘기면 미리보기가 치어 → 금붕어로 자란다 (FishTank의 35자 기준과 비슷)
const WALL = "#FFE9A8";
const INK = "#1B1630";

// ============================================================================
// Home C안 — 금붕어 어항. 녹음부터 참견이의 대답까지 전부 이 화면 안에서 끝난다.
//   idle      → 마이크(또는 어항)를 누르면 바로 녹음
//   recording → 마이크 위에 치어가 떠 있다가 6초가 넘으면 금붕어로 자란다. 한 번 더 누르면 끝.
//   thinking  → 어항 가운데 물방울이 꿀렁거린다 (업로드/분석 중)
//   → 참견이의 대답이 어항 위 말풍선으로 뜨고, 새 치어/금붕어가 퐁당 들어온다.
// 확인(commitment)/전화처럼 따로 화면이 필요한 경우만 page.tsx가 기존 화면으로 넘긴다.
// ============================================================================
export default function TimelineScreen({
  onOpenRecording,
  onSubmitVoice,
  bubble,
  onBubbleChange,
  onOpenCalendar,
  onOpenMyPage,
  onOpenInsights,
  onOpenLetters,
  unreadLetterCount = 0,
  entries,
  proactiveLine,
}: TimelineScreenProps) {
  const [thinking, setThinking] = useState(false);
  const replyToRef = useRef<string | undefined>(undefined);
  const mountedRef = useRef(true);

  const handleResult = async (res: TankRecordResult) => {
    if (res.kind === "failed") return;
    if (res.kind === "empty") {
      onBubbleChange({ kind: "notice", text: NO_SPEECH_TEXT });
      return;
    }
    setThinking(true);
    try {
      await onSubmitVoice(res.blob, replyToRef.current);
    } finally {
      if (mountedRef.current) setThinking(false);
    }
  };

  const recorder = useTankRecorder((res) => {
    // 3분 자동 정지 등 — 버튼을 안 눌렀어도 결과는 똑같이 처리한다.
    playFx("micStop");
    handleResult(res);
  });
  const recording = recorder.state === "recording";
  const busy = thinking || recorder.state === "starting";

  // 홈에 있는 동안은 기기 화면 끝(노치/홈 인디케이터 영역)까지 어항 벽 색으로 맞춘다.
  useEffect(() => {
    mountedRef.current = true;
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = WALL;
    return () => {
      mountedRef.current = false;
      document.body.style.backgroundColor = prev;
    };
  }, []);

  const hasCallback = !!(proactiveLine && proactiveLine.content);

  const handleMic = async () => {
    if (busy) return;
    if (recording) {
      playFx("micStop");
      const res = await recorder.finish();
      handleResult(res);
      return;
    }
    // 무엇에 대한 대답인지 녹음 시작 시점에 정해둔다.
    replyToRef.current =
      bubble?.kind === "reply" ? bubble.text : hasCallback && proactiveLine ? proactiveLine.content : undefined;
    if (bubble?.kind === "notice") onBubbleChange(null);
    playFx("micStart");
    const ok = await recorder.start();
    if (!ok) {
      // 마이크 권한 거부/없음 — 기존 녹음 화면으로 보내서 글로라도 남길 수 있게.
      onOpenRecording(replyToRef.current);
    }
  };

  // 화면에 보일 말풍선: 방금 대답/안내가 우선, 없으면 참견이가 먼저 꺼낸 말
  const shown: { stamp: string | null; text: string; closable: boolean } | null = bubble
    ? { stamp: bubble.kind === "reply" ? "참견이" : null, text: bubble.text, closable: true }
    : hasCallback && proactiveLine
    ? { stamp: "참견이 등장.", text: proactiveLine.content, closable: false }
    : null;
  const replying = !!bubble ? bubble.kind === "reply" : hasCallback;

  const grown = recorder.elapsedMs >= FISH_AT_MS;
  const ringProgress = Math.min(1, recorder.elapsedMs / FISH_AT_MS);

  return (
    <div style={styles.container}>
      <style>{CSS}</style>

      {/* HEADER — 로고 + 편지 아이콘만 */}
      <div style={styles.header}>
        <span style={styles.logo}>참견이</span>
        {onOpenLetters && (
          <button
            className="tl-sticker"
            style={styles.letterButton}
            onClick={() => {
              playFx("buttonPress");
              onOpenLetters();
            }}
            aria-label={unreadLetterCount > 0 ? `참견이의 편지, 안 읽은 편지 ${unreadLetterCount}통` : "참견이의 편지"}
          >
            <IconLetter style={{ width: 24, height: 24 }} />
            {unreadLetterCount > 0 && (
              <span style={styles.letterBadge} aria-hidden>
                {unreadLetterCount > 9 ? "9+" : unreadLetterCount}
              </span>
            )}
          </button>
        )}
      </div>

      <div style={styles.core}>
        {/* 어항 위 말풍선 — 참견이의 대답 / 먼저 꺼낸 말 / 짧은 안내 */}
        <div style={styles.bubbleSlot}>
          {shown && (
            <div key={shown.text} className="tl-bubble" style={styles.bubble} role="status">
              {shown.stamp && <span style={styles.bubbleStamp}>{shown.stamp}</span>}
              <span style={styles.bubbleText}>{shown.text}</span>
              {shown.closable && !recording && !thinking && (
                <button
                  className="tl-close"
                  style={styles.bubbleClose}
                  aria-label="말풍선 닫기"
                  onClick={() => onBubbleChange(null)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                    <path d="M3 3 L11 11 M11 3 L3 11" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        <div style={styles.tankBox}>
          <FishTank entries={entries} thinking={thinking} onTankPress={handleMic} />
        </div>

        {/* 마이크 + 녹음 중 연출 */}
        <div style={styles.micArea}>
          {recording && (
            <>
              <span className="tl-mb" style={{ ["--x" as any]: "-40px" }} />
              <span className="tl-mb" style={{ ["--x" as any]: "34px", animationDelay: "-.45s", width: 10, height: 10 }} />
              <span className="tl-mb" style={{ ["--x" as any]: "-22px", animationDelay: "-.9s", width: 17, height: 17 }} />
              <div className={grown ? "tl-pv tl-pv-fish" : "tl-pv tl-pv-fry"} aria-hidden>
                {grown ? <PreviewFish /> : <PreviewFry />}
              </div>
              <svg className="tl-ring" viewBox="0 0 104 104" aria-hidden>
                <circle cx="52" cy="52" r="48" fill="none" stroke={INK} strokeWidth={8} opacity={0.15} />
                <circle
                  cx="52"
                  cy="52"
                  r="48"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray={301.6}
                  strokeDashoffset={301.6 * (1 - ringProgress)}
                  style={{ transition: "stroke-dashoffset .2s linear" }}
                />
              </svg>
            </>
          )}
          <button
            className={recording ? "tl-mic tl-mic-rec" : busy ? "tl-mic tl-mic-busy" : "tl-mic tl-mic-idle"}
            onClick={handleMic}
            disabled={busy}
            aria-label={recording ? "다 말했어" : replying ? "대답하기" : "생각 말하기"}
          >
            {recording ? (
              <span style={styles.stopSquare} aria-hidden />
            ) : (
              <svg width="38" height="38" viewBox="0 0 24 24" aria-hidden>
                <rect x="8.5" y="3" width="7" height="12" rx="3.5" fill="#FFFFFF" stroke={INK} strokeWidth={2.2} />
                <path d="M5.5 11.5 C5.5 15.5 8.5 18 12 18 C15.5 18 18.5 15.5 18.5 11.5" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
                <path d="M12 18 V21.5" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* NAVIGATION — 어항 세계와 같은 스티커 톤으로 */}
      <nav style={styles.bottomNav}>
        <div className="tl-nav tl-nav-on" aria-current="page">
          <IconHome style={{ width: 22, height: 22 }} />
          <span>HOME</span>
        </div>
        <button className="tl-nav" onClick={() => { playFx("buttonPress"); onOpenCalendar(); }} disabled={recording || thinking}>
          <IconRecord style={{ width: 22, height: 22 }} />
          <span>기록</span>
        </button>
        <button className="tl-nav" onClick={() => { playFx("buttonPress"); onOpenInsights(); }} disabled={recording || thinking}>
          <IconMemory style={{ width: 22, height: 22 }} />
          <span>MEMORY</span>
        </button>
        <button className="tl-nav" onClick={() => { playFx("buttonPress"); onOpenMyPage(); }} disabled={recording || thinking}>
          <IconGear style={{ width: 22, height: 22 }} />
          <span>MY</span>
        </button>
      </nav>
    </div>
  );
}

function PreviewFry() {
  return (
    <svg viewBox="0 0 40 26" aria-hidden>
      <g className="tl-tail">
        <path d="M12 13 C7 7 4 6 1 7 C3 11 3 15 1 19 C4 20 7 19 12 13 Z" fill="#FFD3A1" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      </g>
      <ellipse cx="23" cy="13" rx="12" ry="8.5" fill="#FFA45C" stroke={INK} strokeWidth={2.5} />
      <circle cx="28" cy="10.5" r="4.8" fill="#FFFFFF" stroke={INK} strokeWidth={2.5} />
      <circle cx="29.3" cy="10.9" r="2.4" fill={INK} />
    </svg>
  );
}

function PreviewFish() {
  return (
    <svg viewBox="0 0 80 56" aria-hidden>
      <g className="tl-tail">
        <path d="M24 28 C14 17 8 11 3 12 C7 21 7 35 3 44 C8 45 14 39 24 28 Z" fill="#FF7A1A" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      </g>
      <path d="M34 13 C37 3 49 1 56 10" fill="#FF7A1A" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <ellipse cx="47" cy="29" rx="26" ry="19.5" fill="#FF7A1A" stroke={INK} strokeWidth={3} />
      <ellipse cx="49" cy="37" rx="15" ry="6.5" fill="#FFC75A" />
      <circle cx="58" cy="22" r="8.5" fill="#FFFFFF" stroke={INK} strokeWidth={3} />
      <circle cx="60.5" cy="22.5" r="3.9" fill={INK} />
      <path d="M70 32 Q73.5 34.5 70.5 37" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Jua&display=swap');
@keyframes tlBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); } }
@keyframes tlBubbleIn {
  0% { opacity: 0; transform: translateY(10px) scale(0.9) rotate(-1deg); }
  60% { opacity: 1; transform: translateY(-2px) scale(1.03) rotate(-1deg); }
  100% { opacity: 1; transform: translateY(0) scale(1) rotate(-1deg); }
}
@keyframes tlMb { from { transform: translate(-50%,0) scale(.4); opacity: 0; } 30% { opacity: 1; } to { transform: translate(calc(-50% + var(--x)), -78px) scale(1); opacity: 0; } }
@keyframes tlPvBob { from { transform: translate(-50%,-3px); } to { transform: translate(-50%,3px); } }
@keyframes tlPvGrow { 0% { transform: translateX(-50%) scale(.4); } 100% { transform: translateX(-50%) scale(1); } }
@keyframes tlWag { from { transform: rotate(-15deg); } to { transform: rotate(15deg); } }
.tl-mic { position: relative; z-index: 2; width: 84px; height: 84px; border-radius: 50%; border: 4px solid ${INK}; box-shadow: 5px 5px 0 ${INK}; display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background .2s, box-shadow .12s, transform .12s; }
.tl-mic-idle { background: #FFD23F; animation: tlBreathe 2.8s ease-in-out infinite; }
.tl-mic-rec { background: #FF5B4A; }
.tl-mic-busy { background: #FFD23F; opacity: .55; cursor: default; }
.tl-mic:not(:disabled):active { animation: none; transform: translate(4px,4px); box-shadow: 1px 1px 0 ${INK}; }
.tl-mic:focus-visible, .tl-sticker:focus-visible, .tl-close:focus-visible, .tl-nav:focus-visible { outline: 3px dashed ${INK}; outline-offset: 4px; }
.tl-sticker:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 ${INK} !important; }
.tl-bubble { animation: tlBubbleIn .4s ease-out both; }
.tl-mb { position: absolute; left: 50%; top: 4px; width: 14px; height: 14px; box-sizing: border-box; border-radius: 50%; border: 2.5px solid ${INK}; background: #fff; animation: tlMb 1.3s ease-out infinite; pointer-events: none; }
.tl-ring { position: absolute; left: 50%; top: 50%; width: 104px; height: 104px; margin: -52px 0 0 -52px; transform: rotate(-90deg); pointer-events: none; z-index: 3; }
.tl-pv { position: absolute; left: 50%; bottom: calc(100% - 4px); pointer-events: none; z-index: 3; }
.tl-pv svg { display: block; width: 100%; height: auto; overflow: visible; }
.tl-pv-fry { width: 30px; animation: tlPvBob .6s ease-in-out infinite alternate; }
.tl-pv-fish { width: 58px; animation: tlPvGrow .6s cubic-bezier(.3,1.8,.5,1) both; }
.tl-tail { transform-box: fill-box; transform-origin: 100% 50%; animation: tlWag .22s ease-in-out infinite alternate; }
.tl-nav { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0 10px; border: 0; background: transparent; color: rgba(27,22,48,.5); font-family: 'Jua', sans-serif; font-size: 12px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.tl-nav:disabled { opacity: .4; cursor: default; }
.tl-nav-on { color: ${INK}; }
.tl-nav-on svg { background: #FFD23F; border: 2.5px solid ${INK}; border-radius: 12px; padding: 2px 10px; box-sizing: content-box; }
@media (prefers-reduced-motion: reduce) { .tl-mic-idle, .tl-bubble, .tl-mb, .tl-pv-fry, .tl-pv-fish, .tl-tail { animation: none; } }
`;

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100dvh",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    maxWidth: "480px",
    marginLeft: "auto",
    marginRight: "auto",
    overflowX: "hidden",
    fontFamily: "'Jua', sans-serif",
    color: INK,
    backgroundColor: WALL,
    backgroundImage: "radial-gradient(#FFDA78 17%, transparent 18%)",
    backgroundSize: "34px 34px",
    paddingTop: "max(16px, calc(env(safe-area-inset-top, 0px) + 10px))",
    paddingLeft: "20px",
    paddingRight: "20px",
    paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))",
  },
  header: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "48px",
  },
  logo: {
    fontSize: 26,
    letterSpacing: "-0.5px",
    transform: "rotate(-4deg)",
    display: "inline-block",
    textShadow: "3px 3px 0 #FFFFFF",
  },
  letterButton: {
    position: "relative",
    width: 46,
    height: 46,
    borderRadius: "50%",
    border: `3px solid ${INK}`,
    background: "#FFFFFF",
    boxShadow: `3px 3px 0 ${INK}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    color: INK,
    cursor: "pointer",
  },
  letterBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    padding: "0 5px",
    boxSizing: "border-box",
    borderRadius: 999,
    background: "#FF5B4A",
    border: `2px solid ${INK}`,
    color: "#fff",
    fontSize: 11,
    lineHeight: "16px",
    textAlign: "center",
  },
  core: {
    flex: "1 1 auto",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "16px",
  },
  bubbleSlot: {
    width: "100%",
    minHeight: 8,
    display: "flex",
    justifyContent: "center",
  },
  bubble: {
    position: "relative",
    width: "100%",
    maxWidth: 340,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "12px 34px 14px",
    background: "#FFFFFF",
    border: `3px solid ${INK}`,
    borderRadius: 22,
    boxShadow: `4px 4px 0 ${INK}`,
    textAlign: "center",
  },
  bubbleStamp: {
    padding: "2px 10px",
    borderRadius: 10,
    background: "#FFD23F",
    border: `2px solid ${INK}`,
    fontSize: 12,
  },
  bubbleText: {
    fontSize: 18,
    lineHeight: 1.4,
    wordBreak: "keep-all",
    maxHeight: "8.4em", // 6줄까지 — 더 길면 말풍선 안에서만 스크롤
    overflowY: "auto",
    whiteSpace: "pre-line",
  },
  bubbleClose: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 30,
    height: 30,
    border: 0,
    borderRadius: "50%",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  },
  // 화면 높이가 낮은 기기에서도 마이크가 내비 뒤로 밀리지 않게 어항 폭을 화면 높이에 맞춰 줄인다.
  tankBox: {
    width: "min(100%, clamp(230px, calc((100dvh - 400px) * 0.67), 340px))",
    flexShrink: 0,
  },
  micArea: {
    position: "relative",
    width: 104,
    height: 104,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stopSquare: {
    width: 26,
    height: 26,
    borderRadius: 6,
    background: "#FFFFFF",
    border: `3px solid ${INK}`,
    boxSizing: "border-box",
  },
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: "480px",
    background: "#FFFFFF",
    borderTop: `3px solid ${INK}`,
    display: "flex",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
    zIndex: 100,
  },
};
