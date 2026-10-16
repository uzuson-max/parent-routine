// app/screens/RiverScreen.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BottomNav, INK, WORLD_CSS, WorldTitle, YELLOW, stickerCard, worldPage, type WorldTab } from "@/components/WorldNav";
import { OtterFace, type OtterExpression } from "@/components/Otter";
import TankRecordingScreen from "./TankRecordingScreen";
import { supabaseClient } from "@/lib/supabaseClient";
import { releaseMicStream } from "@/lib/micStream";
import { playFx } from "@/lib/fx";
import { STAGE_DAYS, stageDay, type ReturnSegment, type StageTone } from "@/lib/stage";
import { readTone } from "@/lib/tone";
import { BABBLE_STEP_MS, babble, isVoiced, type BabbleMode } from "@/lib/otterBabble";

// ============================================================================
// 소라 탭 — 소라 징검다리. (2026-10-15 "강" → 10-16 "조개" → 10-17 "소라". 파일/탭 키는 river 그대로)
// "조개"는 "조개 까다"가 다른 뜻으로 읽힐 수 있어서 뺐다. 소라는 "귀 대면 소리 들린다"라서 목소리 기능과 딱 맞는다.
// ----------------------------------------------------------------------------
// 강은 위에서 아래로, 홈의 바다로 흘러간다. 소라 하나 = 질문 하나 = 하루 하나. 대답한 소라엔 진주가 생긴다.
// 순한맛/매운맛은 여기서 묻지 않는다 — MY에서 고른 값(lib/tone.ts)을 읽기만 한다.
//   - 오늘 돌: 수달이 올라가 기다린다. 누르면 질문 → 물속 녹음 화면(홈과 같은 녹음 → 바다에 물고기로도 들어감)
//   - 돌아오는 날(4·5·6·7일): 수달이 소라를 들고 기다리다가, 답하고 나면 소라에 귀 대게 해서 "그때 니 목소리"를 들려준다
//     엔진 기억이 딱 맞는 바다 자유 녹음을 찾으면 그 목소리도 같이 나온다(api/stage/answer)
//   - 내일 돌: 반쯤 물에 잠겨 있다(카운트다운·연속 기록 없음, 빠져도 실패 없음)
//   - 7일 다음은 물안개 — "저 너머도 가볼래?"(다음 구간 열리면 알려주기 = 관심 신호만 모음)
// 질문/짝/문구: lib/stage.ts · 진행: /api/stage · 저장: /api/stage/answer · 목소리: /api/stage/voice
// ============================================================================

interface DayDone {
  day: number;
  answers: string[];
  answeredAt: string;
  returnSegments: ReturnSegment[] | null;
}
interface Progress {
  days: DayDone[];
  nextDay: number;
  unlocked: boolean;
  finished: boolean;
  length: number;
}

type Flow =
  | { kind: "idle" }
  | { kind: "ask"; day: number; part: 1 | 2; question: string }
  | { kind: "record"; day: number; part: 1 | 2; question: string }
  | { kind: "sending"; day: number; part: 1 | 2; question: string }
  | { kind: "confirm"; day: number; part: 1 | 2; question: string; blob: Blob; transcript: string }
  | { kind: "retry"; day: number; part: 1 | 2; question: string; text: string }
  | { kind: "crossed"; day: number }
  | { kind: "return"; day: number; segments: ReturnSegment[] }
  | { kind: "look"; done: DayDone }
  | { kind: "note"; text: string };

const FOG_KEY = "chamgyeoni_stage_more_asked";
const RETURN_DAYS = new Set(STAGE_DAYS.filter((d) => d.recall?.length).map((d) => d.day));

// 강 그림 좌표(viewBox 360 × H) — 돌 중심
const VB_W = 360;
const TOP = 90;
const GAP = 128;
const XS = [180, 262, 132, 92, 216, 276, 160];
const stonePos = (i: number) => ({ x: XS[i % XS.length], y: TOP + i * GAP });
const FOG_Y = TOP + STAGE_DAYS.length * GAP - 30;
const VB_H = FOG_Y + 230;

