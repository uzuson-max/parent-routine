"use client";

// ============================================================================
// 첫 화면 — 참견이(수달 내레이터)와 마주 보는 옛날 게임 대화 화면 (2026-10-28)
// ----------------------------------------------------------------------------
// - 큰 수달 얼굴 + 아래 대화창. 대화가 위로 쌓이지 않는다 — 지금 해설 한 줄만 보인다.
// - 수달을 꾹 누르고 있는 동안 녹음, 손을 떼면 보낸다(무전기 방식). ✎로 글로도 쓸 수 있다.
// - 지난 해설은 두 번째 탭(지난 이야기)에서만 본다.
// 어항/심해/소라 징검다리 화면은 쓰지 않는다(파일은 그대로 보관 — ARCHIVE.md).
// ============================================================================
import { useEffect, useRef, useState } from "react";
import OtterCloseUp, { type CloseUpExpression } from "@/components/OtterCloseUp";
import { useTankRecorder } from "@/lib/useTankRecorder";
import { BABBLE_STEP_MS, babble } from "@/lib/otterBabble";
import { playFx } from "@/lib/fx";

export interface NarratorLine {
  text: string;
  expression: CloseUpExpression;
  key: number;
  recalled?: { quote: string; at: string } | null;
  said?: string | null; // 이 해설이 받아친 주인공의 말(방금 녹음/글). 오프닝 해설엔 없음
  vow?: { what: string; target: number | null; deadline_label: string | null } | null; // 이번에 새로 선언한 다짐
}

export type HeroAction = { kind: "confirm"; text: string } | { kind: "retry" } | null;

interface Props {
  chapter: number | null;
  line: NarratorLine | null;
  heard: string | null;
  thinking: boolean;
  action: HeroAction;
  onSend: (input: Blob | string) => void;
  onConfirm: (yes: boolean) => void;
  onRetry: () => void;
  onOpenMy: () => void;
  onOpenChronicle: () => void;
}

const C = {
  ink: "#141019",
  cream: "#F7F0DF",
  creamSoft: "rgba(247,240,223,0.72)",
  creamFaint: "rgba(247,240,223,0.45)",
  tag: "#FFD26F",
  accent: "#FFD26F",
};

const LOCAL = {
  empty: "주인공은 아무 말도 하지 않았다. 참견이를 꾹 누른 채로 말해야 한다.",
  micFail: "참견이의 귀가 막혔다. 마이크를 쓸 수 없어 글로 듣기로 했다.",
  hint: "참견이는 꾹 눌러야 듣는다. 짧게 누르면 그냥 간지럽다.",
};

function agoText(iso: string): string {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "오늘";
  if (d === 1) return "어제";
  return `${d}일 전`;
}

