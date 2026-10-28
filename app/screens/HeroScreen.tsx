"use client";

// ============================================================================
// 첫 화면 — 참견이(수달 내레이터)와 마주 보는 옛날 게임 대화 화면 (2026-10-28)
// ----------------------------------------------------------------------------
// - 큰 수달 얼굴 + 아래 대화창. 대화가 위로 쌓이지 않는다 — 지금 해설 한 줄만 보인다.
// - 수달을 한 번 누르면 녹음 시작, 한 번 더 누르면 보낸다(10-28: 꾹 누르기 → 탭). ✎로 글로도 쓸 수 있다.
// - 지난 해설은 두 번째 탭(지난 이야기)에서만 본다.
// 어항/심해/소라 징검다리 화면은 쓰지 않는다(파일은 그대로 보관 — ARCHIVE.md).
// ============================================================================
import { useEffect, useRef, useState } from "react";
import OtterCloseUp, { type CloseUpExpression } from "@/components/OtterCloseUp";
import { useTankRecorder } from "@/lib/useTankRecorder";
import { BABBLE_STEP_MS, babble } from "@/lib/otterBabble";
import { playFx } from "@/lib/fx";
import { releaseMicStream } from "@/lib/micStream";

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
  empty: "주인공은 입을 열려다 말았다. 참견이는 아무것도 듣지 못했다.",
  micFail: "참견이의 귀가 막혔다. 마이크를 쓸 수 없어 글로 듣기로 했다.",
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

  // ---- 눌러서 말하기 (탭 한 번 = 시작, 한 번 더 = 끝) -------------------------
  // 꾹 누르기 방식은 권한 팝업이 뜨는 순간 손가락이 떨어져 녹음이 꼬였다 → 탭 토글로 바꿨다.
  const busyRef = useRef(false);
  const toggleRecord = async () => {
    wakeAudio();
    if (thinking || busyRef.current) return;
    busyRef.current = true;
    try {
      if (recorder.state === "recording") {
        const r = await recorder.finish();
        playFx("micStop");
        releaseMicStream(); // 끝나면 마이크를 바로 꺼둔다(주황 점 꺼짐, 다음엔 팝업 없이 다시 켜짐)
        if (r.kind === "audio") {
          setLocal(null);
          onSend(r.blob);
        } else {
          say(LOCAL.empty, "hmm");
        }
        return;
      }
      if (recorder.state !== "idle") return;
      playFx("micStart");
      const ok = await recorder.start();
      if (!ok) {
        say(LOCAL.micFail, "soft");
        setWriting(true);
      }
    } finally {
      busyRef.current = false;
    }
  };

  const sendText = () => {
    const t = draft.trim();
    if (!t || thinking) return;
    setDraft("");
    setWriting(false);
    setLocal(null);
    onSend(t);
  };

  // ---- 찌릿 — 비장한 순간에만 집중선 + 붓 획 + 눈빛 --------------------------
  const [zap, setZap] = useState(0);
  useEffect(() => {
    if (!line || thinking) return;
    const dramatic = !!line.vow || line.expression === "wow" || DRAMA_WORDS.some((w) => line.text.includes(w));
    if (!dramatic) return;
    setZap(line.key);
    const t = setTimeout(() => setZap(0), 1100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.key]);

  // 내레이터는 기본이 무표정. 웃는 얼굴(smug)·놀람(wow)은 서버가 그렇게 골랐을 때만.
  const expression: CloseUpExpression = recording ? "stare" : thinking ? "hmm" : shown?.expression ?? "stare";
  const sec = Math.floor(recorder.elapsedMs / 1000);
  const trace = thinking ? (heard ? { when: "방금", quote: heard } : null) : shown?.recalled ? { when: agoText(shown.recalled.at), quote: shown.recalled.quote } : shown?.said ? { when: "방금", quote: shown.said } : null;

  return (
    <div style={S.page} onContextMenu={(e) => e.preventDefault()}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* 장 제목 — 책의 한 장처럼 */}
      <header style={S.head}>
        <div className="narr" style={S.chapterTitle}>
          <span style={S.rule} />
          {chapter ? `제 ${chapter} 장` : "서 장"}
          <span style={S.rule} />
        </div>
        <button aria-label="설정" style={S.gear} onClick={onOpenMy}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.creamSoft} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      {/* 무대 — 집중선 + 갓 쓴 내레이터 수달. 누르면 듣는다 */}
      <div style={S.stage}>
        <SpeedLines active={!!zap || recording} />
        {zap ? <div key={zap} className="hero-slash" style={S.slash} /> : null}
        {recording && <div className="hero-ring" style={S.ring} />}
        <button
          aria-label={recording ? "말 끝내기" : "눌러서 말하기"}
          className={zap ? "hero-otter hero-otter-zap" : recording ? "hero-otter hero-otter-on" : "hero-otter"}
          style={S.otterBtn}
          onClick={toggleRecord}
        >
          <div style={{ position: "relative", width: OTTER_W }}>
            <OtterCloseUp expression={expression} width={OTTER_W} />
            <NarratorGat glint={!!zap} />
          </div>
        </button>
      </div>

      {/* 해설 — 화면의 주인공 */}
      <section
        style={S.card}
        onClick={() => {
          wakeAudio();
          if (!doneTyping) setTyped(fullText.length);
        }}
      >
        {trace && (
          <p style={S.trace}>
            {trace.when}, 주인공은 말했다 — “{trace.quote}”
          </p>
        )}
        {thinking ? (
          <p className="hero-dots" style={S.narr}>
            참견이가 붓을 들었다<span>.</span>
            <span>.</span>
            <span>.</span>
          </p>
        ) : (
          <p style={S.narr}>
            {fullText.slice(0, typed) || " "}
            {doneTyping && fullText && <span className="hero-caret">▼</span>}
          </p>
        )}
        {!thinking && doneTyping && shown?.vow && (
          <p className="hero-fade" style={S.vow}>
            선언 · {shown.vow.what}
            {shown.vow.target ? ` · ${shown.vow.target}회` : ""}
            {shown.vow.deadline_label ? ` · ${shown.vow.deadline_label}까지` : " · 기한 없음"}
          </p>
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
      </section>

      {/* 말하기 — 누르기 안내 + 글로 쓰기 */}
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
        <div style={S.inputRow}>
          <span style={recording ? S.hintOn : S.hint}>{recording ? `듣는 중 ${sec}초 · 수달을 다시 누르면 끝` : "수달을 눌러 말하기"}</span>
          <button style={S.writeToggle} onClick={() => setWriting(true)}>
            ✎ 글로 쓰기
          </button>
        </div>
      )}

      <HeroTabs active="hero" onHero={() => {}} onChronicle={onOpenChronicle} />
    </div>
  );
}