async function authed(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) throw new Error("세션 만료 · 새로고침");
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session.access_token}` },
  });
}

export default function RiverScreen({
  onNavigate,
  unreadLetterCount = 0,
}: {
  onNavigate: (tab: WorldTab) => void;
  unreadLetterCount?: number;
}) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tone, setTone] = useState<StageTone>("mild");
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const [fishDrop, setFishDrop] = useState<{ day: number; key: number } | null>(null);
  const [fogAsked, setFogAsked] = useState(false);

  useEffect(() => {
    setTone(readTone());
    try {
      setFogAsked(localStorage.getItem(FOG_KEY) === "1");
    } catch {
      /* 없음 */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await authed("/api/stage");
      const body = await res.json();
      if (!body?.success) throw new Error(body?.error || "불러오기 실패");
      setProgress(body.data);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message || "불러오기 실패");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const t: StageTone = tone;

  // ── 돌 누르기 ────────────────────────────────────────────────
  const onStone = (day: number) => {
    if (!progress) return;
    playFx("buttonPress");
    const done = progress.days.find((d) => d.day === day);
    if (done) {
      setFlow({ kind: "look", done });
      return;
    }
    if (day !== progress.nextDay) {
      setFlow({ kind: "note", text: "아직 잠김\n순서대로 열림" });
      return;
    }
    if (!progress.unlocked) {
      setFlow({ kind: "note", text: "아직 잠김\n내일 열림" });
      return;
    }
    const cfg = stageDay(day);
    if (!cfg) return;
    setFlow({ kind: "ask", day, part: 1, question: cfg.question[t] });
  };

  // ── 녹음 보내기: 홈과 같은 업로드(→ 바다에 물고기) 후 "몇 일차 대답"으로 묶기 ─────────
  const send = async (day: number, part: 1 | 2, question: string, blob: Blob, confirmed = false) => {
    setFlow({ kind: "sending", day, part, question });
    try {
      let phone = "";
      try {
        phone = localStorage.getItem("ganseobi_phone") || "";
      } catch {
        /* 없음 */
      }
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      form.append("phone", phone);
      form.append("persona", "coach");
      // 강 모드 — 엔진이 질문 맥락과 함께 기억하고, 홈 대답·전화·걱정이는 만들지 않는다(api/voice/upload)
      form.append("stage_day", String(day));
      form.append("stage_part", String(part));
      if (confirmed) form.append("speech_confirmed", "1");
      const up = await authed("/api/voice/upload", { method: "POST", body: form });
      const upBody = await up.json().catch(() => null);
      if (!up.ok || !upBody?.success) throw new Error(upBody?.error || "전송 실패");
      if (upBody.data?.no_speech) {
        setFlow({ kind: "retry", day, part, question, text: "잘 안 들림\n다시 녹음" });
        return;
      }
      if (upBody.data?.needs_confirm) {
        setFlow({ kind: "confirm", day, part, question, blob, transcript: String(upBody.data.transcript || "") });
        return;
      }
      const entryId = upBody.data?.id;
      if (!entryId) throw new Error("전송 실패");

      const res = await authed("/api/stage/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, part, entryId, tone: t }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.error || "저장 실패");

      setFishDrop({ day, key: Date.now() });
      if (body.data?.followUp) {
        setFlow({ kind: "ask", day, part: 2, question: body.data.followUp });
        return;
      }
      await load();
      if (body.data?.returnSegments) {
        setFlow({ kind: "return", day, segments: body.data.returnSegments });
      } else {
        setFlow({ kind: "crossed", day });
      }
    } catch (e: any) {
      setFlow({ kind: "retry", day, part, question, text: e?.message || "오류\n다시 시도" });
    }
  };

  const askMore = async () => {
    playFx("buttonPress");
    setFogAsked(true);
    try {
      localStorage.setItem(FOG_KEY, "1");
    } catch {
      /* 없음 */
    }
    try {
      await authed("/api/user/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "[강] 다음 구간 열리면 알려줘" }),
      });
    } catch {
      /* 신호 하나 못 보내도 화면은 그대로 */
    }
  };

  // ── 녹음 중엔 물속 화면 전체 ───────────────────────────────
  if (flow.kind === "record") {
    const { day, part, question } = flow;
    return (
      <TankRecordingScreen
        replyTo={question}
        onDone={(blob) => {
          releaseMicStream();
          send(day, part, question, blob);
        }}
        onCancel={() => {
          playFx("buttonPress");
          releaseMicStream();
          setFlow({ kind: "ask", day, part, question });
        }}
        onMicFailed={() => {
          releaseMicStream();
          setFlow({ kind: "note", text: "마이크 권한 필요\n브라우저 설정에서 허용" });
        }}
      />
    );
  }

  // ── 강 ─────────────────────────────────────────────────────
  const doneDays = new Set(progress?.days.map((d) => d.day) ?? []);
  const nextDay = progress?.nextDay ?? 1;
  const unlocked = progress?.unlocked ?? false;
  const otterIdx = Math.min(nextDay, STAGE_DAYS.length) - 1;
  const otterAt = stonePos(progress?.finished ? STAGE_DAYS.length - 1 : unlocked ? otterIdx : Math.max(0, nextDay - 2));
  const otterMood: OtterExpression = progress?.finished ? "proud" : unlocked ? (RETURN_DAYS.has(nextDay) ? "sly" : "tilt") : "sleep";
  const otterHasShell = !!progress && unlocked && !progress.finished && RETURN_DAYS.has(nextDay);

  const riverPath = (() => {
    const pts = STAGE_DAYS.map((_, i) => stonePos(i));
    let d = `M ${pts[0].x} -40 C ${pts[0].x} 20, ${pts[0].x} ${pts[0].y - 40}, ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const my = (a.y + b.y) / 2;
      d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
    }
    const last = pts[pts.length - 1];
    d += ` C ${last.x} ${last.y + 70}, 180 ${FOG_Y + 40}, 180 ${VB_H + 40}`;
    return d;
  })();

  return (
    <div style={worldPage}>
      <style dangerouslySetInnerHTML={{ __html: WORLD_CSS + RIVER_CSS }} />
      <WorldTitle>소라에 귀 대보실 분....</WorldTitle>

      {loadError && (
        <div style={{ ...stickerCard, padding: 16, marginBottom: 12, fontSize: 15 }}>
          {loadError}{" "}
          <button className="wn-sticker" style={smallBtn} onClick={load}>
            다시
          </button>
        </div>
      )}

      <div style={{ position: "relative", width: "100%", aspectRatio: `${VB_W} / ${VB_H}` }}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
          <path d={riverPath} fill="none" stroke={INK} strokeWidth={84} strokeLinecap="round" />
          <path d={riverPath} fill="none" stroke="#5CCBF2" strokeWidth={76} strokeLinecap="round" />
          <path d={riverPath} fill="none" stroke="#9BE3FA" strokeWidth={3} strokeDasharray="10 26" strokeLinecap="round" className="rv-flow" />
          {/* 물안개 */}
          <g className="rv-fog">
            <ellipse cx={120} cy={FOG_Y + 70} rx={120} ry={46} fill="#FFFFFF" opacity={0.92} />
            <ellipse cx={250} cy={FOG_Y + 90} rx={130} ry={50} fill="#FFFFFF" opacity={0.92} />
            <ellipse cx={180} cy={FOG_Y + 130} rx={170} ry={56} fill="#FFFFFF" opacity={0.95} />
          </g>
        </svg>

        {STAGE_DAYS.map((cfg, i) => {
          const p = stonePos(i);
          const done = doneDays.has(cfg.day);
          const isNext = cfg.day === nextDay && !progress?.finished;
          const today = isNext && unlocked;
          const sunk = !done && !today;
          return (
            <button
              key={cfg.day}
              className={`rv-stone ${today ? "rv-today" : ""} ${sunk ? "rv-sunk" : ""}`}
              style={{
                left: `${(p.x / VB_W) * 100}%`,
                top: `${(p.y / VB_H) * 100}%`,
              }}
              onClick={() => onStone(cfg.day)}
              aria-label={done ? `${cfg.day}일차, 진주 생긴 소라` : today ? `${cfg.day}일차, 오늘 소라` : `${cfg.day}일차, 아직 잠긴 소라`}
            >
              <ConchStone fill={done ? YELLOW : today ? "#FFC9D9" : "#C9D6DE"} pearl={done} />
              {!done && <span className="rv-num">{cfg.day}</span>}
              {RETURN_DAYS.has(cfg.day) && !done && (
                <span className="rv-shell" aria-hidden>
                  <EchoNote />
                </span>
              )}
            </button>
          );
        })}

        {/* 수달 — 오늘 돌 옆에서 기다리거나, 마지막으로 건넌 돌에서 존다 */}
        {progress && (
          <div
            className="rv-otter"
            style={{ left: `${((otterAt.x + 44) / VB_W) * 100}%`, top: `${((otterAt.y - 46) / VB_H) * 100}%` }}
            aria-hidden
          >
            <OtterFace expression={otterMood} size={58} />
            {otterHasShell && (
              <span style={{ position: "absolute", left: -6, bottom: -4 }}>
                <Conch size={24} />
              </span>
            )}
          </div>
        )}

        {/* 방금 태어난 물고기 — 강을 타고 바다로 */}
        {fishDrop && (
          <div
            key={fishDrop.key}
            className="rv-drop"
            style={{ left: `${(stonePos(fishDrop.day - 1).x / VB_W) * 100}%`, top: `${(stonePos(fishDrop.day - 1).y / VB_H) * 100}%` }}
            onAnimationEnd={() => setFishDrop(null)}
            aria-hidden
          >
            <Fish size={22} />
          </div>
        )}

        {/* 물안개 너머 */}
        <div style={{ position: "absolute", left: 0, right: 0, top: `${((FOG_Y + 70) / VB_H) * 100}%`, textAlign: "center" }}>
          {progress?.finished ? (
            fogAsked ? (
              <div style={{ fontSize: 17 }}>알림 신청 완료</div>
            ) : (
              <>
                <div style={{ fontSize: 18, marginBottom: 10 }}>다음 시즌 준비 중</div>
                <button className="wn-sticker" style={pillBtn} onClick={askMore}>
                  오픈 알림 받기
                </button>
              </>
            )
          ) : (
            <div style={{ fontSize: 15, opacity: 0.55 }}>DAY 8~ · 준비 중</div>
          )}
        </div>
      </div>

      {/* 질문 */}
      {flow.kind === "ask" && (
        <Sheet onClose={() => setFlow({ kind: "idle" })}>
          <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 6 }}>
            DAY {flow.day}{flow.part === 2 ? " · 추가 질문" : ""}
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
            <OtterFace expression={flow.part === 2 ? "sly" : "tilt"} size={60} />
            <div style={{ fontSize: 21, lineHeight: 1.35 }}>{flow.question}</div>
          </div>
          <button
            className="wn-sticker"
            style={{ ...pillBtn, width: "100%" }}
            onClick={() => {
              playFx("micStart");
              setFlow({ kind: "record", day: flow.day, part: flow.part, question: flow.question });
            }}
          >
            말로 답하기
          </button>
        </Sheet>
      )}

      {flow.kind === "sending" && (
        <Sheet>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="rv-wiggle">
              <Fish size={34} />
            </span>
            <div style={{ fontSize: 19 }}>물고기 변환 중…</div>
          </div>
        </Sheet>
      )}

      {flow.kind === "confirm" && (
        <Sheet>
          <div style={{ fontSize: 17, marginBottom: 8 }}>이렇게 들림. 맞아?</div>
          <div style={{ ...quoteBox, marginBottom: 14 }}>{flow.transcript || "(잘 안 들렸어)"}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="wn-sticker" style={{ ...pillBtn, flex: 1 }} onClick={() => send(flow.day, flow.part, flow.question, flow.blob, true)}>
              맞음
            </button>
            <button
              className="wn-sticker"
              style={{ ...pillBtn, flex: 1, background: "#FFFFFF" }}
              onClick={() => setFlow({ kind: "record", day: flow.day, part: flow.part, question: flow.question })}
            >
              다시 녹음
            </button>
          </div>
        </Sheet>
      )}

      {flow.kind === "retry" && (
        <Sheet onClose={() => setFlow({ kind: "idle" })}>
          <div style={{ fontSize: 18, marginBottom: 14, whiteSpace: "pre-line" }}>{flow.text}</div>
          <button
            className="wn-sticker"
            style={{ ...pillBtn, width: "100%" }}
            onClick={() => setFlow({ kind: "record", day: flow.day, part: flow.part, question: flow.question })}
          >
            다시 녹음
          </button>
        </Sheet>
      )}

      {flow.kind === "crossed" && (
        <Sheet onClose={() => setFlow({ kind: "idle" })}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <OtterFace expression="laugh" size={60} />
            <div style={{ fontSize: 19, lineHeight: 1.35 }}>
              DAY {flow.day} 완료
              <div style={{ fontSize: 15, opacity: 0.6, marginTop: 4 }}>니 말 → 물고기 → 바다
                <br />
                다음 소라는 내일</div>
            </div>
          </div>
        </Sheet>
      )}

      {flow.kind === "note" && (
        <Sheet onClose={() => setFlow({ kind: "idle" })}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <OtterFace expression="sleep" size={56} />
            <div style={{ fontSize: 18, lineHeight: 1.35, whiteSpace: "pre-line" }}>{flow.text}</div>
          </div>
        </Sheet>
      )}

      {flow.kind === "look" && (
        <Sheet onClose={() => setFlow({ kind: "idle" })}>
          <LookBack done={flow.done} tone={t} onReplay={(segments) => setFlow({ kind: "return", day: flow.done.day, segments })} />
        </Sheet>
      )}

      {flow.kind === "return" && (
        <Sheet onClose={() => setFlow({ kind: "idle" })}>
                  <ShellReturn key={`${flow.day}-${flow.segments.length}`} segments={flow.segments} tone={t} />
        </Sheet>
      )}

      <BottomNav active="river" onNavigate={onNavigate} unreadLetterCount={unreadLetterCount} />
    </div>
  );
}

