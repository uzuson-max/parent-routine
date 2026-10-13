// app/screens/WorriesScreen.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { BottomNav, INK, WORLD_CSS, WorldTitle, stickerCard, worldPage, type WorldTab } from "@/components/WorldNav";
import { WorryCloseUp } from "@/components/OtterCloseUp";
import { OtterFace } from "@/components/Otter";
import { loadFresh, peekMemory, peekStored } from "@/lib/worldCache";
import { supabaseClient } from "@/lib/supabaseClient";
import { playFx } from "@/lib/fx";
import { MIN_FOR_RATE, WORRY_REACT, worryAsk, worryVerdict, worryWhen, type WorryAnswer } from "@/lib/worryCopy";

// ============================================================================
// 걱정 병 탭 — "니 걱정, 진짜 몇 %나 맞았어?"
// ----------------------------------------------------------------------------
// 하단 탭: 어항 / 걱정 병 / 편지. (예전 "지난 어항" 자리. 지난 어항 화면은 MY > 기록 보기에서 그대로 열린다.)
//   1) 적중률 카드 — 답한 병이 5개 모이기 전엔 "몇 개 더"만, 모이면 %와 한마디
//   2) 떠 있는 병 — 확인할 때가 된 병은 흔들리고, 누르면 홈과 똑같이 수달이 다가와 묻는다(WorryCloseUp)
//   3) 걱정 하나 던지기 — 녹음 말고 직접 적어서 던질 수도 있다(AI 호출 없음)
//   4) 해변 — 열어본 병들(맞음/반쯤/빗나감)
//   5) 친구한테 보낼 엽서 — 적중률 한 줄 복사(원문은 기본으로 안 보임)
// 데이터: /api/user/worries (lib/worryBottles.ts). 홈 바다와 같은 캐시("worries")를 쓴다.
// ============================================================================

interface Bottle {
  id: number;
  worry: string;
  createdAt: string;
  dueAt: string;
}
interface Opened {
  id: number;
  worry: string;
  result: WorryAnswer;
  createdAt: string;
  answeredAt: string | null;
}
interface Stats {
  done: number;
  hit: number;
  half: number;
  miss: number;
  rate: number | null;
}
interface WorryData {
  bottles: Bottle[];
  stats: Stats | null;
  opened?: Opened[];
  ready: boolean;
}

const RESULT_LABEL: Record<WorryAnswer, string> = { hit: "맞음", half: "반쯤", miss: "빗나감" };
const RESULT_COLOR: Record<WorryAnswer, string> = { hit: "#F9C7DC", half: "#FFD26F", miss: "#74D3B4" };
const DAY_CHOICES: { days: number; label: string }[] = [
  { days: 1, label: "내일" },
  { days: 5, label: "이번 주" },
  { days: 30, label: "한 달 뒤" },
];

async function authHeader(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } : null;
}