export default function HeroScreen({ chapter, line, heard, thinking, action, onSend, onConfirm, onRetry, onOpenMy, onOpenChronicle }: Props) {
  const [local, setLocal] = useState<NarratorLine | null>(null);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const audioRef = useRef<AudioContext | null>(null);
  const pressRef = useRef<{ down: boolean; at: number }>({ down: false, at: 0 });

  const recorder = useTankRecorder((r) => {
    // 3분 자동 정지
    if (r.kind === "audio") onSend(r.blob);
  });
  const recording = recorder.state === "recording" || recorder.state === "starting";

  // 서버에서 새 해설이 오면 로컬 안내는 내린다.
  useEffect(() => {
    setLocal(null);
  }, [line?.key]);

  const shown: NarratorLine | null = local ?? line;

  // ---- 타이핑 + 수달어 ----------------------------------------------------
  const [typed, setTyped] = useState(0);
  const fullText = thinking ? "" : shown?.text ?? "";
  useEffect(() => {
    setTyped(0);
    if (!fullText) return;
    let i = 0;
    const step = BABBLE_STEP_MS.mild;
    const t = setInterval(() => {
      i += 1;
      const ch = fullText[i - 1];
      if (ch) babble(audioRef.current, ch, "mild", i - 1);
      setTyped(i);
      if (i >= fullText.length) clearInterval(t);
    }, step);
    return () => clearInterval(t);
  }, [fullText, shown?.key]);
  const doneTyping = typed >= fullText.length;

  const wakeAudio = () => {
    if (audioRef.current) {
      if (audioRef.current.state === "suspended") audioRef.current.resume().catch(() => {});
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) audioRef.current = new Ctx();
    } catch {
      /* 소리 없이도 화면은 그대로 */
    }
  };

  const say = (text: string, expression: CloseUpExpression = "hmm") => setLocal({ text, expression, key: Date.now() });

  // ---- 꾹 눌러 말하기 -----------------------------------------------------
  const pressStart = async (e: React.PointerEvent) => {
    e.preventDefault();
    wakeAudio();
    if (thinking || recording) return;
    pressRef.current = { down: true, at: Date.now() };
    playFx("micStart");
    const ok = await recorder.start();
    if (!ok) {
      pressRef.current.down = false;
      say(LOCAL.micFail, "soft");
      setWriting(true);
      return;
    }
    // 시작되기 전에 이미 손을 뗐다
    if (!pressRef.current.down) finishPress(true);
  };

  const finishPress = async (released: boolean) => {
    const short = Date.now() - pressRef.current.at < 450;
    const r = await recorder.finish();
    playFx("micStop");
    if (r.kind === "audio") {
      setLocal(null);
      onSend(r.blob);
    } else if (released && short) {
      say(LOCAL.hint, "hmm");
    } else {
      say(LOCAL.empty, "hmm");
    }
  };

  const pressEnd = () => {
    if (!pressRef.current.down) return;
    pressRef.current.down = false;
    if (recorder.state === "recording") finishPress(true);
  };

  const sendText = () => {
    const t = draft.trim();
    if (!t || thinking) return;
    setDraft("");
    setWriting(false);
    setLocal(null);
    onSend(t);
  };

  const expression: CloseUpExpression = recording ? "stare" : thinking ? "hmm" : shown?.expression ?? "stare";
  const sec = Math.floor(recorder.elapsedMs / 1000);

  return (
    <div style={S.page} onContextMenu={(e) => e.preventDefault()}>
      <style>{CSS}</style>

      {/* 상단 — 제 N장 / 설정 */}
      <div style={S.top}>
        <span />
        <button aria-label="설정" style={S.gear} onClick={onOpenMy}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.cream} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* 수달 — 꾹 누르면 듣는다 */}
      <div style={S.stage}>
        {recording && <div className="hero-ring" style={S.ring} />}
        <button
          aria-label="꾹 누르고 말하기"
          className={recording ? "hero-otter hero-otter-on" : "hero-otter"}
          style={S.otterBtn}
          onPointerDown={pressStart}
          onPointerUp={pressEnd}
          onPointerCancel={pressEnd}
          onPointerLeave={pressEnd}
        >
          <OtterCloseUp expression={expression} width={196} />
        </button>
        <div style={S.pressHint}>{recording ? `듣는 중 ${sec}초 · 손을 떼면 끝` : thinking ? " " : "참견이를 꾹 누르고 말하기"}</div>
      </div>

      {/* 해설 카드 — 화면의 중심. 위: 주인공의 지난 말/방금 한 말(행적) → 가운데: 해설 → 아래: 선언 기록 */}
      <div style={S.dialogWrap}>
        <div style={S.nameTag}>{chapter ? `제${chapter}장` : "서장"}</div>
        <div
          style={S.dialog}
          onClick={() => {
            wakeAudio();
            if (!doneTyping) setTyped(fullText.length);
          }}
        >
          {/* 행적 — 해설이 무엇을 두고 하는 말인지 */}
          {!thinking && shown?.recalled && (
            <p style={S.trace}>
              <span style={S.traceWhen}>{agoText(shown.recalled.at)} · 주인공</span> “{shown.recalled.quote}”
            </p>
          )}
          {(thinking ? heard : shown?.said) && (
            <p style={S.trace}>
              <span style={S.traceWhen}>방금 · 주인공</span> “{thinking ? heard : shown?.said}”
            </p>
          )}
          {thinking ? (
            <span className="hero-dots" style={S.text}>
              참견이가 붓을 들었다<span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          ) : (
            <span style={S.text}>
              {fullText.slice(0, typed) || (shown ? "" : " ")}
              {doneTyping && fullText && <span className="hero-caret">▼</span>}
            </span>
          )}

          {/* 선언 기록 — 다짐이 데이터가 아니라 이야기의 시작으로 남는다 */}
          {!thinking && doneTyping && shown?.vow && (
            <div className="hero-fade" style={S.vow}>
              <span style={S.vowLabel}>선언</span>
              {shown.vow.what}
              {shown.vow.target ? ` · ${shown.vow.target}회` : ""}
              {shown.vow.deadline_label ? ` · ${shown.vow.deadline_label}까지` : " · 기한 없음"}
            </div>
          )}

          {action?.kind === "confirm" && !thinking && (
            <div style={S.actionBox}>
              <div style={S.actionText}>주인공은 이렇게 말했다…? “{action.text}”</div>
              <div style={S.actionRow}>
                <button style={S.choice} onClick={() => onConfirm(true)}>▶ 맞다</button>
                <button style={S.choice} onClick={() => onConfirm(false)}>▶ 아니다</button>
              </div>
            </div>
          )}
          {action?.kind === "retry" && !thinking && (
            <div style={S.actionRow}>
              <button style={S.choice} onClick={onRetry}>▶ 다시 보내기</button>
            </div>
          )}
        </div>

        {/* 글로 쓰기 */}
        {writing ? (
          <div style={S.writeRow}>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) sendText();
              }}
              placeholder="주인공의 말"
              style={S.input}
            />
            <button style={S.sendBtn} onClick={sendText} disabled={!draft.trim() || thinking}>
              보내기
            </button>
            <button style={S.closeBtn} onClick={() => setWriting(false)} aria-label="닫기">
              ✕
            </button>
          </div>
        ) : (
          <button style={S.writeToggle} onClick={() => setWriting(true)}>
            ✎ 글로 쓰기
          </button>
        )}
      </div>

      {/* 하단 탭 */}
      <HeroTabs active="hero" onHero={() => {}} onChronicle={onOpenChronicle} />
    </div>
  );
}