// ── 지난 돌 다시 보기 ──────────────────────────────────────────
function LookBack({ done, tone, onReplay }: { done: DayDone; tone: StageTone; onReplay: (s: ReturnSegment[]) => void }) {
  const cfg = stageDay(done.day);
  const player = useVoicePlayer();
  const questions = [cfg?.question[tone], cfg?.followUp?.[tone]];
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>DAY {done.day}</div>
      {done.answers.map((a, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 15, opacity: 0.7, marginBottom: 4 }}>{questions[i]}</div>
          <div style={quoteBox}>{a || "(말 없음)"}</div>
          <button
            className="wn-sticker"
            style={{ ...smallBtn, marginTop: 8 }}
            disabled={player.state === "loading"}
            onClick={() => player.play(`day=${done.day}&part=${i + 1}`)}
          >
            {player.state === "playing" && player.current === `day=${done.day}&part=${i + 1}` ? "듣는 중…" : "원본 듣기"}
          </button>
        </div>
      ))}
      {player.error && <div style={{ fontSize: 13, color: "#C0392B" }}>{player.error}</div>}
      {done.returnSegments && (
        <button className="wn-sticker" style={{ ...pillBtn, width: "100%", marginTop: 4 }} onClick={() => onReplay(done.returnSegments!)}>
          그날 소라 다시 듣기
        </button>
      )}
    </div>
  );
}

