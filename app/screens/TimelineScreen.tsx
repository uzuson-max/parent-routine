"use client";

import { useEffect } from "react";
import FishTank from "@/components/FishTank";
import { BottomNav, MyButton, type WorldTab } from "@/components/WorldNav";
import { acquireMicStream } from "@/lib/micStream";
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
//   confirm — 받아쓴 내용이 무음 환각("시청해주셔서 감사합니다" 등)처럼 보일 때. text는 받아쓴 내용이고,
//             [맞아]를 누르면 그대로 저장, [아니]를 누르면 버린다(onConfirmSpeech).
export interface HomeBubble {
  kind: "reply" | "notice" | "confirm";
  text: string;
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
}

const WALL = "#FFE9A8";
const INK = "#1B1630";

// ============================================================================
// Home C안 — 금붕어 어항.
//   마이크(또는 어항)를 누르면 물속 녹음 화면(TankRecordingScreen)으로 가고,
//   다 말하고 돌아오면 어항 가운데 물방울이 꿀렁거리다(thinking)
//   → 참견이의 대답이 어항 위 말풍선으로 뜨고, 새 치어/금붕어가 퐁당 들어온다.
// 확인(commitment)/전화처럼 따로 화면이 필요한 경우만 page.tsx가 기존 화면으로 넘긴다.
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
}: TimelineScreenProps) {
  // 홈에 있는 동안은 기기 화면 끝(노치/홈 인디케이터 영역)까지 어항 벽 색으로 맞춘다.
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = WALL;
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  const hasCallback = !!(proactiveLine && proactiveLine.content);

  const handleMic = () => {
    if (thinking) return;
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
  const shown: { stamp: string | null; text: string; closable: boolean } | null = bubble
    ? { stamp: bubble.kind === "reply" ? "참견이" : null, text: bubble.text, closable: true }
    : hasCallback && proactiveLine
    ? { stamp: "참견이 등장.", text: proactiveLine.content, closable: false }
    : null;
  const replying = !!bubble ? bubble.kind === "reply" : hasCallback;

  return (
    <div style={styles.container}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* HEADER — 로고 + MY(설정) 아이콘만. 편지는 하단 탭으로 옮겼다. */}
      <div style={styles.header}>
        <span style={styles.logo}>참견이</span>
        <MyButton onClick={onOpenMyPage} disabled={thinking} />
      </div>

      <div style={styles.core}>
        {/* 어항 위 말풍선 — 참견이의 대답 / 먼저 꺼낸 말 / 짧은 안내 */}
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
              <div key={shown.text} className="tl-bubble" style={styles.bubble} role="status">
                {shown.stamp && <span style={styles.bubbleStamp}>{shown.stamp}</span>}
                <span style={styles.bubbleText}>{shown.text}</span>
                {shown.closable && (
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
            )
          )}
        </div>

        <div
          style={{
            ...styles.tankBox,
            // 확인 말풍선은 버튼까지 있어서 키가 크다 — 그동안은 어항을 조금 줄여 마이크가 메뉴 뒤로 밀리지 않게.
            ...(bubble?.kind === "confirm" && !thinking
              ? { width: "min(100%, clamp(200px, calc((100dvh - 540px) * 0.67), 340px))" }
              : null),
          }}
        >
          <FishTank entries={entries} thinking={thinking} onTankPress={handleMic} />
        </div>

        {/* 마이크 */}
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
      </div>

      {/* NAVIGATION — 어항 / 지난 어항 / 편지 */}
      <BottomNav active="home" onNavigate={onNavigate} unreadLetterCount={unreadLetterCount} disabled={thinking} />
    </div>
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
.tl-mic { position: relative; z-index: 2; flex-shrink: 0; width: 84px; height: 84px; border-radius: 50%; border: 4px solid ${INK}; box-shadow: 5px 5px 0 ${INK}; display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background .2s, box-shadow .12s, transform .12s; }
.tl-mic-idle { background: #FFD23F; animation: tlBreathe 2.8s ease-in-out infinite; }
.tl-mic-busy { background: #FFD23F; opacity: .55; cursor: default; }
.tl-mic:not(:disabled):active { animation: none; transform: translate(4px,4px); box-shadow: 1px 1px 0 ${INK}; }
.tl-mic:focus-visible, .tl-sticker:focus-visible, .tl-close:focus-visible, .tl-sticker:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 ${INK} !important; }
.tl-bubble { animation: tlBubbleIn .4s ease-out both; }
@media (prefers-reduced-motion: reduce) { .tl-mic-idle, .tl-bubble { animation: none; } }
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
  // 화면 높이가 낮은 기기에서도 마이크가 내비 뒤로 밀리지 않게 어항 폭을 화면 높이에 맞춰 줄인다.
  tankBox: {
    width: "min(100%, clamp(230px, calc((100dvh - 400px) * 0.67), 340px))",
    flexShrink: 0,
  },

};
