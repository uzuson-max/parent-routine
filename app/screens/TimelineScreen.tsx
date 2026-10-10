// app/screens/TimelineScreen.tsx
"use client";

import { useEffect, useState } from "react";
import Sea from "@/components/Sea";
import { BottomNav, MyButton, type WorldTab } from "@/components/WorldNav";
import { acquireMicStream } from "@/lib/micStream";
import { playFx } from "@/lib/fx";
import { seaSoundPref, setSeaSoundPref, startSea, stopSea, recallChime } from "@/lib/seaSound";

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
  // 참견이가 먼저 꺼낸 기억의 원문/시각(api/user/proactive-line). insight 콜백이면 없다.
  recall?: Recall | null;
}

// 참견이가 꺼내 온 기억 — 사용자가 그때 실제로 한 말과 그 시각. 이 순간이 참견이의 주인공이다.
export interface Recall {
  memory_unit_id: number;
  quote: string;
  at: string;
}

// 어항 위에 뜨는 참견이 말풍선.
//   reply  — 방금 녹음에 대한 참견이의 대답. 이 상태에서 마이크를 누르면 "대답"으로 녹음된다.
//   notice — "아직 아무 말도 안 했는데?" 같은 짧은 안내. 대답 대상이 아니다.
//   confirm — 받아쓴 내용이 무음 환각("시청해주셔서 감사합니다" 등)처럼 보일 때. text는 받아쓴 내용이고,
//             [맞아]를 누르면 그대로 저장, [아니]를 누르면 버린다(onConfirmSpeech).
export interface HomeBubble {
  kind: "reply" | "notice" | "confirm";
  text: string;
  // reply가 과거 기억을 꺼내 온 대답이면 그 기억(voice/upload → response.recalled)
  recall?: Recall | null;
}

interface TimelineScreenProps {
  // 마이크(또는 어항)를 누르면 물속 녹음 화면(TankRecordingScreen)으로 간다.
  // replyTo — 참견이의 말에 대답하는 녹음이면 그 말.
  onStartRecording: (replyTo?: string) => void;
  // 녹음을 보내고 참견이가 생각하는 중 — 어항 가운데 물방울이 꿀렁거린다. page.tsx가 관리.
  thinking?: boolean;
  bubble?: HomeBubble | null;
  onBubbleChange: (b: HomeBubble | null) => void;
  // confirm 말풍선의 [맞아](true) / [아니](false)
  onConfirmSpeech?: (yes: boolean) => void;
  // 하단 탭(어항 / 지난 어항 / 편지)으로 이동
  onNavigate: (tab: WorldTab) => void;
  // 오른쪽 위 MY(설정) 아이콘
  onOpenMyPage: () => void;
  // 실제 DB의 안 읽은 편지 개수. 0이거나 없으면 편지 탭에 badge를 그리지 않는다.
  unreadLetterCount?: number;
  entries: RecordEntry[] | null;
  proactiveLine?: ProactiveLine | null;
  nickname?: string | null;
  // 지난달 층의 "그때 한 말" — 지난 어항 화면의 그 달로
  onOpenMonth?: (month: string) => void;
}

const INK = "#1B1630";
const DEEP = "#1B5A96"; // 화면 끝(노치/홈 인디케이터, 바운스 스크롤)에 비치는 깊은 물색