// ── 소라에 귀 대기: 수달 말풍선 → 수달이 니 말 따라하기 → (원하면) 진짜 니 목소리 3초 → … ──────
// 2026-10-17 "수달어": 사람 TTS 대신 동물의숲처럼 글자마다 뽁뽁 소리 + 말풍선 타이핑.
// 목소리 조각은 바로 틀지 않는다 — 수달이 먼저 놀리듯 따라하고, "진짜 니 목소리 들어볼래?"에서 누를 때만 원본.
// 원본은 통째로가 아니라 그 말이 나오는 근처 3초 정도만(전체는 "전체" 버튼).
type VoicePhase = "loading" | "mimic" | "ask" | "playing" | "done";

function ShellReturn({ segments, tone }: { segments: ReturnSegment[]; tone: StageTone }) {
  const [step, setStep] = useState(-1); // -1 = 아직 안 엶
  const [phase, setPhase] = useState<VoicePhase>("done");
  const [mimics, setMimics] = useState<Record<number, { text: string; quote: string }>>({});
  const player = useVoicePlayer();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // 목소리 조각에 들어가면: 녹음 불러오기 → 따라할 말 정하기 → 따라하기 시작
  useEffect(() => {
    if (step < 0 || step >= segments.length) return;
    const seg = segments[step];
    if (seg.kind !== "voice") return;
    let alive = true;
    setPhase("loading");
    player.load(voiceQuery(seg)).then((meta) => {
      if (!alive) return;
      const quote = seg.quote?.trim() || pickQuote(meta?.transcript ?? "");
      if (!meta) {
        setPhase("done");
        later(() => setStep((s) => s + 1), 900);
        return;
      }
      setMimics((m) => ({ ...m, [step]: { text: quote ? mimicLine(quote, tone) : "", quote } }));
      setPhase(quote ? "mimic" : "ask");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const next = (ms = 700) => later(() => setStep((s) => s + 1), ms);

  const listen = async (i: number) => {
    const seg = segments[i];
    if (seg.kind !== "voice") return;
    playFx("buttonPress");
    setPhase("playing");
    await player.playClip(voiceQuery(seg), mimics[i]?.quote ?? "");
    setPhase("done");
    next(500);
  };

  const shown = step < 0 ? [] : segments.slice(0, step + 1);
  const finished = step >= segments.length;
  const sayMode: BabbleMode = tone === "spicy" ? "spicy" : "mild";

  return (
    <div>
      {step < 0 ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 6, marginBottom: 10 }}>
            <OtterFace expression="sly" size={70} />
            <span className="rv-wiggle">
              <Conch size={44} />
            </span>
          </div>
          <div style={{ fontSize: 19, marginBottom: 14 }}>소라에서 뭐 들림ㅋ</div>
          <button
            className="wn-sticker"
            style={{ ...pillBtn, width: "100%" }}
            onClick={() => {
              playFx("buttonPress");
              player.unlock();
              setStep(0);
            }}
          >
            귀 대보기
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shown.map((seg, i) => {
            const live = i === step;
            if (seg.kind === "say") {
              return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }} className="rv-pop">
                  <OtterFace expression={i === segments.length - 1 ? "stare" : "remember"} size={40} />
                  <TypedBubble
                    text={seg.text}
                    mode={sayMode}
                    ctx={player.ctx}
                    animate={live}
                    onDone={() => next(Math.min(1400, 500 + seg.text.length * 12))}
                  />
                </div>
              );
            }
            const mim = mimics[i];
            const label = seg.label ?? `${seg.day}일차 니 목소리`;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }} className="rv-pop">
                {live && phase === "loading" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <OtterFace expression="remember" size={40} />
                    <div style={{ ...bubble, opacity: 0.6 }}>음… 니가 뭐랬더라…</div>
                  </div>
                )}
                {mim?.text && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <OtterFace expression="sly" size={40} />
                    <TypedBubble
                      text={mim.text}
                      mode="mimic"
                      ctx={player.ctx}
                      animate={live && phase === "mimic"}
                      onDone={() => later(() => setPhase("ask"), 450)}
                      style={mimicBubble}
                    />
                  </div>
                )}
                {live && phase === "ask" && (
                  <div className="rv-pop" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 15, textAlign: "center" }}>
                      {tone === "spicy" ? "못 믿겠지? 진짜 니 목소리 있음ㅋ" : "원본 목소리 들어볼래?"}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="wn-sticker" style={{ ...pillBtn, flex: 1, padding: "10px 14px", fontSize: 16 }} onClick={() => listen(i)}>
                        듣기
                      </button>
                      <button
                        className="wn-sticker"
                        style={{ ...smallBtn, flex: "0 0 auto", padding: "10px 16px", fontSize: 16 }}
                        onClick={() => {
                          playFx("buttonPress");
                          setPhase("done");
                          next(200);
                        }}
                      >
                        패스
                      </button>
                    </div>
                  </div>
                )}
                {(!live || phase === "playing" || phase === "done") && (
                  <div style={voicePill}>
                    <span className={player.state === "playing" && player.current === voiceQuery(seg) ? "rv-wave rv-wave-on" : "rv-wave"} aria-hidden>
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>{label}</span>
                    {(!live || phase === "done") && (
                      <span style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                        <button className="wn-sticker" style={smallBtn} onClick={() => player.playClip(voiceQuery(seg), mim?.quote ?? "")}>
                          {mim?.quote ? "그 말만" : "듣기"}
                        </button>
                        <button className="wn-sticker" style={smallBtn} onClick={() => player.play(voiceQuery(seg))}>
                          전체
                        </button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {player.error && <div style={{ fontSize: 13, color: "#C0392B" }}>{player.error}</div>}
          {finished && <div style={{ fontSize: 13, opacity: 0.55, textAlign: "center", marginTop: 4 }}>대답은 홈 마이크로</div>}
        </div>
      )}
    </div>
  );
}

