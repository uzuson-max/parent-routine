"use client";

import { useEffect, useRef, useState } from "react";
import { useTankRecorder, type TankRecordResult } from "@/lib/useTankRecorder";
import { playFx } from "@/lib/fx";

// ============================================================================
// 녹음 화면 — "어항 속으로 들어온" 화면.
// 홈에서 마이크를 누르면 이 화면으로 와서 바로 녹음이 시작된다.
//   - 화면 전체가 물속. 상어 한 마리만 천천히 지나다닌다(녹음에 방해되지 않게 딱 하나).
//   - 말하는 동안 물방울 안의 내 물고기가 아주 조금씩 자란다: 치어로 시작 → 6초 넘으면 금붕어 →
//     1분까지 천천히 더 커진다. "이게 곧 어항에 들어가겠구나" 하는 기대감.
//   - 다 말했어(마이크) → 물고기가 물방울째 위로 떠올라 사라지고 → 홈으로 돌아가면 어항에 퐁당.
//   - 아무 말도 안 했으면 물고기는 사라지고 "아직 아무 말도 안 했는데?"만 남는다(서버로 안 보냄).
// 설명 문구는 넣지 않는다.
// ============================================================================

interface TankRecordingScreenProps {
  // 참견이의 말에 대답하는 녹음이면 그 말 — 화면 위에 작게 보여준다.
  replyTo?: string;
  // 물고기가 어항으로 떠난 뒤 호출 — page.tsx가 홈으로 돌아가 업로드한다.
  onDone: (blob: Blob) => void;
  // X — 녹음을 버리고 홈으로.
  onCancel: () => void;
  // 마이크를 못 잡았을 때 — 기존 녹음 화면(글로 남기기 가능)으로.
  onMicFailed: () => void;
}

const INK = "#1B1630";
const WATER_TOP = "#5CCBF2";
const WATER_BOTTOM = "#2E9BD6";
const FISH_AT_MS = 6000; // 이 시간을 넘기면 치어 → 금붕어 (FishTank의 35자 기준과 비슷)
const FULL_AT_MS = 60000; // 금붕어가 다 자라는 시간
const LEAVE_MS = 1000; // 물고기가 위로 떠나는 연출 시간

type Phase = "recording" | "empty" | "leaving";

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