// 하단 탭 — 지난 이야기 화면도 같은 걸 쓴다.
export function HeroTabs({ active, onHero, onChronicle }: { active: "hero" | "chronicle"; onHero: () => void; onChronicle: () => void }) {
  return (
    <nav style={S.tabs}>
      <button style={{ ...S.tab, ...(active === "hero" ? S.tabOn : {}) }} onClick={onHero}>
        참견이
      </button>
      <button style={{ ...S.tab, ...(active === "chronicle" ? S.tabOn : {}) }} onClick={onChronicle}>
        지난 이야기
      </button>
    </nav>
  );
}

const CSS = `
.hero-otter { animation: heroBob 3.2s ease-in-out infinite; transition: transform .15s ease; }
.hero-otter-on { animation: none; transform: scale(1.04); }
@keyframes heroBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.hero-ring { animation: heroRing 1.1s ease-out infinite; }
@keyframes heroRing { from { transform: translate(-50%,-50%) scale(.85); opacity: .7; } to { transform: translate(-50%,-50%) scale(1.25); opacity: 0; } }
.hero-caret { display: inline-block; margin-left: 6px; font-size: 12px; animation: heroBlink 1s steps(2) infinite; color: ${C.accent}; }
@keyframes heroBlink { 50% { opacity: 0; } }
.hero-dots span { animation: heroBlink 1.2s steps(2) infinite; }
.hero-dots span:nth-child(2) { animation-delay: .2s; } .hero-dots span:nth-child(3) { animation-delay: .4s; }
.hero-fade { animation: heroFade .35s ease-out; }
@keyframes heroFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .hero-otter, .hero-ring, .hero-caret, .hero-dots span { animation: none; } }
`;

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    background:
      "radial-gradient(120% 60% at 50% 38%, rgba(120,190,120,0.22), transparent 60%), linear-gradient(180deg, #13321F 0%, #1D4A2F 52%, #2A5E36 100%)",
    color: C.cream,
    fontFamily: "Jua, sans-serif",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    paddingBottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
    overflow: "hidden",
  },
  top: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 0" },
  gear: { background: "transparent", border: "none", padding: 6, cursor: "pointer" },
  stage: { position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", minHeight: 260 },
  ring: { position: "absolute", left: "50%", top: "55%", width: 260, height: 260, borderRadius: "50%", border: `4px solid ${C.accent}`, pointerEvents: "none" },
  otterBtn: { background: "transparent", border: "none", padding: 0, cursor: "pointer", touchAction: "none", WebkitTapHighlightColor: "transparent" },
  pressHint: { marginTop: 8, fontSize: 13, color: C.creamFaint, minHeight: 18 },
  trace: { margin: "0 0 6px", fontSize: 13, lineHeight: 1.45, color: C.creamFaint, wordBreak: "keep-all", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  traceWhen: { color: C.creamSoft, marginRight: 4 },
  vow: { marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.creamFaint}`, fontSize: 14, color: C.accent, wordBreak: "keep-all" },
  vowLabel: { display: "inline-block", fontSize: 12, color: C.ink, background: C.accent, borderRadius: 4, padding: "1px 6px", marginRight: 8 },
  dialogWrap: { position: "relative", margin: "18px 14px 0" },
  nameTag: { position: "absolute", top: -14, left: 16, background: C.tag, color: C.ink, fontSize: 14, padding: "3px 12px", borderRadius: 6, border: `2px solid ${C.ink}`, zIndex: 1 },
  dialog: {
    background: "rgba(20,16,25,0.92)",
    border: `3px solid ${C.cream}`,
    boxShadow: `0 0 0 3px ${C.ink}, 0 10px 24px rgba(0,0,0,0.35)`,
    borderRadius: 12,
    padding: "24px 18px 18px",
    minHeight: 120,
    cursor: "pointer",
  },
  text: { display: "block", marginTop: 4, fontSize: 22, lineHeight: 1.5, letterSpacing: -0.3, color: C.cream, wordBreak: "keep-all", whiteSpace: "pre-wrap" },
  actionBox: { marginTop: 12 },
  actionText: { fontSize: 15, color: C.creamSoft, lineHeight: 1.45 },
  actionRow: { display: "flex", gap: 10, marginTop: 10 },
  choice: { background: "transparent", color: C.accent, border: `1.5px solid ${C.accent}`, borderRadius: 8, padding: "6px 12px", fontFamily: "inherit", fontSize: 15, cursor: "pointer" },
  writeToggle: { display: "block", margin: "10px auto 0", background: "transparent", border: "none", color: C.creamFaint, fontFamily: "inherit", fontSize: 14, cursor: "pointer" },
  writeRow: { display: "flex", gap: 6, marginTop: 10 },
  input: { flex: 1, minWidth: 0, background: "rgba(247,240,223,0.95)", color: C.ink, border: `2px solid ${C.ink}`, borderRadius: 10, padding: "10px 12px", fontSize: 16, fontFamily: "inherit", userSelect: "text", WebkitUserSelect: "text" },
  sendBtn: { background: C.accent, color: C.ink, border: `2px solid ${C.ink}`, borderRadius: 10, padding: "0 14px", fontFamily: "inherit", fontSize: 15, cursor: "pointer" },
  closeBtn: { background: "transparent", color: C.creamSoft, border: "none", fontSize: 16, padding: "0 6px", cursor: "pointer" },
  tabs: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    background: "rgba(20,16,25,0.96)",
    borderTop: `2px solid ${C.ink}`,
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
    zIndex: 50,
  },
  tab: { flex: 1, height: 56, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: C.creamFaint, fontFamily: "Jua, sans-serif", fontSize: 17, cursor: "pointer" },
  tabOn: { color: C.accent },
};