// 수달이 니 말을 따라하는 한 줄 — 순한맛은 장난, 매운맛은 놀림
function mimicLine(quote: string, tone: StageTone): string {
  const q = quote.replace(/[.。!?…~\s]+$/, "");
  return tone === "spicy" ? `“${q}”~ 이랬던 사람 누구게ㅋㅋ` : `니가 그때 그랬잖아~ “${q}”~`;
}

// 받아쓰기에서 따라할 짧은 말 하나 고르기 — 첫 문장(또는 앞부분)을 28자 안으로
function pickQuote(transcript: string): string {
  const t = transcript.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const sentences = t.replace(/([.!?。…])\s+/g, "$1\n").split(/\n|\s*\/\s*/).map((s) => s.trim()).filter((s) => s.length >= 4);
  const first = sentences[0] ?? t;
  if (first.length <= 28) return first;
  const cut = first.slice(0, 28);
  const sp = cut.lastIndexOf(" ");
  return (sp > 12 ? cut.slice(0, sp) : cut) + "…";
}

// 말풍선 타이핑 + 수달어. animate=false면 처음부터 다 보이고 소리도 없다(지나간 말풍선).
function TypedBubble({
  text,
  mode,
  ctx,
  animate,
  onDone,
  style,
}: {
  text: string;
  mode: BabbleMode;
  ctx: () => AudioContext | null;
  animate: boolean;
  onDone?: () => void;
  style?: React.CSSProperties;
}) {
  const chars = Array.from(text);
  const [n, setN] = useState(animate ? 0 : chars.length);
  const doneRef = useRef(!animate);

  useEffect(() => {
    if (!animate) {
      setN(chars.length);
      return;
    }
    let i = 0;
    let voiced = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = BABBLE_STEP_MS[mode];
    const tick = () => {
      i += 1;
      setN(i);
      const ch = chars[i - 1];
      if (ch && isVoiced(ch)) {
        const rise = chars[i] === "~" || (chars[i] === "”" && chars[i + 1] === "~");
        babble(ctx(), ch, mode, voiced++, rise);
      }
      if (i >= chars.length) {
        if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
        return;
      }
      // 띄어쓰기·쉼표에서는 살짝 쉰다
      const pause = ch === " " ? step * 0.6 : /[,.!?…]/.test(ch ?? "") ? step * 3 : 0;
      timer = setTimeout(tick, step + pause);
    };
    timer = setTimeout(tick, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, text]);

  return (
    <div
      style={{ ...bubble, ...style }}
      onClick={() => {
        // 기다리기 싫으면 톡 — 바로 다 보여준다
        if (n < chars.length) {
          setN(chars.length);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone?.();
          }
        }
      }}
    >
      {chars.slice(0, n).join("")}
      <span style={{ visibility: "hidden" }}>{chars.slice(n).join("")}</span>
    </div>
  );
}