const OTTER_W = 256;
// 이런 말이 들어간 해설은 "찌릿" 연출을 붙인다(가끔만 터지게).
const DRAMA_WORDS = ["선언", "강호", "단전", "검", "결전", "봉인", "수련", "소문", "고수", "해냈다", "결국", "마침내", "끝내"];

// 만화식 집중선 — 평소엔 숨기고, 녹음 중·비장한 순간에만 보인다(10-28 정리).
function SpeedLines({ active }: { active: boolean }) {
  const rays = Array.from({ length: 44 }, (_, i) => {
    const a = (i / 44) * Math.PI * 2 + (i % 2 ? 0.02 : 0);
    const w = i % 3 === 0 ? 0.035 : 0.018;
    const r0 = i % 2 ? 150 : 175;
    const p = (ang: number, r: number) => `${200 + Math.cos(ang) * r},${200 + Math.sin(ang) * r}`;
    return `M${p(a - w, 600)} L${p(a, r0)} L${p(a + w, 600)} Z`;
  });
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" style={{ ...S.speed, opacity: active ? 0.3 : 0 }} aria-hidden>
      {rays.map((d, i) => (
        <path key={i} d={d} fill="#F7F0DF" />
      ))}
    </svg>
  );
}

// 해설가 수달의 갓. OtterCloseUp과 같은 300×330 좌표에 겹쳐 그린다.
function NarratorGat({ glint }: { glint: boolean }) {
  const INK = "#171219";
  return (
    <svg viewBox="0 0 300 330" width={OTTER_W} height={(OTTER_W * 330) / 300} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }} aria-hidden>
      {/* 양태(챙) — 말총이라 살짝 비친다 */}
      <ellipse cx={150} cy={60} rx={134} ry={17} fill={INK} opacity={0.85} />
      <ellipse cx={150} cy={57} rx={126} ry={11} fill="none" stroke="#5A4A44" strokeWidth={1.5} opacity={0.6} />
      {/* 대우(모자 몸통) */}
      <path d="M106 58 L112 -2 C114 -12 186 -12 188 -2 L194 58 Z" fill={INK} opacity={0.92} />
      <path d="M108 44 L192 44" stroke="#6B5A52" strokeWidth={4} opacity={0.7} />
      {/* 찌릿 — 눈빛 */}
      {glint && (
        <path className="hero-glint" d="M214 108 L218 120 L230 124 L218 128 L214 140 L210 128 L198 124 L210 120 Z" fill="#FFFFFF" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      )}
    </svg>
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