export default function TankRecordingScreen({ replyTo, onDone, onCancel, onMicFailed }: TankRecordingScreenProps) {
  const [phase, setPhase] = useState<Phase>("recording");
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  const handleResult = (res: TankRecordResult) => {
    if (res.kind === "audio") {
      setPhase("leaving");
      leaveTimer.current = setTimeout(() => onDone(res.blob), LEAVE_MS);
    } else {
      setPhase("empty");
    }
  };

  const recorder = useTankRecorder((res) => {
    // 3분 자동 정지 등
    playFx("micStop");
    handleResult(res);
  });
  const recording = recorder.state === "recording";

  const begin = async () => {
    setPhase("recording");
    const ok = await recorder.start();
    if (!ok) onMicFailed();
  };

  // 홈에서 마이크를 누르고 들어왔으니 바로 녹음 시작(시작음은 홈에서 이미 냈다).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 기기 화면 끝(노치/홈 인디케이터 영역)까지 물 색으로.
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = WATER_BOTTOM;
    return () => {
      document.body.style.backgroundColor = prev;
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  const handleMic = async () => {
    if (phase === "leaving" || recorder.state === "starting") return;
    if (recording) {
      playFx("micStop");
      const res = await recorder.finish();
      handleResult(res);
      return;
    }
    // 빈 녹음 뒤 다시 말하기
    playFx("micStart");
    begin();
  };

  // --- 물고기 크기: 아주 조금씩 자란다 ---
  const t = recorder.elapsedMs;
  const grown = t >= FISH_AT_MS;
  const fishWidth = grown
    ? 74 + 46 * Math.min(1, (t - FISH_AT_MS) / (FULL_AT_MS - FISH_AT_MS)) // 74 → 120px
    : 30 + 26 * Math.min(1, t / FISH_AT_MS); // 30 → 56px (치어)
  const bubbleSize = Math.round(fishWidth * 1.45 + 34);
  const showFish = phase === "leaving" || (phase === "recording" && (recording || recorder.state === "starting"));

  return (
    <div style={styles.container}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* 물속 배경 */}
      <svg className="tr-wave" width="780" height="34" viewBox="0 0 780 34" aria-hidden>
        <path d="M0 16 Q48.75 4 97.5 16 T195 16 T292.5 16 T390 16 T487.5 16 T585 16 T682.5 16 T780 16" fill="none" stroke="#FFFFFF" strokeWidth={4} opacity={0.85} />
      </svg>
      <div className="tr-ray" style={{ left: "16%" }} />
      <div className="tr-ray" style={{ left: "46%", width: 22, animationDelay: "-1.6s" }} />
      <div className="tr-ray" style={{ left: "76%", width: 40, animationDelay: "-3.1s" }} />
      {BG_BUBBLES.map((b, i) => (
        <span key={i} className="tr-bg-bubble" style={b} />
      ))}

      {/* 상어 한 마리 — 천천히 지나다닌다 */}
      <div className="tr-shark-swim" aria-hidden>
        <div className="tr-shark-bob">
          <Shark />
        </div>
      </div>

      {/* 모래 바닥 + 수초 */}
      <div style={styles.floor} aria-hidden>
        <svg className="tr-weed" width="38" height="130" viewBox="0 0 40 140" style={{ left: "8%", bottom: 40 }}>
          <path d={WEED} fill="#2FAF6A" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        </svg>
        <svg className="tr-weed" width="28" height="92" viewBox="0 0 40 140" style={{ left: "17%", bottom: 36, animationDelay: "-1.3s" }}>
          <path d={WEED} fill="#46C985" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        </svg>
        <svg className="tr-weed" width="34" height="116" viewBox="0 0 40 140" style={{ right: "9%", bottom: 38, animationDelay: "-2.2s" }}>
          <path d={WEED} fill="#2FAF6A" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        </svg>
        <svg style={styles.sand} viewBox="0 0 390 90" preserveAspectRatio="none">
          <path d="M-4 40 C50 26 100 46 150 34 C200 22 250 42 300 32 C340 24 370 36 394 30 V96 H-4 Z" fill="#F6D589" stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
          {PEBBLES.map(([cx, cy, rx, ry, c], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={c} stroke={INK} strokeWidth={2.5} />
          ))}
        </svg>
      </div>

      {/* 상단: 닫기 + (대답 중이면) 참견이가 한 말 */}
      <div style={styles.top}>
        <button
          className="tr-sticker"
          style={styles.closeBtn}
          aria-label="녹음 그만두고 돌아가기"
          onClick={onCancel}
          disabled={phase === "leaving"}
        >
          <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden>
            <path d="M3 3 L11 11 M11 3 L3 11" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
          </svg>
        </button>
        {replyTo && (
          <div style={styles.replyCard}>
            <span style={styles.replyStamp}>참견이</span>
            <span style={styles.replyText}>{truncate(replyTo, 48)}</span>
          </div>
        )}
      </div>

      {/* 가운데: 자라는 내 물고기 / 빈 녹음 안내 */}
      <div style={styles.stage}>
        {showFish && (
          <div className={phase === "leaving" ? "tr-leave" : "tr-float"}>
            <div className="tr-bubble" style={{ width: bubbleSize, height: bubbleSize }}>
              <div key={grown ? "fish" : "fry"} className="tr-grow-pop" style={{ width: fishWidth, transition: "width .45s linear" }}>
                {grown ? <GrowingFish /> : <GrowingFry />}
              </div>
            </div>
          </div>
        )}
        {phase === "empty" && (
          <div className="tr-notice" role="status">아직 아무 말도 안 했는데?</div>
        )}
      </div>

      {/* 마이크 */}
      <div style={styles.micArea}>
        {recording && (
          <>
            <span className="tr-mb" style={{ ["--x" as any]: "-26px" }} />
            <span className="tr-mb" style={{ ["--x" as any]: "20px", animationDelay: "-.5s", width: 10, height: 10 }} />
            <span className="tr-mb" style={{ ["--x" as any]: "-6px", animationDelay: "-1s", width: 16, height: 16 }} />
          </>
        )}
        <button
          className={recording ? "tr-mic tr-mic-rec" : phase === "leaving" || recorder.state === "starting" ? "tr-mic tr-mic-busy" : "tr-mic tr-mic-idle"}
          onClick={handleMic}
          disabled={phase === "leaving"}
          aria-label={recording ? "다 말했어" : "다시 말하기"}
        >
          {recording ? (
            <span style={styles.stopSquare} aria-hidden />
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden>
              <rect x="8.5" y="3" width="7" height="12" rx="3.5" fill="#FFFFFF" stroke={INK} strokeWidth={2.2} />
              <path d="M5.5 11.5 C5.5 15.5 8.5 18 12 18 C15.5 18 18.5 15.5 18.5 11.5" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
              <path d="M12 18 V21.5" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// 상어 — 오른쪽을 보고 있는 기본형. 무섭지 않게 둥글고, 이빨은 살짝만.
function Shark() {
  return (
    <svg viewBox="0 0 170 86" aria-hidden>
      <g className="tr-shark-tail">
        <path d="M34 44 C22 30 14 18 4 12 C8 28 10 36 6 46 C10 56 8 64 4 78 C16 70 24 58 34 48 Z" fill="#7FA6CF" stroke={INK} strokeWidth={3.2} strokeLinejoin="round" />
      </g>
      <path d="M78 22 C82 8 92 2 104 2 C100 10 98 18 100 24 Z" fill="#7FA6CF" stroke={INK} strokeWidth={3.2} strokeLinejoin="round" />
      <path d="M30 46 C30 28 60 18 96 18 C132 18 160 30 164 46 C160 62 132 72 96 72 C60 72 30 64 30 46 Z" fill="#8DB4DC" stroke={INK} strokeWidth={3.4} strokeLinejoin="round" />
      <path d="M58 56 C80 68 120 70 150 56 C140 66 118 72 96 72 C78 72 64 66 58 56 Z" fill="#FFFFFF" />
      <path d="M86 58 C84 68 78 76 70 80 C80 80 92 74 98 62 Z" fill="#7FA6CF" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d="M110 36 C108 40 108 44 110 48" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M116 35 C114 40 114 45 116 50" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <circle cx="136" cy="36" r="8" fill="#FFFFFF" stroke={INK} strokeWidth={3} />
      <circle cx="138.5" cy="36.5" r="3.8" fill={INK} />
      <circle cx="137" cy="35" r="1.2" fill="#FFFFFF" />
      <path d="M128 25 Q136 21 144 25" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M134 54 Q147 60 158 50" fill="none" stroke={INK} strokeWidth={2.8} strokeLinecap="round" />
      <path d="M140 56 L142.5 60.5 L145 57.5 Z M148 56 L150 60 L152 55.5 Z" fill="#FFFFFF" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      <ellipse cx="146" cy="47" rx="4" ry="2.4" fill="#FF8FB3" opacity={0.6} />
    </svg>
  );
}

function GrowingFry() {
  return (
    <svg viewBox="0 0 40 26" aria-hidden>
      <g className="tr-tail">
        <path d="M12 13 C7 7 4 6 1 7 C3 11 3 15 1 19 C4 20 7 19 12 13 Z" fill="#FFD3A1" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      </g>
      <ellipse cx="23" cy="13" rx="12" ry="8.5" fill="#FFA45C" stroke={INK} strokeWidth={2.5} />
      <circle cx="28" cy="10.5" r="4.8" fill="#FFFFFF" stroke={INK} strokeWidth={2.5} />
      <circle cx="29.3" cy="10.9" r="2.4" fill={INK} />
    </svg>
  );
}

function GrowingFish() {
  return (
    <svg viewBox="0 0 80 56" aria-hidden>
      <g className="tr-tail">
        <path d="M24 28 C14 17 8 11 3 12 C7 21 7 35 3 44 C8 45 14 39 24 28 Z" fill="#FF7A1A" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      </g>
      <path d="M34 13 C37 3 49 1 56 10" fill="#FF7A1A" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <ellipse cx="47" cy="29" rx="26" ry="19.5" fill="#FF7A1A" stroke={INK} strokeWidth={3} />
      <ellipse cx="49" cy="37" rx="15" ry="6.5" fill="#FFC75A" />
      <path d="M42 31 C37 36 39 41 46 39" fill="#FFB04A" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx="58" cy="22" r="8.5" fill="#FFFFFF" stroke={INK} strokeWidth={3} />
      <circle cx="60.5" cy="22.5" r="3.9" fill={INK} />
      <circle cx="59.2" cy="21" r="1.3" fill="#FFFFFF" />
      <path d="M70 32 Q73.5 34.5 70.5 37" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
      <ellipse cx="63" cy="33" rx="3.6" ry="2.2" fill="#FF5E7E" opacity={0.55} />
    </svg>
  );
}

const WEED = "M20 140 C8 110 30 95 18 70 C8 48 28 35 20 6 C34 30 22 50 30 72 C40 98 24 112 28 140 Z";

const PEBBLES: [number, number, number, number, string][] = [
  [36, 52, 13, 9, "#FF9EC4"],
  [70, 62, 10, 7, "#8BE0C0"],
  [112, 50, 12, 8, "#B9A7F2"],
  [150, 64, 14, 9, "#FFD54A"],
  [190, 50, 9, 6.5, "#FFFFFF"],
  [228, 60, 12, 8, "#FF9EC4"],
  [262, 70, 9, 6, "#7FB2FF"],
  [300, 54, 13, 9, "#8BE0C0"],
  [336, 66, 10, 7, "#FFD54A"],
  [370, 56, 9, 6, "#B9A7F2"],
  [16, 74, 11, 7, "#7FB2FF"],
];

const BG_BUBBLES: React.CSSProperties[] = [
  { left: "12%", width: 10, height: 10, animationDuration: "6s" },
  { left: "14%", width: 7, height: 7, animationDuration: "6s", animationDelay: "-2s" },
  { left: "86%", width: 12, height: 12, animationDuration: "7s", animationDelay: "-1s" },
  { left: "88%", width: 8, height: 8, animationDuration: "7s", animationDelay: "-4s" },
  { left: "32%", width: 9, height: 9, animationDuration: "8s", animationDelay: "-5s" },
  { left: "68%", width: 11, height: 11, animationDuration: "9s", animationDelay: "-3s" },
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Jua&display=swap');
.tr-wave { position: absolute; left: 0; top: max(76px, calc(env(safe-area-inset-top, 0px) + 66px)); animation: trWave 6s linear infinite; pointer-events: none; }
@keyframes trWave { to { transform: translateX(-195px); } }
.tr-ray { position: absolute; top: 0; width: 30px; height: 75%; background: rgba(255,255,255,.12); transform: rotate(16deg); transform-origin: top; animation: trShimmer 4s ease-in-out infinite alternate; pointer-events: none; }
@keyframes trShimmer { from { opacity: .4; } to { opacity: 1; } }
.tr-bg-bubble { position: absolute; bottom: 90px; border-radius: 50%; border: 2px solid rgba(255,255,255,.9); background: rgba(255,255,255,.18); animation: trRise linear infinite; pointer-events: none; }
@keyframes trRise { 0% { transform: translateY(0) scale(.5); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(-70vh) scale(1.1); opacity: 0; } }

/* 상어 — 화면을 가로질러 천천히 왕복 */
.tr-shark-swim { position: absolute; top: 24%; left: 0; width: 150px; z-index: 1; animation: trSharkSwim 26s ease-in-out infinite; pointer-events: none; }
@keyframes trSharkSwim {
  0%   { transform: translateX(-170px) scaleX(1); }
  46%  { transform: translateX(min(500px, 100vw)) scaleX(1); }
  50%  { transform: translateX(min(500px, 100vw)) scaleX(-1); }
  96%  { transform: translateX(-170px) scaleX(-1); }
  100% { transform: translateX(-170px) scaleX(1); }
}
.tr-shark-bob { animation: trBob 2.6s ease-in-out infinite alternate; }
.tr-shark-bob svg { display: block; width: 100%; height: auto; overflow: visible; }
.tr-shark-tail { transform-box: fill-box; transform-origin: 100% 50%; animation: trWag .7s ease-in-out infinite alternate; }
@keyframes trBob { from { transform: translateY(-6px) rotate(-2deg); } to { transform: translateY(6px) rotate(2deg); } }
@keyframes trWag { from { transform: rotate(-12deg); } to { transform: rotate(12deg); } }

.tr-weed { position: absolute; overflow: visible; transform-origin: 50% 100%; animation: trSway 3.4s ease-in-out infinite alternate; }
@keyframes trSway { from { transform: rotate(-7deg); } to { transform: rotate(7deg); } }

/* 자라는 물고기 */
.tr-float { animation: trFloat 2.4s ease-in-out infinite alternate; }
@keyframes trFloat { from { transform: translateY(-6px); } to { transform: translateY(6px); } }
.tr-bubble { position: relative; display: flex; align-items: center; justify-content: center; box-sizing: border-box; border-radius: 50%; border: 3px solid rgba(255,255,255,.95); background: rgba(255,255,255,.22); transition: width .45s linear, height .45s linear; }
.tr-bubble::after { content: ""; position: absolute; left: 18%; top: 12%; width: 20%; height: 13%; border-radius: 50%; background: #fff; transform: rotate(-30deg); }
.tr-bubble svg { display: block; width: 100%; height: auto; overflow: visible; }
.tr-grow-pop { animation: trPop .6s cubic-bezier(.3,1.8,.5,1) both; }
@keyframes trPop { from { transform: scale(.5); } to { transform: scale(1); } }
.tr-tail { transform-box: fill-box; transform-origin: 100% 50%; animation: trWag .24s ease-in-out infinite alternate; }
.tr-leave { animation: trLeave ${LEAVE_MS}ms cubic-bezier(.5,0,.75,0) forwards; }
@keyframes trLeave {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  20% { transform: translateY(8px) scale(1.06, .94); opacity: 1; }
  100% { transform: translateY(-75vh) scale(.6) rotate(-10deg); opacity: 0; }
}
.tr-notice { padding: 12px 20px; background: #fff; border: 3px solid ${INK}; border-radius: 22px; box-shadow: 4px 4px 0 ${INK}; font-size: 19px; color: ${INK}; animation: trPop .4s cubic-bezier(.3,1.6,.5,1) both; }

/* 마이크 */
.tr-mic { position: relative; z-index: 2; width: 92px; height: 92px; border-radius: 50%; border: 4px solid ${INK}; box-shadow: 5px 5px 0 ${INK}; display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background .2s, box-shadow .12s, transform .12s; }
.tr-mic-idle { background: #FFD23F; animation: trBreathe 2.8s ease-in-out infinite; }
.tr-mic-rec { background: #FF5B4A; animation: trBreathe 1.6s ease-in-out infinite; }
.tr-mic-busy { background: #FFE680; cursor: default; box-shadow: 2px 2px 0 ${INK}; }
.tr-mic:not(:disabled):active { animation: none; transform: translate(4px,4px); box-shadow: 1px 1px 0 ${INK}; }
@keyframes trBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); } }
.tr-mb { position: absolute; left: 50%; top: 0; width: 13px; height: 13px; box-sizing: border-box; border-radius: 50%; border: 2.5px solid #fff; background: rgba(255,255,255,.35); animation: trMb 1.4s ease-out infinite; pointer-events: none; }
@keyframes trMb { from { transform: translate(-50%,0) scale(.4); opacity: 0; } 30% { opacity: 1; } to { transform: translate(calc(-50% + var(--x)), -110px) scale(1); opacity: 0; } }

.tr-mic:focus-visible, .tr-sticker:focus-visible { outline: 3px dashed #fff; outline-offset: 4px; }
.tr-sticker:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 ${INK} !important; }
@media (prefers-reduced-motion: reduce) {
  .tr-wave, .tr-ray, .tr-bg-bubble, .tr-shark-swim, .tr-shark-bob, .tr-shark-tail, .tr-weed, .tr-float, .tr-tail, .tr-mic-idle, .tr-mic-rec, .tr-mb { animation: none; }
}
`;

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: "relative",
    minHeight: "100dvh",
    maxWidth: "480px",
    marginLeft: "auto",
    marginRight: "auto",
    overflow: "hidden",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontFamily: "'Jua', sans-serif",
    color: INK,
    background: `linear-gradient(180deg, ${WATER_TOP} 0%, #45BFEC 45%, ${WATER_BOTTOM} 100%)`,
    paddingTop: "max(16px, calc(env(safe-area-inset-top, 0px) + 10px))",
    paddingLeft: "20px",
    paddingRight: "20px",
    paddingBottom: "calc(110px + env(safe-area-inset-bottom, 0px))",
  },
  top: {
    position: "relative",
    zIndex: 3,
    width: "100%",
    minHeight: 48,
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  closeBtn: {
    flexShrink: 0,
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
    cursor: "pointer",
  },
  replyCard: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    padding: "8px 14px 10px",
    background: "#FFFFFF",
    border: `3px solid ${INK}`,
    borderRadius: 18,
    boxShadow: `3px 3px 0 ${INK}`,
  },
  replyStamp: {
    padding: "1px 9px",
    borderRadius: 9,
    background: "#FFD23F",
    border: `2px solid ${INK}`,
    fontSize: 11,
  },
  replyText: {
    fontSize: 15,
    lineHeight: 1.35,
    wordBreak: "keep-all",
  },
  stage: {
    position: "relative",
    zIndex: 2,
    flex: "1 1 auto",
    width: "100%",
    minHeight: 220,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  micArea: {
    position: "relative",
    zIndex: 2,
    width: 110,
    height: 110,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: 6,
    background: "#FFFFFF",
    border: `3px solid ${INK}`,
    boxSizing: "border-box",
  },
  floor: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "calc(96px + env(safe-area-inset-bottom, 0px))",
    zIndex: 1,
    pointerEvents: "none",
  },
  sand: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    display: "block",
  },
};