// 소라 속 목소리 → 재생 요청 주소(강 N일차 대답 또는 바다 자유 녹음)
function voiceQuery(seg: Extract<ReturnSegment, { kind: "voice" }>): string {
  return seg.entryId ? `entry=${encodeURIComponent(seg.entryId)}` : `day=${seg.day ?? 1}&part=1`;
}

// 받아쓰기 안에서 따라한 말이 나오는 근처만 — 글자 위치 비율로 시간 추정(정확한 단어 시각은 저장 안 돼 있음)
function clipWindow(transcript: string, quote: string, duration: number): { start: number; length: number } {
  if (duration <= 6) return { start: 0, length: duration };
  const t = transcript.replace(/\s+/g, " ").trim();
  const q = quote.replace(/[…“”~]/g, "").replace(/\s+/g, " ").trim();
  let idx = q ? t.indexOf(q) : -1;
  if (idx < 0 && q.length > 6) idx = t.indexOf(q.slice(0, 6));
  if (!t || idx < 0) return { start: 0, length: Math.min(duration, 4) };
  const start = Math.max(0, (idx / t.length) * duration - 0.4);
  const length = Math.min(4.5, Math.max(2.5, (Math.max(q.length, 8) / t.length) * duration + 0.9));
  return { start: Math.min(start, Math.max(0, duration - length)), length };
}

// ── 지난 목소리 재생 — Web Audio로 디코딩(아이폰 녹음이 webm 이름표를 달고 있어도 재생되게) ──────
function useVoicePlayer() {
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const cache = useRef<Map<string, { buffer: AudioBuffer; transcript: string }>>(new Map());
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ctx = useCallback((): AudioContext | null => {
    if (!ctxRef.current) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    return ctxRef.current;
  }, []);

  useEffect(
    () => () => {
      try {
        srcRef.current?.stop();
      } catch {
        /* 이미 멈춤 */
      }
      ctxRef.current?.close().catch(() => {});
    },
    []
  );

  // 사용자 터치 안에서 한 번 깨워 둔다(아이폰은 터치 없이 소리를 못 낸다)
  const unlock = () => {
    try {
      ctx()?.resume();
    } catch {
      /* 무시 */
    }
  };

  // 녹음 + 받아쓰기 불러오기(한 번 불러온 건 다시 안 받는다). 실패하면 null.
  const load = async (query: string): Promise<{ buffer: AudioBuffer; transcript: string } | null> => {
    const hit = cache.current.get(query);
    if (hit) return hit;
    try {
      const c = ctx();
      if (!c) throw new Error("이 기기는 재생 불가");
      const res = await authed(`/api/stage/voice?${query}`);
      const body = await res.json();
      if (!body?.success) throw new Error(body?.error || "녹음 없음");
      const audio = await fetch(body.data.url);
      if (!audio.ok) throw new Error("불러오기 실패");
      const buffer = await c.decodeAudioData(await audio.arrayBuffer());
      const item = { buffer, transcript: String(body.data.transcript ?? "") };
      cache.current.set(query, item);
      return item;
    } catch (e: any) {
      setError(e?.message || "불러오기 실패");
      return null;
    }
  };

  // start/length(초)를 주면 그 부분만. 안 주면 처음부터 끝까지.
  const playRange = async (query: string, pick?: (item: { buffer: AudioBuffer; transcript: string }) => { start: number; length: number }) => {
    setError(null);
    setCurrent(query);
    try {
      srcRef.current?.stop();
    } catch {
      /* 무시 */
    }
    try {
      setState("loading");
      const c = ctx();
      if (!c) throw new Error("이 기기는 재생 불가");
      await c.resume();
      const item = await load(query);
      if (!item) return;
      const src = c.createBufferSource();
      src.buffer = item.buffer;
      // 앞뒤 끊김이 툭 튀지 않게 아주 짧게 페이드
      const gain = c.createGain();
      src.connect(gain).connect(c.destination);
      srcRef.current = src;
      setState("playing");
      const range = pick ? pick(item) : { start: 0, length: item.buffer.duration };
      const t0 = c.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(1, t0 + 0.06);
      gain.gain.setValueAtTime(1, t0 + Math.max(0.07, range.length - 0.15));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + range.length);
      await new Promise<void>((resolve) => {
        src.onended = () => resolve();
        src.start(t0, range.start, range.length);
      });
    } catch (e: any) {
      setError(e?.message || "재생 실패");
    } finally {
      setState("idle");
    }
  };

  // query: "day=3&part=1" 또는 "entry=<id>" (/api/stage/voice)
  const play = (query: string) => playRange(query);
  const playClip = (query: string, quote: string) => playRange(query, (item) => clipWindow(item.transcript, quote, item.buffer.duration));

  return { play, playClip, load, unlock, ctx, state, current, error };
}