// 장 제목만 명조체(해설 본문은 앱 기본 글씨로 통일 — 10-28) — 전역 폰트(!important)보다 우선하도록 클래스로 지정한다.
const CSS = `
.narr, .narr * { font-family: 'Nanum Myeongjo', serif !important; }
.hero-otter { animation: heroBob 3.6s ease-in-out infinite; transition: transform .15s ease; }
.hero-otter-on { animation: none; transform: scale(1.04); }
.hero-otter-zap { animation: heroZap .5s ease-out; }
@keyframes heroBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes heroZap { 0% { transform: translateX(0) scale(1.06); } 20% { transform: translateX(-5px) scale(1.06); } 40% { transform: translateX(5px) scale(1.04); } 60% { transform: translateX(-3px); } 100% { transform: none; } }
.hero-slash { animation: heroSlash .55s cubic-bezier(.2,.8,.2,1) both; }
@keyframes heroSlash { 0% { clip-path: inset(0 100% 0 0); opacity: 1; } 55% { clip-path: inset(0 0 0 0); opacity: 1; } 100% { clip-path: inset(0 0 0 0); opacity: 0; } }
.hero-glint { transform-origin: 214px 124px; animation: heroGlint .9s ease-out both; }
@keyframes heroGlint { 0% { transform: scale(0) rotate(0); opacity: 0; } 30% { transform: scale(1.2) rotate(20deg); opacity: 1; } 100% { transform: scale(.8) rotate(45deg); opacity: 0; } }
.hero-ring { animation: heroRing 1.1s ease-out infinite; }
@keyframes heroRing { from { transform: translate(-50%,-50%) scale(.85); opacity: .7; } to { transform: translate(-50%,-50%) scale(1.25); opacity: 0; } }
.hero-caret { display: inline-block; margin-left: 6px; font-size: 11px; animation: heroBlink 1s steps(2) infinite; color: ${C.accent}; }
@keyframes heroBlink { 50% { opacity: 0; } }
.hero-dots span { animation: heroBlink 1.2s steps(2) infinite; }
.hero-dots span:nth-child(2) { animation-delay: .2s; } .hero-dots span:nth-child(3) { animation-delay: .4s; }
.hero-fade { animation: heroFade .35s ease-out; }
@keyframes heroFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .hero-otter, .hero-otter-zap, .hero-slash, .hero-glint, .hero-ring, .hero-caret, .hero-dots span { animation: none; } }
`;

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    background: "radial-gradient(90% 55% at 50% 40%, #2C6A45 0%, #1A4A2E 55%, #0F2A1B 100%)",
    color: C.cream,
    fontFamily: "Jua, sans-serif",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    paddingBottom: "calc(52px + max(8px, env(safe-area-inset-bottom, 0px) - 14px))",
    overflow: "hidden",
  },
  // 상단 안전영역 — env()가 0으로 잡히는 기기도 있어서 최소 32px(다른 화면과 같은 방식)
  head: { position: "relative", display: "flex", justifyContent: "center", alignItems: "center", padding: "0 16px", paddingTop: "max(32px, calc(env(safe-area-inset-top, 0px) + 14px))" },
  chapterTitle: { display: "flex", alignItems: "center", gap: 12, fontSize: 22, fontWeight: 800, letterSpacing: 4, color: C.cream },
  rule: { display: "inline-block", width: 34, height: 1, background: C.creamFaint },
  gear: { position: "absolute", right: 10, bottom: -6, background: "transparent", border: "none", padding: 6, cursor: "pointer" },
  stage: { position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 250 },
  speed: { position: "absolute", inset: 0, width: "100%", height: "100%", transition: "opacity .25s ease", pointerEvents: "none" },
  slash: { position: "absolute", left: "-10%", right: "-10%", top: "46%", height: 10, background: "linear-gradient(90deg, transparent, #F7F0DF 20%, #FFFFFF 50%, #F7F0DF 80%, transparent)", transform: "rotate(-14deg)", boxShadow: "0 0 18px rgba(255,255,255,0.6)", pointerEvents: "none", zIndex: 2 },
  ring: { position: "absolute", left: "50%", top: "50%", width: 280, height: 280, borderRadius: "50%", border: `4px solid ${C.accent}`, pointerEvents: "none" },
  otterBtn: { position: "relative", zIndex: 1, background: "transparent", border: "none", padding: "40px 0 0", cursor: "pointer", touchAction: "none", WebkitTapHighlightColor: "transparent" },
  card: {
    margin: "0 14px",
    background: "rgba(12,10,16,0.72)",
    borderRadius: 16,
    padding: "18px 20px 18px",
    minHeight: 132,
    cursor: "pointer",
  },
  trace: { margin: "0 0 8px", fontSize: 12, lineHeight: 1.4, color: "rgba(247,240,223,0.38)", wordBreak: "keep-all", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" },
  narr: { margin: 0, fontSize: 18, fontWeight: 400, lineHeight: 1.6, letterSpacing: -0.2, color: C.cream, wordBreak: "keep-all", whiteSpace: "pre-wrap" },
  vow: { margin: "12px 0 0", fontSize: 13, color: "rgba(255,210,111,0.8)", wordBreak: "keep-all" },
  actionBox: { marginTop: 12 },
  actionText: { fontSize: 15, color: C.creamSoft, lineHeight: 1.45 },
  actionRow: { display: "flex", gap: 10, marginTop: 10 },
  choice: { background: "transparent", color: C.accent, border: `1.5px solid ${C.accent}`, borderRadius: 8, padding: "6px 12px", fontFamily: "inherit", fontSize: 15, cursor: "pointer" },
  inputRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 22px 4px" },
  hint: { fontSize: 13, color: C.creamFaint },
  hintOn: { fontSize: 13, color: C.accent },
  writeToggle: { background: "transparent", border: "none", color: C.creamSoft, fontFamily: "inherit", fontSize: 13, cursor: "pointer", padding: 0 },
  writeRow: { display: "flex", gap: 6, margin: "10px 14px 0" },
  input: { flex: 1, minWidth: 0, background: "rgba(247,240,223,0.95)", color: C.ink, border: `2px solid ${C.ink}`, borderRadius: 10, padding: "10px 12px", fontSize: 16, fontFamily: "inherit", userSelect: "text", WebkitUserSelect: "text" },
  sendBtn: { background: C.accent, color: C.ink, border: `2px solid ${C.ink}`, borderRadius: 10, padding: "0 14px", fontFamily: "inherit", fontSize: 15, cursor: "pointer" },
  closeBtn: { background: "transparent", color: C.creamSoft, border: "none", fontSize: 16, padding: "0 6px", cursor: "pointer" },
  tabs: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    background: "rgba(12,10,16,0.97)",
    borderTop: `1px solid rgba(247,240,223,0.12)`,
    // 홈 인디케이터 영역을 통째로 더하면 탭이 두 줄처럼 길어 보인다 → 조금 덜어낸다(최소 8px)
    paddingBottom: "max(8px, calc(env(safe-area-inset-bottom, 0px) - 14px))",
    zIndex: 50,
  },
  tab: { flex: 1, height: 48, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: C.creamFaint, fontFamily: "Jua, sans-serif", fontSize: 16, cursor: "pointer" },
  tabOn: { color: C.accent },
};