export default function WorriesScreen({
  onNavigate,
  unreadLetterCount = 0,
}: {
  onNavigate: (tab: WorldTab) => void;
  unreadLetterCount?: number;
}) {
  const [data, setData] = useState<WorryData | null>(() => peekMemory<WorryData>("worries"));
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const stored = peekStored<WorryData>("worries");
    if (stored) setData(stored);
    loadFresh<WorryData>("worries")
      .then((d) => {
        if (d && alive.current) setData(d);
      })
      .catch(() => alive.current && setFailed(true));
    return () => {
      alive.current = false;
    };
  }, []);

  // 서버가 바뀐 결과를 돌려주면 화면과 캐시(홈 바다도 같이 씀)를 함께 맞춘다
  const applyServer = (d: WorryData) => {
    setData(d);
    loadFresh<WorryData>("worries").catch(() => {});
  };

  // ---- 토스트 ----
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (t: string) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // ---- 병 열기(수달이 다가와 묻기) ----
  const [openId, setOpenId] = useState<number | null>(null);
  const [done, setDone] = useState<{ answer: WorryAnswer; line: string; stats: Stats | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pending = useRef<WorryData | null>(null);
  const openBottle = (data?.bottles ?? []).find((b) => b.id === openId) ?? null;
  const answer = async (a: WorryAnswer | "later") => {
    if (!openBottle || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const headers = await authHeader();
      if (!headers) throw new Error("세션 없음");
      const res = await fetch("/api/user/worries", { method: "POST", headers, body: JSON.stringify({ id: openBottle.id, answer: a }) });
      const body = await res.json().catch(() => ({}));
      if (!body.success) throw new Error(body.error || "저장 실패");
      if (a === "later") {
        applyServer(body.data);
        setOpenId(null);
        say("알았어. 며칠 뒤에 다시 물어볼게.");
        return;
      }
      const lines = WORRY_REACT[a];
      setDone({ answer: a, line: lines[Math.floor(Math.random() * lines.length)], stats: body.data?.stats ?? null });
      pending.current = body.data;
    } catch (e: any) {
      setErr(e?.message && !/세션|fetch/i.test(e.message) ? e.message : "지금은 저장이 안 됐어. 조금 있다 다시 해볼래?");
    } finally {
      setBusy(false);
    }
  };
  const leave = () => {
    if (pending.current) {
      applyServer(pending.current);
      pending.current = null;
    }
    setOpenId(null);
    setDone(null);
    setErr(null);
  };

  // ---- 직접 던지기 ----
  const [text, setText] = useState("");
  const [days, setDays] = useState(1);
  const [throwing, setThrowing] = useState(false);
  const [dropId, setDropId] = useState<number | null>(null);
  const throwBottle = async () => {
    const t = text.trim();
    if (t.length < 2) {
      say("걱정 한 줄만 적어줘.");
      return;
    }
    setThrowing(true);
    try {
      const headers = await authHeader();
      if (!headers) throw new Error("세션 없음");
      const before = new Set((data?.bottles ?? []).map((b) => b.id));
      const res = await fetch("/api/user/worries", { method: "POST", headers, body: JSON.stringify({ action: "create", worry: t, days }) });
      const body = await res.json().catch(() => ({}));
      if (!body.success) throw new Error(body.error || "못 던졌어");
      playFx("buttonPress");
      setText("");
      const fresh = (body.data?.bottles as Bottle[] | undefined)?.find((b) => !before.has(b.id));
      if (fresh) setDropId(fresh.id);
      applyServer(body.data);
      say(days === 1 ? "내일 물어볼게." : days === 5 ? "이번 주 안에 물어볼게." : "한 달 뒤에 물어볼게.");
    } catch (e: any) {
      say(e?.message && !/세션|fetch/i.test(e.message) ? e.message : "지금은 못 던졌어. 조금 있다 다시 해볼래?");
    } finally {
      setThrowing(false);
    }
  };

  // ---- 엽서 ----
  const [showMissed, setShowMissed] = useState(false);
  const stats = data?.stats ?? null;
  const rate = stats?.rate ?? null;
  const missed = (data?.opened ?? []).find((o) => o.result === "miss") ?? null;
  const copyCard = async () => {
    const line =
      rate !== null
        ? `내 걱정 적중률 ${rate}%. ${worryVerdict(rate)}${showMissed && missed ? ` (빗나간 걱정: "${missed.worry}")` : ""} — 참견이`
        : "참견이한테 내 걱정 적중률 재보는 중";
    try {
      await navigator.clipboard.writeText(line);
      say("복사했어.");
    } catch {
      say(line);
    }
  };

  const now = Date.now();
  const bottles = data?.bottles ?? [];
  const dueCount = bottles.filter((b) => new Date(b.dueAt).getTime() <= now).length;
  const opened = data?.opened ?? [];
  const notReady = data !== null && data.ready === false;

  return (
    <div style={worldPage}>
      <style dangerouslySetInnerHTML={{ __html: WORLD_CSS + CSS }} />
      <WorldTitle>걱정 병</WorldTitle>

      {notReady ? (
        <div style={{ ...stickerCard, padding: 20, textAlign: "center" }}>
          <OtterFace expression="tilt" size={72} />
          <p style={{ margin: "8px 0 0", fontSize: 17 }}>걱정 병이 아직 준비 중이야.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* 1) 적중률 */}
          <section style={{ ...stickerCard, background: "#FFD26F", padding: 18 }} aria-live="polite">
            {rate !== null && stats ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div className="wr-big">
                    {rate}
                    <small>%</small>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 18, lineHeight: 1.3 }}>{worryVerdict(rate)}</div>
                    <div className="wr-count">
                      열어본 걱정 {stats.done}개 · 떠 있는 걱정 {bottles.length}개
                    </div>
                  </div>
                </div>
                <div className="wr-bar" aria-hidden>
                  <span style={{ width: `${(stats.hit / stats.done) * 100}%`, background: RESULT_COLOR.hit }} />
                  <span style={{ width: `${(stats.half / stats.done) * 100}%`, background: RESULT_COLOR.half }} />
                  <span style={{ width: `${(stats.miss / stats.done) * 100}%`, background: RESULT_COLOR.miss }} />
                </div>
                <div className="wr-legend">
                  {(["hit", "half", "miss"] as WorryAnswer[]).map((r) => (
                    <span key={r}>
                      <i style={{ background: RESULT_COLOR[r] }} />
                      {RESULT_LABEL[r]} {stats[r]}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div className="wr-big">
                  {stats?.done ?? 0}
                  <small>개</small>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, lineHeight: 1.3 }}>
                    {Math.max(1, MIN_FOR_RATE - (stats?.done ?? 0))}개만 더 열어보면 니 걱정 적중률 나와.
                  </div>
                  <div className="wr-count">떠 있는 걱정 {bottles.length}개</div>
                </div>
              </div>
            )}
          </section>

          {/* 2) 떠 있는 병 */}
          <section className="wr-sea" aria-label="떠 있는 걱정 병">
            <div className="wr-sea-label">{dueCount ? `열어볼 때 된 병 ${dueCount}개` : `떠 있는 병 ${bottles.length}개`}</div>
            {bottles.length === 0 ? (
              <div className="wr-sea-empty">{data === null && !failed ? "병 건지는 중…" : "바다가 조용해. 걱정 하나 던져볼래?"}</div>
            ) : (
              <div className="wr-bottles">
                {bottles.map((b, i) => {
                  const due = new Date(b.dueAt).getTime() <= now;
                  const left = (new Date(b.dueAt).getTime() - now) / 86_400_000;
                  return (
                    <button
                      key={b.id}
                      className={`wr-bottle ${due ? "wr-due" : ""} ${dropId === b.id ? "wr-drop" : ""}`}
                      style={{ animationDelay: `${-i * 0.6}s` }}
                      aria-label={due ? `열어볼 때 된 걱정: ${b.worry}` : "아직 떠 있는 걱정 병"}
                      onClick={() => {
                        playFx("buttonPress");
                        if (due) {
                          setOpenId(b.id);
                          setDone(null);
                          setErr(null);
                        } else say(left <= 1.2 ? "아직 안 열려. 내일쯤 물어볼게." : "아직 안 열려. 며칠 뒤에 물어볼게.");
                      }}
                    >
                      {bottleSvg()}
                      <span className="wr-tag">{due ? "열어볼래?" : left <= 1.2 ? "내일" : left <= 7 ? "며칠 뒤" : "한참 뒤"}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="wr-sand" aria-hidden />
          </section>

          {/* 3) 직접 던지기 */}
          <form
            style={{ ...stickerCard, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              throwBottle();
            }}
          >
            <label htmlFor="wr-text" style={{ fontSize: 18 }}>
              요즘 무슨 걱정 해?
            </label>
            <textarea
              id="wr-text"
              className="wr-input"
              maxLength={60}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="예: 내일 발표 망할 듯"
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} role="group" aria-label="언제 물어볼까">
              <span style={{ fontSize: 14, opacity: 0.6, marginRight: 2 }}>언제 물어볼까?</span>
              {DAY_CHOICES.map((c) => (
                <button key={c.days} type="button" className="wr-chip" aria-pressed={days === c.days} onClick={() => setDays(c.days)}>
                  {c.label}
                </button>
              ))}
            </div>
            <button type="submit" className="wr-throw wn-sticker" disabled={throwing}>
              {throwing ? "던지는 중…" : "바다에 던지기"}
            </button>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.55, lineHeight: 1.45 }}>평소처럼 말해도 참견이가 걱정을 골라서 병에 담아.</p>
          </form>

          {/* 4) 해변 — 열어본 병 */}
          {opened.length > 0 && (
            <section>
              <h2 className="wr-h2">해변에 올라온 병</h2>
              <ul className="wr-beach">
                {opened.slice(0, 12).map((o) => (
                  <li key={o.id} style={{ ...stickerCard, boxShadow: `3px 3px 0 ${INK}` }}>
                    <span className="wr-result" style={{ background: RESULT_COLOR[o.result] }}>
                      {RESULT_LABEL[o.result]}
                    </span>
                    <span className="wr-beach-text">“{o.worry}”</span>
                    <span className="wr-beach-when">{worryWhen(o.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 5) 엽서 */}
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className="wr-h2">친구한테 보낼 엽서</h2>
            <div className="wr-card" style={{ ...stickerCard, background: "#8977B8" }}>
              <div className="wr-card-k">내 걱정 적중률</div>
              <div className="wr-card-n">{rate !== null ? `${rate}%` : "측정 중"}</div>
              <div style={{ fontSize: 18 }}>{rate !== null ? worryVerdict(rate) : "아직 걱정 모으는 중이래."}</div>
              {showMissed && missed && <div className="wr-card-q">빗나간 걱정: “{missed.worry}”</div>}
              <div className="wr-card-foot">참견이가 세어봄</div>
              <span className="wr-card-otter" aria-hidden>
                <OtterFace expression={rate !== null && rate < 45 ? "laugh" : "sly"} size={74} />
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, cursor: "pointer" }}>
                <input type="checkbox" checked={showMissed} onChange={(e) => setShowMissed(e.target.checked)} style={{ width: 18, height: 18, accentColor: INK }} />
                빗나간 걱정 하나 보여주기
              </label>
              <button type="button" className="wr-chip" onClick={copyCard}>
                문구 복사
              </button>
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div className="wr-toast" role="status">
          {toast}
        </div>
      )}

      {openBottle && (
        <WorryCloseUp
          key={openBottle.id}
          when={worryWhen(openBottle.createdAt)}
          worry={openBottle.worry}
          ask={worryAsk(openBottle.worry)}
          done={done}
          busy={busy}
          error={err}
          minForRate={MIN_FOR_RATE}
          verdict={worryVerdict}
          onAnswer={answer}
          onLeave={leave}
        />
      )}

      <BottomNav active="worries" onNavigate={onNavigate} unreadLetterCount={unreadLetterCount} />
    </div>
  );
}

function bottleSvg() {
  return (
    <svg viewBox="0 0 40 56" aria-hidden>
      <rect x="14" y="2" width="12" height="8" rx="2" fill="#C89B6D" stroke={INK} strokeWidth={2.4} />
      <path d="M15 10 h10 v6 q9 4 9 14 v18 q0 6 -6 6 h-16 q-6 0 -6 -6 v-18 q0 -10 9 -14 z" fill="#E4FBF2" fillOpacity={0.92} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      <g transform="rotate(-8 20 35)">
        <rect x="12" y="26" width="16" height="18" rx="2" fill="#FFF6E5" stroke={INK} strokeWidth={1.8} />
        <path d="M15 32 h9 M15 36 h7 M15 40 h8" stroke="#8977B8" strokeWidth={1.6} strokeLinecap="round" />
      </g>
      <path d="M11 22 q-2 6 -1 12" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />
    </svg>
  );
}

const CSS = `
.wr-big{font-size:58px;line-height:1;font-variant-numeric:tabular-nums;flex:none}
.wr-big small{font-size:26px}
.wr-count{font-size:13px;opacity:.7;margin-top:3px;font-variant-numeric:tabular-nums}
.wr-bar{display:flex;height:12px;margin-top:14px;border:2.5px solid ${INK};border-radius:999px;overflow:hidden;background:#FFFDF8}
.wr-bar span{display:block;height:100%}
.wr-legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:13px}
.wr-legend i{display:inline-block;width:11px;height:11px;border:2px solid ${INK};border-radius:4px;margin-right:5px;vertical-align:-1px}
.wr-sea{position:relative;min-height:190px;border:3px solid ${INK};border-radius:22px;box-shadow:4px 4px 0 ${INK};overflow:hidden;background:linear-gradient(#8BE0FA,#45BFEC)}
.wr-sea-label{position:absolute;left:14px;top:10px;color:#fff;font-size:15px;text-shadow:0 1px 0 rgba(27,22,48,.35);z-index:2}
.wr-sea-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:17px;padding:20px;text-align:center;text-shadow:0 1px 0 rgba(27,22,48,.3)}
.wr-bottles{display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:center;padding:42px 12px 44px}
.wr-bottle{display:flex;flex-direction:column;align-items:center;gap:3px;width:64px;padding:0;border:0;background:none;cursor:pointer;color:${INK};font-family:'Jua',sans-serif;animation:wr-bob 3.4s ease-in-out infinite;-webkit-tap-highlight-color:transparent}
.wr-bottle svg{width:38px;height:auto;display:block;overflow:visible;filter:drop-shadow(2px 2px 0 rgba(27,22,48,.25))}
.wr-bottle:focus-visible{outline:3px dashed ${INK};outline-offset:3px;border-radius:12px}
.wr-tag{font-size:12px;background:#FFFDF8;border:2px solid ${INK};border-radius:999px;padding:1px 8px;white-space:nowrap}
.wr-due{animation:wr-due 1.3s ease-in-out infinite}
.wr-due .wr-tag{background:#F9C7DC}
.wr-drop{animation:wr-drop .9s cubic-bezier(.3,1.4,.5,1) both}
.wr-sand{position:absolute;left:0;right:0;bottom:0;height:24px;background:#F6D589;border-top:3px solid ${INK}}
@keyframes wr-bob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-6px) rotate(4deg)}}
@keyframes wr-due{0%,100%{transform:rotate(-10deg)}25%{transform:translateY(-5px) rotate(8deg)}50%{transform:rotate(-5deg)}75%{transform:translateY(-3px) rotate(10deg)}}
@keyframes wr-drop{from{transform:translateY(-140px) rotate(-30deg);opacity:0}to{transform:none;opacity:1}}
.wr-input{width:100%;box-sizing:border-box;min-height:70px;resize:vertical;border:2.5px solid ${INK};border-radius:14px;padding:10px 12px;font:inherit;font-size:16px;background:#FFF6E5;color:${INK}}
.wr-input:focus-visible{outline:3px dashed #8977B8;outline-offset:2px}
.wr-chip{border:2.5px solid ${INK};background:#FFFDF8;border-radius:999px;padding:5px 13px;font-size:14px;cursor:pointer;color:${INK}}
.wr-chip[aria-pressed="true"]{background:#74D3B4}
.wr-chip:focus-visible,.wr-throw:focus-visible{outline:3px dashed ${INK};outline-offset:3px}
.wr-throw{border:3px solid ${INK};border-radius:16px;padding:12px 16px;font-size:18px;cursor:pointer;background:${INK};color:#FFD23F;box-shadow:3px 3px 0 ${INK}}
.wr-throw:disabled{opacity:.55;cursor:default}
.wr-h2{margin:0 0 10px;font-size:20px;font-weight:400}
.wr-beach{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.wr-beach li{display:flex;align-items:center;gap:10px;padding:10px 12px;border-width:2.5px!important;border-radius:16px!important}
.wr-result{flex:none;font-size:13px;border:2px solid ${INK};border-radius:999px;padding:2px 9px}
.wr-beach-text{flex:1;min-width:0;font-size:16px;line-height:1.35;word-break:keep-all}
.wr-beach-when{flex:none;font-size:12px;opacity:.5}
.wr-card{position:relative;padding:20px 18px 18px;color:#fff;overflow:hidden}
.wr-card-k{font-size:13px;letter-spacing:.06em;opacity:.85}
.wr-card-n{font-size:46px;line-height:1.05;margin:6px 0;font-variant-numeric:tabular-nums}
.wr-card-q{margin-top:10px;margin-right:70px;font-size:14px;background:rgba(255,255,255,.18);border-radius:10px;padding:8px 10px}
.wr-card-foot{margin-top:14px;font-size:12px;opacity:.8}
.wr-card-otter{position:absolute;right:8px;bottom:4px}
.wr-toast{position:fixed;left:50%;bottom:calc(92px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:120;background:${INK};color:#FFD23F;padding:9px 16px;border-radius:999px;font-size:15px;white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis}
@media (prefers-reduced-motion: reduce){.wr-bottle,.wr-due,.wr-drop{animation:none}}
`;