// ── 작은 그림들 ────────────────────────────────────────────────
function Sheet({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <>
      <div className="rv-backdrop" onClick={onClose} />
      <div className="rv-sheet" role="dialog" style={{ ...stickerCard, padding: 18 }}>
        {onClose && (
          <button className="rv-x" onClick={onClose} aria-label="닫기">
            ×
          </button>
        )}
        {children}
      </div>
    </>
  );
}

function Fish({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 28" width={size} height={(size * 28) / 40} aria-hidden>
      <path d="M8 14 Q16 2 28 6 Q36 9 36 14 Q36 19 28 22 Q16 26 8 14 Z" fill="#FF8A3D" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <path d="M9 14 L2 7 L3 21 Z" fill="#FF8A3D" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <circle cx={29} cy={12} r={2} fill={INK} />
    </svg>
  );
}

// 소라(작은 것) — 수달이 들고 있거나 귀 대보기 화면에서 흔들리는 것
function Conch({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 80 72" width={size} height={(size * 72) / 80} aria-hidden>
      <ConchBody fill="#FFC9D9" pearl={false} />
    </svg>
  );
}

// 징검다리 소라 — 소라를 밟고 건너고, 대답하면 입구에 진주가 생긴다
function ConchStone({ fill, pearl }: { fill: string; pearl: boolean }) {
  return (
    <svg viewBox="0 0 80 72" className="rv-shellstone" aria-hidden>
      <ellipse cx={40} cy={67} rx={28} ry={4.5} fill={INK} opacity={0.18} />
      <ConchBody fill={fill} pearl={pearl} />
    </svg>
  );
}

// 소라 몸통 — 아래 큰 몸 + 위로 작아지는 두 단 + 오른쪽 아래 입구(살짝 기울임)
function ConchBody({ fill, pearl }: { fill: string; pearl: boolean }) {
  const line = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const };
  return (
    <g transform="rotate(28 40 40)">
      <path d="M16 42 Q20 24 40 22 Q60 24 64 42 Q64 64 40 68 Q16 64 16 42 Z" fill={fill} {...line} />
      <path d="M24 26 Q30 12 40 11 Q50 12 56 26 Q40 32 24 26 Z" fill={fill} {...line} />
      <path d="M31 13 Q35 3 40 1 Q45 3 49 13 Q40 17 31 13 Z" fill={fill} {...line} />
      <path d="M22 36 L58 36 M24 50 L56 50" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeDasharray="1 7" opacity={0.6} />
      <path d="M40 40 Q58 36 62 52 Q60 66 44 66 Q36 56 40 40 Z" fill="#FFF0F4" {...line} />
      {pearl && (
        <>
          <circle cx={49} cy={54} r={6} fill="#FFFFFF" stroke={INK} strokeWidth={2.3} />
          <circle cx={47} cy={52} r={1.8} fill="#DDEFFF" />
        </>
      )}
    </g>
  );
}

// 돌아오는 날 표시 — 그 소라에선 "그때 니 목소리"가 들린다
function EchoNote() {
  return (
    <svg viewBox="0 0 24 22" width={22} height={20} aria-hidden>
      <path d="M8 17 V5 L19 3 V15" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx={6} cy={17} rx={3.8} ry={3.1} fill="#FFFFFF" stroke={INK} strokeWidth={2.2} />
      <ellipse cx={17} cy={15} rx={3.8} ry={3.1} fill="#FFFFFF" stroke={INK} strokeWidth={2.2} />
    </svg>
  );
}