// ============================================================================
// Home — 참견이 바다. 화면 전체가 물속이고, 깊이 = 시간.
//   위쪽 수면 근처엔 요즘 말한 생각, 오래 안 꺼낸 생각일수록 아래로 가라앉는다(components/Sea.tsx).
//   아래로 스크롤하면 지난달, 지지난달 층으로 내려간다.
//   마이크를 누르면 물속 녹음 화면(TankRecordingScreen)으로 가고, 돌아오면 물방울이 꿀렁거리다
//   참견이의 대답이 위쪽 말풍선으로 뜨고 새 치어가 퐁당 들어온다.
//   왼쪽 위 소라 = 물속 소리 켜기/끄기(기본 꺼짐). 녹음할 땐 항상 끈다.
// ============================================================================
export default function TimelineScreen({
  onStartRecording,
  thinking = false,
  bubble,
  onBubbleChange,
  onConfirmSpeech,
  onNavigate,
  onOpenMyPage,
  unreadLetterCount = 0,
  entries,
  proactiveLine,
  onOpenMonth,
}: TimelineScreenProps) {
  // 홈에 있는 동안은 기기 화면 끝까지 깊은 물색으로 맞춘다.
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = DEEP;
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  // 밤(21시~6시) — 물이 어두워지고 다들 눈 감고 천천히, 소리도 작게. 시간대는 클라이언트에서만 판단.
  // null = 아직 모름(서버에서 그린 첫 화면). 낮 바다를 그렸다가 밤 바다로 바뀌며 "다른 그림이 번쩍" 하던 문제 —
  // 시간대를 확인하기 전에는 바다를 그리지 않고 깊은 물색만 보여주다가, 확인되면 맞는 바다를 스르륵 띄운다.
  const [nightState, setNight] = useState<boolean | null>(null);
  const night = nightState ?? false;
  useEffect(() => {
    const check = () => {
      const h = new Date().getHours();
      setNight(h >= 21 || h < 6);
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);

  // ---- 물속 소리 ----
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => {
    if (!seaSoundPref()) return;
    setSoundOn(true);
    // 지난번에 켜뒀으면 다시 켠다. 브라우저가 막으면 첫 터치 때 깨운다.
    startSea(false);
    const wake = () => startSea(new Date().getHours() >= 21 || new Date().getHours() < 6);
    window.addEventListener("pointerdown", wake, { once: true, capture: true });
    return () => window.removeEventListener("pointerdown", wake, { capture: true } as any);
  }, []);
  useEffect(() => {
    if (soundOn) startSea(night);
  }, [night, soundOn]);
  useEffect(() => () => stopSea(0.3), []);
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSeaSoundPref(next);
    if (next) startSea(night);
    else stopSea(0.5);
  };

  const hasCallback = !!(proactiveLine && proactiveLine.content);

  const handleMic = () => {
    if (thinking) return;
    // 물소리가 마이크로 들어가지 않게 먼저 끈다(돌아오면 다시 켜진다).
    stopSea(0.15);
    // 무엇에 대한 대답인지 여기서 정해서 녹음 화면에 들고 간다.
    const replyTo =
      bubble?.kind === "reply" ? bubble.text : hasCallback && proactiveLine ? proactiveLine.content : undefined;
    // 안내/확인 말풍선은 새로 말하기 시작하면 내려놓는다(확인 대기 중이던 녹음은 버려진다).
    if (bubble?.kind === "notice" || bubble?.kind === "confirm") onBubbleChange(null);
    playFx("micStart");
    // 사용자 제스처 안에서 마이크 요청을 먼저 시작해둔다(iOS Safari 대비) — 녹음 화면이 같은 스트림을 이어받는다.
    acquireMicStream().catch(() => {});
    onStartRecording(replyTo);
  };

  // 화면에 보일 말풍선: 방금 대답/안내가 우선, 없으면 참견이가 먼저 꺼낸 말
  const shown: { stamp: string | null; text: string; closable: boolean; recall: Recall | null } | null = bubble
    ? { stamp: bubble.kind === "reply" ? "참견이" : null, text: bubble.text, closable: true, recall: bubble.kind === "reply" ? bubble.recall ?? null : null }
    : hasCallback && proactiveLine
    ? { stamp: "참견이 등장.", text: proactiveLine.content, closable: false, recall: proactiveLine.recall ?? null }
    : null;
  // 지금 화면에 떠 있는 "기억 소환" — 말풍선 위 기억 캡슐 + 바다에서 그 물고기가 깨어나 떠오른다.
  const recall = shown && !thinking && bubble?.kind !== "confirm" ? shown.recall : null;
  const recallKey = recall ? `${recall.memory_unit_id}:${shown?.text}` : null;
  useEffect(() => {
    if (!recallKey) return;
    // 물고기가 떠오르는 타이밍에 맞춰 작은 종소리(물속 소리가 켜져 있을 때만) + 짧은 진동(지원 기기만)
    const t = setTimeout(() => {
      recallChime();
      try {
        navigator.vibrate?.([14, 50, 20]);
      } catch {
        /* 진동 없는 기기 */
      }
    }, 700);
    return () => clearTimeout(t);
  }, [recallKey]);
  const replying = !!bubble ? bubble.kind === "reply" : hasCallback;

  return (
    <div style={styles.container}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {nightState !== null && (
        <div className="tl-sea-in">
          <Sea entries={entries} thinking={thinking} night={night} onOpenMonth={onOpenMonth} recallUnitId={recall?.memory_unit_id ?? null} />
        </div>
      )}

      {/* HEADER — 소라(물속 소리) · 로고 · MY. 바다 위에 떠 있다. */}
      <div style={styles.header}>
        <button
          className={`tl-shell wn-sticker ${soundOn ? "tl-shell-on" : ""}`}
          onClick={toggleSound}
          aria-label={soundOn ? "물속 소리 끄기" : "물속 소리 켜기"}
          aria-pressed={soundOn}
        >
          <ShellIcon on={soundOn} />
        </button>
        <span style={styles.logo}>참견이</span>
        <span style={{ pointerEvents: "auto" }}>
          <MyButton onClick={onOpenMyPage} disabled={thinking} />
        </span>
      </div>

      {/* 말풍선 — 참견이의 대답 / 먼저 꺼낸 말 / 짧은 안내 */}
      <div style={styles.bubbleSlot}>
        {bubble?.kind === "confirm" && !thinking ? (
          <div key={"confirm:" + bubble.text} className="tl-bubble" style={styles.bubble} role="status">
            <span style={styles.bubbleStamp}>참견이</span>
            <span style={styles.confirmAsk}>잘 못 들었어. 이렇게 말한 거 맞아?</span>
            <span style={styles.confirmQuote}>“{bubble.text.length > 60 ? bubble.text.slice(0, 60) + "…" : bubble.text}”</span>
            <div style={styles.confirmRow}>
              <button
                className="tl-sticker"
                style={{ ...styles.confirmBtn, background: "#FFD23F" }}
                onClick={() => {
                  playFx("buttonPress");
                  onConfirmSpeech?.(true);
                }}
              >
                맞아
              </button>
              <button
                className="tl-sticker"
                style={styles.confirmBtn}
                onClick={() => {
                  playFx("buttonPress");
                  onConfirmSpeech?.(false);
                }}
              >
                아니, 말 안 했어
              </button>
            </div>
          </div>
        ) : (
          shown &&
          !thinking && (
            <>
            {recall && (
              <div key={"recall:" + recallKey} className="tl-recall" style={styles.recallWrap}>
                <div className="tl-recall-cap" style={styles.recallCap}>
                  <span style={styles.recallWhen}>
                    <svg width="22" height="16" viewBox="0 0 80 56" aria-hidden>
                      <path d="M24 28 C14 17 8 11 3 12 C7 21 7 35 3 44 C8 45 14 39 24 28 Z" fill="#FFB347" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
                      <ellipse cx="47" cy="29" rx="26" ry="19.5" fill="#FFB347" stroke={INK} strokeWidth={5} />
                      <circle cx="58" cy="22" r="5" fill={INK} />
                    </svg>
                    {recallWhen(recall.at)}
                  </span>
                  <span style={styles.recallQuote}>“{recall.quote.length > 70 ? recall.quote.slice(0, 70) + "…" : recall.quote}”</span>
                </div>
                <div className="tl-recall-link" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div key={shown.text} className={recall ? "tl-bubble tl-bubble-late" : "tl-bubble"} style={styles.bubble} role="status">
              {shown.stamp && <span style={styles.bubbleStamp}>{shown.stamp}</span>}
              <span style={styles.bubbleText}>{shown.text}</span>
              {shown.closable && (
                <button className="tl-close" style={styles.bubbleClose} aria-label="말풍선 닫기" onClick={() => onBubbleChange(null)}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                    <path d="M3 3 L11 11 M11 3 L3 11" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            </>
          )
        )}
      </div>

      {/* 마이크 — 어디까지 내려가 있어도 늘 같은 자리 */}
      <button
        className={thinking ? "tl-mic tl-mic-busy" : "tl-mic tl-mic-idle"}
        onClick={handleMic}
        disabled={thinking}
        aria-label={replying ? "대답하기" : "생각 말하기"}
      >
        <svg width="38" height="38" viewBox="0 0 24 24" aria-hidden>
          <rect x="8.5" y="3" width="7" height="12" rx="3.5" fill="#FFFFFF" stroke={INK} strokeWidth={2.2} />
          <path d="M5.5 11.5 C5.5 15.5 8.5 18 12 18 C15.5 18 18.5 15.5 18.5 11.5" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
          <path d="M12 18 V21.5" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
        </svg>
      </button>

      {/* NAVIGATION — 어항 / 지난 어항 / 편지 */}
      <BottomNav active="home" onNavigate={onNavigate} unreadLetterCount={unreadLetterCount} disabled={thinking} />
    </div>
  );
}

// 기억 캡슐 위 작은 글씨 — 언제 한 말인지. 일주일 안쪽은 흐리게, 그보다 오래되면 날짜로.
function recallWhen(iso: string): string {
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86_400_000;
  if (days < 1) return "아까 니가 한 말";
  if (days < 2) return "어제 니가 한 말";
  if (days < 7) return "며칠 전에 니가 한 말";
  return `${d.getMonth() + 1}월 ${d.getDate()}일에 니가 한 말`;
}

function ShellIcon({ on }: { on: boolean }) {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
      {/* 소라 */}
      <path
        d="M6 24 C5 15 11 7 19 7 C25 7 28 12 26 17 C24.5 21 20 22 17.5 20 C15.5 18.4 16.5 15 19 15.5"
        fill="none"
        stroke={INK}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path d="M6 24 C10 27 18 28 24 25 C27 23.5 28 21 27 19" fill={on ? "#FF8FB3" : "#FFD3E2"} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <path d="M6 24 C9 21 14 20 19 21" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      {on ? (
        <>
          <path className="tl-wave1" d="M29 9 Q31.5 11.5 29 14" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
          <path className="tl-wave2" d="M31.5 6.5 Q35 11.5 31.5 16.5" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : (
        <path d="M28.5 8 L33 14 M33 8 L28.5 14" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" opacity={0.55} />
      )}
    </svg>
  );
}

const CSS = `
@keyframes tlBreathe { 0%,100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.045); } }
@keyframes tlBubbleIn {
  0% { opacity: 0; transform: translateY(10px) scale(0.9) rotate(-1deg); }
  60% { opacity: 1; transform: translateY(-2px) scale(1.03) rotate(-1deg); }
  100% { opacity: 1; transform: translateY(0) scale(1) rotate(-1deg); }
}
.tl-mic { position: fixed; left: 50%; bottom: calc(80px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 90; width: 84px; height: 84px; border-radius: 50%; border: 4px solid ${INK}; box-shadow: 5px 5px 0 ${INK}; display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background .2s, box-shadow .12s; }
.tl-mic-idle { background: #FFD23F; animation: tlBreathe 2.8s ease-in-out infinite; }
.tl-mic-busy { background: #FFD23F; opacity: .55; cursor: default; }
.tl-mic:not(:disabled):active { animation: none; transform: translate(calc(-50% + 4px), 4px); box-shadow: 1px 1px 0 ${INK}; }
.tl-mic:focus-visible { outline: 3px dashed #fff; outline-offset: 4px; }
.tl-sticker:focus-visible, .tl-close:focus-visible, .tl-sticker:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 ${INK} !important; }
.tl-sea-in { animation: tlSeaIn .35s ease-out both; }
@keyframes tlSeaIn { from { opacity: 0; } to { opacity: 1; } }
.tl-bubble { animation: tlBubbleIn .4s ease-out both; }
.tl-bubble-late { animation-delay: 1.1s; }
.tl-recall { display: flex; flex-direction: column; align-items: center; animation: tlRecallIn .7s cubic-bezier(.3,1.5,.5,1) both; }
@keyframes tlRecallIn { 0% { opacity: 0; transform: translateY(40px) scale(.6); } 60% { opacity: 1; transform: translateY(-4px) scale(1.04); } 100% { opacity: 1; transform: none; } }
.tl-recall-cap { animation: tlGlow 2.4s ease-in-out .7s infinite; }
@keyframes tlGlow { 0%,100% { box-shadow: 0 0 0 5px rgba(255,226,107,.45), 0 0 26px 6px rgba(255,226,107,.55), 4px 4px 0 ${INK}; } 50% { box-shadow: 0 0 0 9px rgba(255,226,107,.3), 0 0 40px 12px rgba(255,226,107,.7), 4px 4px 0 ${INK}; } }
.tl-recall-link { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 0; }
.tl-recall-link span { display: block; border-radius: 50%; background: #FFFFFF; border: 2px solid ${INK}; opacity: 0; animation: tlDot .3s ease-out both; }
.tl-recall-link span:nth-child(1) { width: 7px; height: 7px; animation-delay: .7s; }
.tl-recall-link span:nth-child(2) { width: 9px; height: 9px; animation-delay: .82s; }
.tl-recall-link span:nth-child(3) { width: 11px; height: 11px; animation-delay: .94s; }
@keyframes tlDot { from { opacity: 0; transform: scale(.3); } to { opacity: 1; transform: none; } }
.tl-shell { width: 46px; height: 46px; border-radius: 50%; border: 3px solid ${INK}; background: #FFFFFF; box-shadow: 3px 3px 0 ${INK}; display: flex; align-items: center; justify-content: center; padding: 0 0 0 2px; cursor: pointer; pointer-events: auto; -webkit-tap-highlight-color: transparent; }
.tl-shell-on { background: #FFF1C2; }
.tl-wave1 { animation: tlWave 1.6s ease-in-out infinite; }
.tl-wave2 { animation: tlWave 1.6s ease-in-out .3s infinite; }
@keyframes tlWave { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .tl-sea-in, .tl-mic-idle, .tl-bubble, .tl-wave1, .tl-wave2, .tl-recall, .tl-recall-cap, .tl-recall-link span { animation: none; opacity: 1; } }
`;

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: "relative",
    minHeight: "100dvh",
    maxWidth: "480px",
    marginLeft: "auto",
    marginRight: "auto",
    overflowX: "hidden",
    fontFamily: "'Jua', sans-serif",
    color: INK,
    backgroundColor: DEEP,
    // 맨 아래 바닥이 마이크/탭바 뒤에 가려지지 않게
    paddingBottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
  },
  header: {
    position: "fixed",
    top: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: "480px",
    boxSizing: "border-box",
    zIndex: 80,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "calc(64px + env(safe-area-inset-top, 0px))",
    paddingTop: "env(safe-area-inset-top, 0px)",
    paddingLeft: 16,
    paddingRight: 16,
    pointerEvents: "none",
  },
  logo: {
    fontSize: 26,
    letterSpacing: "-0.5px",
    transform: "rotate(-4deg)",
    display: "inline-block",
    color: "#FFFFFF",
    WebkitTextStroke: `1.5px ${INK}`,
    textShadow: `3px 3px 0 ${INK}`,
  },
  bubbleSlot: {
    position: "absolute",
    top: "calc(76px + env(safe-area-inset-top, 0px))",
    left: 20,
    right: 20,
    zIndex: 20,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  // 기억 캡슐 — 참견이가 꺼내 온 "그때 니가 한 말". 노란 빛을 내며 말풍선보다 먼저 떠오른다.
  recallWrap: {
    width: "100%",
    maxWidth: 320,
  },
  recallCap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "10px 18px 13px",
    background: "#FFF4C2",
    border: `3px solid ${INK}`,
    borderRadius: 20,
    transform: "rotate(-2deg)",
    textAlign: "center",
  },
  recallWhen: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "rgba(27,22,48,.6)",
  },
  recallQuote: {
    fontSize: 18,
    lineHeight: 1.4,
    wordBreak: "keep-all",
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
  confirmAsk: {
    fontSize: 17,
    lineHeight: 1.4,
    wordBreak: "keep-all",
  },
  confirmQuote: {
    fontSize: 15,
    lineHeight: 1.45,
    color: "rgba(27,22,48,.7)",
    wordBreak: "keep-all",
  },
  confirmRow: {
    display: "flex",
    gap: 10,
    marginTop: 6,
  },
  confirmBtn: {
    minHeight: 44,
    padding: "0 16px",
    borderRadius: 14,
    border: `3px solid ${INK}`,
    background: "#FFFFFF",
    boxShadow: `3px 3px 0 ${INK}`,
    fontFamily: "'Jua', sans-serif",
    fontSize: 16,
    color: INK,
    cursor: "pointer",
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
};
