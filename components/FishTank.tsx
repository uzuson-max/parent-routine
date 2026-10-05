"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// ============================================================================
// 참견이 C안 — "생각이 금붕어가 되어 어항 안에 쌓인다"
// ----------------------------------------------------------------------------
// - 이번 달(로컬 시간 기준) voice_entries만 어항에 들어간다. 한 달 = 어항 하나.
// - 짧게 던진 생각 = 치어(5마리씩 무리), 길게 말한 생각 = 금붕어.
//   기준은 받아쓰기의 공백 제외 글자 수(한국어 말하기 기준 약 1초에 5~6자).
// - 화면이 복잡해지지 않게 금붕어 최대 10마리, 치어 최대 25마리(5무리)까지만 그린다.
// - 금붕어/치어 무리를 누르면 실제로 했던 말이 말풍선으로 잠깐 떠오른다.
// - 새로 생긴 기록은 홈에 돌아왔을 때 "퐁당" 하고 들어오는 애니메이션으로 보여준다.
// - 밤(21시~6시)에는 물이 어두워지고 다들 눈 감고 천천히 헤엄친다.
// - 설명 문구는 하나도 넣지 않는다.
// ============================================================================

export interface TankEntry {
  id: string;
  createdAt: string;
  transcript: string;
    // 참견이의 말에 대답한 녹음이면 true — 생각이 아니라 대화라서 어항에 넣지 않는다.
  isReply?: boolean;
}

interface FishTankProps {
  entries: TankEntry[] | null;
    // 방금 녹음을 보내고 참견이가 생각하는 중 — 어항 가운데 커다란 물방울이 꿀렁거린다.
  thinking?: boolean;
  // 어항 물 부분을 눌렀을 때(= 마이크와 같은 동작). 없으면 어항 터치로는 아무 일도 안 일어난다.
  onTankPress?: () => void;
}

// 공백 제외 글자 수 기준
const NOISE_MAX = 5; // 이 이하는 잡음/테스트로 보고 어항에 넣지 않는다
const FRY_MAX = 35; // 이 이하는 치어, 넘으면 금붕어 (약 6초)
const MAX_FISH = 10;
const MAX_FRY = 25;
const SEEN_KEY = "ganseobi_tank_seen_v1";

const TANK_W = 340; // 디자인 기준 폭(px). 실제 폭이 좁으면 비율대로 줄어든다.
const TANK_H = 440;