// ── 스타일 ────────────────────────────────────────────────────
const RIVER_CSS = `
.rv-stone { position: absolute; width: 76px; height: 68px; margin: -34px 0 0 -38px; padding: 0; border: 0; background: transparent; font-family: 'Jua', sans-serif; font-size: 22px; color: ${INK}; display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: visible; -webkit-tap-highlight-color: transparent; z-index: 2; }
.rv-stone:active { transform: translate(2px,2px); }
.rv-shellstone { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.rv-num { position: relative; z-index: 2; margin: 12px 24px 0 0; }
.rv-today { animation: rvBob 2.4s ease-in-out infinite; }
.rv-sunk { opacity: .9; }
.rv-sunk::after { content: ''; position: absolute; left: -4px; right: -4px; bottom: -4px; height: 52%; background: #5CCBF2; border-top: 3px solid #9BE3FA; border-radius: 0 0 40px 40px; z-index: 1; }
.rv-shell { position: absolute; right: -10px; top: -12px; z-index: 3; }
.rv-otter { position: absolute; margin: -29px 0 0 -29px; z-index: 3; transition: left .8s ease, top .8s ease; pointer-events: none; animation: rvBob 3.2s ease-in-out infinite; }
.rv-flow { animation: rvFlow 3s linear infinite; }
.rv-fog { animation: rvFog 9s ease-in-out infinite alternate; }
.rv-drop { position: absolute; margin: -10px 0 0 -11px; z-index: 4; animation: rvDrop 2.6s ease-in forwards; pointer-events: none; }
.rv-backdrop { position: fixed; inset: 0; background: rgba(27,22,48,.28); z-index: 110; }
.rv-sheet { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(92px + env(safe-area-inset-bottom, 0px)); width: calc(100% - 32px); max-width: 448px; box-sizing: border-box; z-index: 120; animation: rvUp .28s ease-out; max-height: 70dvh; overflow-y: auto; }
.rv-x { position: absolute; right: 10px; top: 6px; border: 0; background: transparent; font-size: 26px; color: ${INK}; cursor: pointer; }
.rv-wiggle { display: inline-block; animation: rvWiggle .9s ease-in-out infinite; }
.rv-pop { animation: rvPop .3s ease-out; }
.rv-wave { display: inline-flex; gap: 3px; align-items: center; height: 18px; }
.rv-wave i { display: block; width: 4px; height: 6px; border-radius: 2px; background: ${INK}; }
.rv-wave-on i { animation: rvWave .8s ease-in-out infinite; }
.rv-wave-on i:nth-child(2) { animation-delay: .1s } .rv-wave-on i:nth-child(3) { animation-delay: .2s } .rv-wave-on i:nth-child(4) { animation-delay: .3s } .rv-wave-on i:nth-child(5) { animation-delay: .4s }
@keyframes rvBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
@keyframes rvFlow { to { stroke-dashoffset: -72 } }
@keyframes rvFog { from { transform: translateX(-8px) } to { transform: translateX(8px) } }
@keyframes rvDrop { 0% { transform: translate(0,0) rotate(90deg); opacity: 1 } 100% { transform: translate(0, 420px) rotate(90deg); opacity: 0 } }
@keyframes rvUp { from { transform: translate(-50%, 20px); opacity: 0 } to { transform: translate(-50%, 0); opacity: 1 } }
@keyframes rvWiggle { 0%,100% { transform: rotate(-6deg) } 50% { transform: rotate(6deg) } }
@keyframes rvPop { from { transform: scale(.9); opacity: 0 } to { transform: scale(1); opacity: 1 } }
@keyframes rvWave { 0%,100% { height: 6px } 50% { height: 18px } }
@media (prefers-reduced-motion: reduce) { .rv-today, .rv-otter, .rv-flow, .rv-fog, .rv-wiggle, .rv-wave-on i { animation: none } }
`;

const pillBtn: React.CSSProperties = {
  border: `3px solid ${INK}`,
  borderRadius: 999,
  background: YELLOW,
  boxShadow: `3px 3px 0 ${INK}`,
  padding: "12px 20px",
  fontSize: 18,
  color: INK,
  cursor: "pointer",
};
const smallBtn: React.CSSProperties = { ...pillBtn, padding: "6px 12px", fontSize: 14, background: "#FFFFFF", boxShadow: `2px 2px 0 ${INK}` };
const quoteBox: React.CSSProperties = {
  background: "#F4FBFF",
  border: `2px dashed ${INK}`,
  borderRadius: 14,
  padding: "10px 12px",
  fontSize: 15,
  lineHeight: 1.45,
  fontFamily: "system-ui, sans-serif",
};
const bubble: React.CSSProperties = {
  background: "#FFFFFF",
  border: `2.5px solid ${INK}`,
  borderRadius: "16px 16px 16px 4px",
  padding: "8px 12px",
  fontSize: 17,
  lineHeight: 1.4,
};
// 수달이 니 말 따라할 때 — 놀리는 말풍선(살짝 기울고 노란색)
const mimicBubble: React.CSSProperties = {
  background: "#FFF3B0",
  transform: "rotate(-1.5deg)",
};
const voicePill: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "#FFE1EA",
  border: `2.5px solid ${INK}`,
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 16,
  alignSelf: "flex-end",
  minWidth: "70%",
  boxSizing: "border-box",
};