function hash(str: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function charCount(t: string): number {
  return t.replace(/\s/g, "").length;
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

function isThisMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const FRY_OFFSETS: [number, number][] = [
  [2, 14],
  [20, 2],
  [22, 24],
  [40, 12],
  [6, 28],
];

export default function FishTank({ entries, thinking, onTankPress }: FishTankProps) {
  const [night, setNight] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [thought, setThought] = useState<{ text: string; key: number } | null>(null);
  const [wiggle, setWiggle] = useState<{ id: string; n: number } | null>(null);
  const thoughtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 시간대는 클라이언트에서만 판단(서버 렌더와 어긋나지 않게)
  useEffect(() => {
    const check = () => {
      const h = new Date().getHours();
      setNight(h >= 21 || h < 6);
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => {
    if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
  }, []);

  const { fishes, schools } = useMemo(() => {
    const now = new Date();
    const list = (entries ?? [])
            .filter((e) => e.transcript && !e.isReply && isThisMonth(e.createdAt, now) && charCount(e.transcript) > NOISE_MAX)
      // 오래된 것 → 최신 순
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const longOnes = list.filter((e) => charCount(e.transcript) > FRY_MAX);
    const shortOnes = list.filter((e) => charCount(e.transcript) <= FRY_MAX);

    return {
      fishes: longOnes.slice(-MAX_FISH),
      schools: chunk(shortOnes.slice(-MAX_FRY), 5),
    };
  }, [entries]);

  // 새로 생긴 기록 찾기 — 처음 쓰는 기기에서는 전부 "본 것"으로 처리하고 애니메이션 없이 시작.
  useEffect(() => {
    if (!entries) return;
    const ids = entries.map((e) => e.id);
    let seen: string[] | null = null;
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      seen = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      seen = null;
    }
    if (seen) {
      const seenSet = new Set(seen);
      const newOnes = ids.filter((id) => !seenSet.has(id));
      if (newOnes.length) setFresh(new Set(newOnes));
    }
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(0, 300)));
    } catch {
      /* 저장 못 해도 어항은 그대로 보인다 */
    }
  }, [entries]);

  const showThought = (id: string, text: string) => {
    setWiggle((w) => ({ id, n: (w?.n ?? 0) + 1 }));
    setThought({ text: truncate(text, 40), key: Date.now() });
    if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
    thoughtTimer.current = setTimeout(() => setThought(null), 3200);
  };

  const slow = night ? 1.9 : 1;
  const wigCls = (id: string) => (wiggle?.id === id ? (wiggle.n % 2 ? "ft-wigA" : "ft-wigB") : "");
  const water = night ? "#2C78B6" : "#45BFEC";

  return (
    <div className="ft-wrap">
            <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="ft-lid" aria-hidden>
        <div className="ft-lid-shine" />
      </div>

      <div className="ft-tank" style={{ background: night ? "#9FC3E3" : "#EAF9FF" }}>
        <div className="ft-water" style={{ background: water }}>
          <svg className="ft-wave" width="680" height="30" viewBox="0 0 680 30" aria-hidden>
            <path d="M0 14 Q42.5 2 85 14 T170 14 T255 14 T340 14 T425 14 T510 14 T595 14 T680 14 V30 H0 Z" fill={water} />
            <path d="M0 14 Q42.5 2 85 14 T170 14 T255 14 T340 14 T425 14 T510 14 T595 14 T680 14" fill="none" stroke="#FFFFFF" strokeWidth={3} />
          </svg>
        </div>

        {!night && (
          <>
            <div className="ft-ray" style={{ left: "20%" }} />
            <div className="ft-ray" style={{ left: "44%", width: 18, animationDelay: "-1.5s" }} />
            <div className="ft-ray" style={{ left: "70%", width: 34, animationDelay: "-3s" }} />
          </>
        )}

        {onTankPress && <button className="ft-tankbtn" aria-label="생각 말하기" onClick={onTankPress} />}

        {/* 수초 */}
        <svg className="ft-deco" width="40" height="150" viewBox="0 0 40 140" style={{ left: 20, bottom: 40 }} aria-hidden>
          <path className="ft-ol ft-sway" d={WEED} fill="#2FAF6A" />
        </svg>
        <svg className="ft-deco" width="30" height="100" viewBox="0 0 40 140" style={{ left: 52, bottom: 36 }} aria-hidden>
          <path className="ft-ol ft-sway" d={WEED} fill="#46C985" style={{ animationDelay: "-1.2s" }} />
        </svg>

        {/* 가라앉은 머그컵 */}
        <svg className="ft-deco" width="54" height="48" viewBox="0 0 50 44" style={{ right: 60, bottom: 34, transform: "rotate(-22deg)", zIndex: 4 }} aria-hidden>
          <path className="ft-ol" d="M34 14 C45 14 45 31 34 31" fill="none" />
          <path className="ft-ol" d="M6 8 H34 V34 C34 39 30 42 26 42 H14 C10 42 6 39 6 34 Z" fill="#FF8FB3" />
          <path className="ft-ol2" d="M6 17 H34 V23 H6 Z" fill="#FFF6E5" />
          <path className="ft-ol2" d="M20 8 L23 12 L26 8" fill="#45BFEC" />
        </svg>

        {/* 모래 + 자갈 */}
        <svg className="ft-sand" viewBox="0 0 332 84" preserveAspectRatio="none" aria-hidden>
          <path className="ft-ol" d="M-4 42 C40 28 80 46 120 35 C160 24 200 42 240 33 C280 24 310 37 336 30 V90 H-4 Z" fill="#F6D589" />
          {PEBBLES.map(([cx, cy, rx, ry, c], i) => (
            <ellipse key={i} className="ft-ol2" cx={cx} cy={cy} rx={rx} ry={ry} fill={c} />
          ))}
        </svg>

        {/* 기포 */}
        {BUBBLES.map((b, i) => (
          <div key={i} className="ft-bubble" style={b} />
        ))}

        {/* 치어 무리 */}
        {schools.map((group) => {
          const sid = group[0].id;
          const r = (k: number) => hash(sid, k);
          const dur = (16 + r(6) * 8) * slow;
          const dx = 50 + r(2) * 120;
          const leftPx = 14 + r(4) * Math.max(0, TANK_W - 28 - 64 - dx);
          const topPx = 100 + r(3) * 190;
          const last = group[group.length - 1];
          return (
            <div
              key={sid}
              className="ft-swim"
              style={{
                left: `${(leftPx / TANK_W) * 100}%`,
                top: `${(topPx / TANK_H) * 100}%`,
                width: 64,
                ["--dx" as any]: `${dx}px`,
                animationDuration: `${dur}s`,
                animationDelay: `${-(r(5) * dur)}s`,
                zIndex: 4,
              }}
            >
              <div>
                <button className={`ft-school ${wigCls(sid)}`} aria-label="치어 무리" onClick={() => showThought(sid, last.transcript)}>
                  {group.map((e, m) => (
                    <div key={e.id} className={`ft-fry ${fresh.has(e.id) ? "ft-arrive" : ""}`} style={{ left: FRY_OFFSETS[m][0], top: FRY_OFFSETS[m][1] }}>
                      <div
                        className="ft-bob"
                        style={{
                          animationDuration: `${0.9 + hash(e.id, 3) * 0.6}s`,
                          animationDelay: `${-hash(e.id, 4)}s`,
                          ["--wag" as any]: night ? "0.4s" : "0.2s",
                        }}
                      >
                        <svg viewBox="0 0 40 26" aria-hidden>
                          <g className="ft-tail">
                            <path className="ft-ol2" d="M12 13 C7 7 4 6 1 7 C3 11 3 15 1 19 C4 20 7 19 12 13 Z" fill="#FFD3A1" />
                          </g>
                          <ellipse className="ft-ol2" cx="23" cy="13" rx="12" ry="8.5" fill={hash(e.id, 5) > 0.5 ? "#FFA45C" : "#FF9447"} />
                          {night ? (
                            <path className="ft-ol2" d="M24 11 Q28 14 32 11" fill="none" />
                          ) : (
                            <>
                              <circle className="ft-ol2" cx="28" cy="10.5" r="4.8" fill="#FFFFFF" />
                              <circle cx="29.3" cy="10.9" r="2.4" fill="#1B1630" />
                            </>
                          )}
                        </svg>
                      </div>
                    </div>
                  ))}
                </button>
              </div>
            </div>
          );
        })}

        {/* 금붕어 */}
        {fishes.map((e) => {
          const r = (k: number) => hash(e.id, k);
          const w = Math.round(56 + r(1) * 14);
          const dur = (13 + r(6) * 10) * slow;
          const dx = 70 + r(2) * 120;
          const leftPx = 14 + r(4) * Math.max(0, TANK_W - 28 - w - dx);
          const topPx = 105 + r(3) * 170;
          const color = ["#FF7A1A", "#FF8C2E", "#FF6B24"][Math.floor(r(11) * 3)];
          return (
            <div
              key={e.id}
              className="ft-swim"
              style={{
                left: `${(leftPx / TANK_W) * 100}%`,
                top: `${(topPx / TANK_H) * 100}%`,
                width: w,
                ["--dx" as any]: `${dx}px`,
                animationDuration: `${dur}s`,
                animationDelay: `${-(r(5) * dur)}s`,
                zIndex: 5,
              }}
            >
              <div
                className="ft-bob"
                style={{
                  animationDuration: `${1.6 + r(7)}s`,
                  animationDelay: `${-r(8) * 2}s`,
                  ["--wag" as any]: `${(0.32 + r(9) * 0.25) * (night ? 1.6 : 1)}s`,
                  ["--blink" as any]: `${3 + r(10) * 4}s`,
                }}
              >
                <div className={fresh.has(e.id) ? "ft-arrive" : ""}>
                  <button className={`ft-fishbtn ${wigCls(e.id)}`} aria-label="금붕어" onClick={() => showThought(e.id, e.transcript)}>
                    <svg viewBox="0 0 80 56" aria-hidden>
                      <g className="ft-tail">
                        <path className="ft-ol" d="M24 28 C14 17 8 11 3 12 C7 21 7 35 3 44 C8 45 14 39 24 28 Z" fill={color} />
                      </g>
                      <path className="ft-ol" d="M34 13 C37 3 49 1 56 10" fill={color} />
                      <ellipse className="ft-ol" cx="47" cy="29" rx="26" ry="19.5" fill={color} />
                      <ellipse cx="49" cy="37" rx="15" ry="6.5" fill="#FFC75A" />
                      {r(12) > 0.55 && <ellipse cx="37" cy="20" rx="5.5" ry="3.8" fill="#FFE6C9" />}
                      <path className="ft-ol2" d="M42 31 C37 36 39 41 46 39" fill="#FFB04A" />
                      {night ? (
                        <path className="ft-ol2" d="M51 22 Q58 28 65 22" fill="none" />
                      ) : (
                        <g className="ft-eye">
                          <circle className="ft-ol" cx="58" cy="22" r="8.5" fill="#FFFFFF" />
                          <circle cx="60.5" cy="22.5" r="3.9" fill="#1B1630" />
                          <circle cx="59.2" cy="21" r="1.3" fill="#FFFFFF" />
                        </g>
                      )}
                      <path className="ft-ol2" d="M70 32 Q73.5 34.5 70.5 37" fill="none" />
                      <ellipse cx="63" cy="33" rx="3.6" ry="2.2" fill="#FF5E7E" opacity={0.55} />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        <svg className="ft-deco" width="34" height="120" viewBox="0 0 40 140" style={{ right: 26, bottom: 30, zIndex: 7 }} aria-hidden>
          <path className="ft-ol ft-sway" d={WEED} fill="#2FAF6A" style={{ animationDelay: "-2.2s" }} />
        </svg>

        {night && (
          <>
            <div className="ft-zz" style={{ left: "68%", top: 110, fontSize: 22 }}>z</div>
            <div className="ft-zz" style={{ left: "74%", top: 100, fontSize: 16, animationDelay: "-1.2s" }}>z</div>
            <div className="ft-zz" style={{ left: "26%", top: 150, fontSize: 18, animationDelay: "-2.4s" }}>z</div>
          </>
        )}

                {thinking && (
          <div className="ft-thinking" role="status" aria-label="참견이가 생각하는 중">
            <span className="ft-dot" />
            <span className="ft-dot" style={{ animationDelay: ".15s" }} />
            <span className="ft-dot" style={{ animationDelay: ".3s" }} />
          </div>
        )}

        {thought && !thinking && (
          <div key={thought.key} className="ft-thought" role="status">
            {thought.text}
          </div>
        )}

        {/* 유리 반사 */}
        <svg className="ft-deco" width="40" height="300" viewBox="0 0 40 300" style={{ left: 14, top: 40, zIndex: 8 }} aria-hidden>
          <path d="M24 20 C10 70 8 150 16 230" fill="none" stroke="#FFFFFF" strokeWidth={9} strokeLinecap="round" opacity={0.7} />
          <path d="M22 258 C24 266 26 272 29 278" fill="none" stroke="#FFFFFF" strokeWidth={9} strokeLinecap="round" opacity={0.7} />
        </svg>
      </div>

      <div className="ft-table" style={{ background: night ? "#C27434" : "#F2A65A" }} aria-hidden />
    </div>
  );
}

const WEED = "M20 140 C8 110 30 95 18 70 C8 48 28 35 20 6 C34 30 22 50 30 72 C40 98 24 112 28 140 Z";

const PEBBLES: [number, number, number, number, string][] = [
  [40, 52, 13, 9, "#FF9EC4"],
  [66, 60, 10, 7, "#8BE0C0"],
  [96, 50, 12, 8, "#B9A7F2"],
  [128, 62, 14, 9, "#FFD54A"],
  [160, 48, 9, 6.5, "#FFFFFF"],
  [188, 58, 12, 8, "#FF9EC4"],
  [212, 66, 9, 6, "#7FB2FF"],
  [292, 52, 13, 9, "#8BE0C0"],
  [266, 64, 10, 7, "#FFD54A"],
  [20, 70, 11, 7, "#7FB2FF"],
  [110, 74, 9, 6, "#FF9EC4"],
  [236, 76, 11, 7, "#B9A7F2"],
  [314, 72, 9, 6, "#FFFFFF"],
];

const BUBBLES: React.CSSProperties[] = [
  { left: "74%", bottom: 70, width: 12, height: 12, animationDuration: "3.4s" },
  { left: "76%", bottom: 70, width: 8, height: 8, animationDuration: "3.4s", animationDelay: "-1.2s" },
  { left: "72%", bottom: 70, width: 15, height: 15, animationDuration: "4.2s", animationDelay: "-2.6s" },
  { left: "11%", bottom: 60, width: 10, height: 10, animationDuration: "5s", animationDelay: "-0.8s" },
  { left: "45%", bottom: 56, width: 11, height: 11, animationDuration: "6s", animationDelay: "-2s" },
  { left: "88%", bottom: 56, width: 9, height: 9, animationDuration: "5.4s", animationDelay: "-4s" },
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Jua&display=swap');
.ft-wrap{position:relative;width:100%;max-width:${TANK_W}px;margin:0 auto;padding-top:14px}
.ft-lid{position:absolute;left:-12px;right:-12px;top:0;height:30px;box-sizing:border-box;border:4px solid #1B1630;border-radius:16px;background:#CFF1FF;z-index:3}
.ft-lid-shine{position:absolute;left:20px;top:5px;width:90px;height:6px;border-radius:6px;background:#FFFFFF}
.ft-tank{position:relative;width:100%;aspect-ratio:${TANK_W}/${TANK_H};box-sizing:border-box;border:4px solid #1B1630;border-radius:40px 40px 120px 120px / 40px 40px 130px 130px;overflow:hidden;box-shadow:6px 6px 0 rgba(27,22,48,.22);z-index:2;font-family:'Jua',sans-serif;color:#1B1630}
.ft-water{position:absolute;left:0;right:0;top:60px;bottom:0;transition:background .6s}
.ft-wave{position:absolute;left:0;top:-14px;display:block;animation:ft-wave 5s linear infinite}
@keyframes ft-wave{to{transform:translateX(-170px)}}
.ft-ray{position:absolute;top:40px;width:28px;height:460px;background:rgba(255,255,255,.13);transform:rotate(18deg);transform-origin:top;animation:ft-shimmer 4s ease-in-out infinite alternate;pointer-events:none}
@keyframes ft-shimmer{from{opacity:.4}to{opacity:1}}
.ft-tankbtn{position:absolute;left:0;right:0;top:56px;bottom:0;z-index:1;border:0;padding:0;margin:0;background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ft-tankbtn:focus-visible{outline:3px dashed #fff;outline-offset:-10px}
.ft-deco{position:absolute;z-index:3;overflow:visible;pointer-events:none}
.ft-sand{position:absolute;left:0;bottom:0;width:100%;height:84px;z-index:3;display:block;pointer-events:none}
.ft-ol{stroke:#1B1630;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.ft-ol2{stroke:#1B1630;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.ft-sway{transform-box:fill-box;transform-origin:50% 100%;animation:ft-sway 3.4s ease-in-out infinite alternate}
@keyframes ft-sway{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}
.ft-bubble{position:absolute;border-radius:50%;border:2px solid rgba(255,255,255,.95);background:rgba(255,255,255,.2);animation:ft-rise linear infinite;pointer-events:none;z-index:4}
.ft-bubble::after{content:"";position:absolute;left:22%;top:18%;width:26%;height:26%;border-radius:50%;background:#fff}
@keyframes ft-rise{0%{transform:translate(0,0) scale(.5);opacity:0}10%{opacity:1}50%{transform:translate(7px,-150px) scale(1)}90%{opacity:1}100%{transform:translate(-5px,-292px) scale(1.15);opacity:0}}
.ft-swim{position:absolute;animation-name:ft-swim;animation-timing-function:ease-in-out;animation-iteration-count:infinite;pointer-events:none}
@keyframes ft-swim{0%{transform:translateX(0) scaleX(1)}46%{transform:translateX(var(--dx)) scaleX(1)}50%{transform:translateX(var(--dx)) scaleX(-1)}96%{transform:translateX(0) scaleX(-1)}100%{transform:translateX(0) scaleX(1)}}
.ft-bob{animation-name:ft-bob;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
@keyframes ft-bob{from{transform:translateY(-5px) rotate(-3deg)}to{transform:translateY(5px) rotate(3deg)}}
.ft-tail{transform-box:fill-box;transform-origin:100% 50%;animation:ft-wag var(--wag,.45s) ease-in-out infinite alternate}
@keyframes ft-wag{from{transform:rotate(-15deg)}to{transform:rotate(15deg)}}
.ft-eye{transform-box:fill-box;transform-origin:50% 50%;animation:ft-blink var(--blink,5s) infinite}
@keyframes ft-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
.ft-fishbtn,.ft-school{display:block;padding:0;margin:0;border:0;background:none;cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent}
.ft-fishbtn{width:100%}
.ft-fishbtn svg,.ft-fry svg{display:block;width:100%;height:auto;overflow:visible}
.ft-school{position:relative;width:64px;height:46px}
.ft-fishbtn:focus-visible,.ft-school:focus-visible{outline:3px dashed #1B1630;outline-offset:2px;border-radius:12px}
.ft-fry{position:absolute;width:20px}
.ft-wigA{animation:ft-wigA .7s ease-out}
.ft-wigB{animation:ft-wigB .7s ease-out}
@keyframes ft-wigA{0%{transform:none}20%{transform:scale(1.2,.84) rotate(-12deg)}45%{transform:scale(.9,1.12) rotate(9deg)}70%{transform:rotate(-4deg)}100%{transform:none}}
@keyframes ft-wigB{0%{transform:none}20%{transform:scale(1.2,.84) rotate(-12deg)}45%{transform:scale(.9,1.12) rotate(9deg)}70%{transform:rotate(-4deg)}100%{transform:none}}
.ft-arrive{animation:ft-arrive 1.3s cubic-bezier(.3,1.6,.5,1) .35s both}
@keyframes ft-arrive{0%{transform:translateY(-160px) scale(.55) rotate(-28deg);opacity:0}30%{opacity:1}100%{transform:none;opacity:1}}
.ft-zz{position:absolute;z-index:9;font-family:'Jua',sans-serif;color:#FFFFFF;-webkit-text-stroke:1.5px #1B1630;pointer-events:none;animation:ft-zz 3.6s ease-in-out infinite}
@keyframes ft-zz{0%{transform:translate(0,10px) scale(.6);opacity:0}25%{opacity:1}100%{transform:translate(14px,-40px) scale(1.2);opacity:0}}
.ft-thought{position:absolute;left:50%;top:76px;z-index:9;width:max-content;max-width:80%;padding:10px 18px;background:#fff;border:3px solid #1B1630;border-radius:24px;box-shadow:3px 3px 0 #1B1630;font-size:17px;line-height:1.3;text-align:center;pointer-events:none;word-break:keep-all;animation:ft-thought 3.2s ease forwards}
.ft-thought::before{content:"";position:absolute;left:46%;bottom:-17px;width:13px;height:13px;border-radius:50%;background:#fff;border:3px solid #1B1630}
.ft-thought::after{content:"";position:absolute;left:41%;bottom:-31px;width:7px;height:7px;border-radius:50%;background:#fff;border:2.5px solid #1B1630}
@keyframes ft-thought{0%{transform:translate(-50%,24px) scale(.5);opacity:0}12%{transform:translate(-50%,0) scale(1.06);opacity:1}18%{transform:translate(-50%,0) scale(1)}80%{transform:translate(-50%,-6px) scale(1);opacity:1}100%{transform:translate(-50%,-26px) scale(.95);opacity:0}}
.ft-table{position:relative;margin:-14px -40px 0;height:56px;border-top:4px solid #1B1630;border-bottom:4px solid #1B1630;box-shadow:inset 0 -18px 0 rgba(27,22,48,.16);z-index:1}
.ft-thinking{position:absolute;left:50%;top:44%;z-index:9;width:92px;height:92px;margin:-46px 0 0 -46px;box-sizing:border-box;border-radius:50%;border:3px solid #1B1630;background:rgba(255,255,255,.72);display:flex;align-items:center;justify-content:center;gap:7px;animation:ft-wobble 1.6s ease-in-out infinite;pointer-events:none}
.ft-thinking::after{content:"";position:absolute;left:20px;top:14px;width:18px;height:11px;border-radius:50%;background:#fff;transform:rotate(-30deg)}
.ft-dot{width:10px;height:10px;border-radius:50%;background:#1B1630;animation:ft-dot 1s ease-in-out infinite}
@keyframes ft-wobble{0%,100%{transform:scale(1,1) translateY(0)}25%{transform:scale(1.06,.94) translateY(3px)}50%{transform:scale(.95,1.05) translateY(-6px)}75%{transform:scale(1.03,.97) translateY(0)}}
@keyframes ft-dot{0%,100%{transform:translateY(0);opacity:.35}50%{transform:translateY(-6px);opacity:1}}
@media (prefers-reduced-motion: reduce){
  .ft-swim,.ft-bob,.ft-tail,.ft-eye,.ft-sway,.ft-wave,.ft-bubble,.ft-ray,.ft-zz{animation:none}
}
`;
