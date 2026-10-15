// lib/seaSound.ts
// ============================================================================
// 어항(바다) 홈의 물속 소리 — 파일 없이 브라우저 안에서 직접 만든다.
// ----------------------------------------------------------------------------
//   - 바닥: 아주 작게 깔리는 물속 웅웅 소리(갈색 잡음 → 저역 필터, 아주 천천히 밀려왔다 빠지는 너울)
//   - 위: 가끔 보글. 한 방울씩, 가끔은 서너 방울이 줄줄이.
//   - 밤(21시~6시)에는 더 작고, 보글도 드물게.
// 기본은 꺼짐. 홈의 소라를 눌러야 켜진다(아이폰은 사용자가 화면을 건드리기 전엔 소리를 못 낸다).
// 녹음할 때는 반드시 끈다 — 물소리가 마이크로 들어가면 받아쓰기가 망가진다.
// ============================================================================

const PREF_KEY = "ganseobi_sea_sound";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bubbleBus: GainNode | null = null;
let noise: AudioBufferSourceNode | null = null;
let lfo: OscillatorNode | null = null;
let bubbleTimer: ReturnType<typeof setTimeout> | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let playing = false;
let night = false;

export function seaSoundPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSeaSoundPref(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "1" : "0");
  } catch {
    /* 저장 못 하면 이번에만 */
  }
}

export function isSeaPlaying(): boolean {
  return playing;
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const Ctx: typeof AudioContext | undefined = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  // 앱을 내려두면 소리도 쉰다.
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (playing) ctx.resume().catch(() => {});
  });
  return ctx;
}

function brownNoise(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.5;
  }
  // 이음새가 안 들리게 앞뒤를 살짝 겹쳐 녹인다.
  const fade = Math.floor(c.sampleRate * 0.25);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    d[i] = d[i] * t + d[len - fade + i] * (1 - t);
  }
  return buf;
}

function bubble(c: AudioContext, at: number, size: number) {
  if (!bubbleBus) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  const f0 = 260 + (1 - size) * 520 + Math.random() * 120; // 큰 방울일수록 낮게
  const dur = 0.05 + size * 0.09;
  osc.type = "sine";
  osc.frequency.setValueAtTime(f0, at);
  osc.frequency.exponentialRampToValueAtTime(f0 * (2 + Math.random() * 0.8), at + dur);
  const vol = (0.08 + Math.random() * 0.08) * (night ? 0.6 : 1);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g);
  g.connect(bubbleBus);
  osc.start(at);
  osc.stop(at + dur + 0.02);
  osc.onended = () => {
    try {
      g.disconnect();
    } catch {
      /* 이미 끊김 */
    }
  };
}

function scheduleBubbles() {
  if (!playing || !ctx) return;
  const c = ctx;
  const now = c.currentTime + 0.02;
  if (Math.random() < 0.22) {
    // 줄줄이 올라가는 방울
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) bubble(c, now + i * (0.07 + Math.random() * 0.06), 0.2 + Math.random() * 0.4);
  } else {
    bubble(c, now, Math.random());
  }
  const gap = (night ? 1400 : 600) + Math.random() * (night ? 3200 : 1900);
  bubbleTimer = setTimeout(scheduleBubbles, gap);
}

/** 소라를 누른 순간(사용자 제스처 안)에 부를 것. 이미 켜져 있으면 밤/낮만 맞춘다. */
export function startSea(isNight: boolean) {
  night = isNight;
  const c = ensureCtx();
  if (!c) return;
  if (c.state !== "running") c.resume().catch(() => {});
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  const target = night ? 0.32 : 0.55;
  if (playing && master) {
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setTargetAtTime(target, c.currentTime, 0.4);
    return;
  }
  playing = true;

  master = c.createGain();
  master.gain.value = 0.0001;
  master.connect(c.destination);

  // 웅웅 — 갈색 잡음을 낮게 거른다
  const low = c.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = night ? 150 : 190;
  low.Q.value = 0.7;
  const bedGain = c.createGain();
  bedGain.gain.value = 0.12; // 바닥 소리는 아주 작게 — 보글이 주인공
  noise = c.createBufferSource();
  noise.buffer = brownNoise(c, 6);
  noise.loop = true;
  noise.connect(low);
  low.connect(bedGain);
  bedGain.connect(master);
  noise.start();

  // 너울 — 필터를 아주 천천히 열었다 닫는다
  lfo = c.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoDepth = c.createGain();
  lfoDepth.gain.value = 35;
  lfo.connect(lfoDepth);
  lfoDepth.connect(low.frequency);
  lfo.start();

  // 보글 — 물속에서 들리는 것처럼 살짝 먹먹하게
  const soft = c.createBiquadFilter();
  soft.type = "lowpass";
  soft.frequency.value = 2400;
  bubbleBus = c.createGain();
  bubbleBus.gain.value = 1;
  bubbleBus.connect(soft);
  soft.connect(master);

  master.gain.setTargetAtTime(target, c.currentTime, 0.6);
  scheduleBubbles();
}

/** 끈다. fadeSec 동안 줄였다가 멈춘다. 녹음 시작 전에는 짧게(0.15초). */
export function stopSea(fadeSec = 0.6) {
  if (!playing || !ctx || !master) return;
  playing = false;
  if (bubbleTimer) {
    clearTimeout(bubbleTimer);
    bubbleTimer = null;
  }
  const c = ctx;
  const m = master;
  const n = noise;
  const l = lfo;
  m.gain.cancelScheduledValues(c.currentTime);
  m.gain.setTargetAtTime(0.0001, c.currentTime, Math.max(0.03, fadeSec / 4));
  stopTimer = setTimeout(() => {
    try {
      n?.stop();
      l?.stop();
      m.disconnect();
    } catch {
      /* 이미 멈춤 */
    }
    stopTimer = null;
  }, fadeSec * 1000 + 50);
  master = null;
  noise = null;
  lfo = null;
  bubbleBus = null;
}

/** 물고기를 눌렀을 때 작게 "퐁" — 소리가 켜져 있을 때만. */
export function plop() {
  if (!playing || !ctx) return;
  const c = ctx;
  bubble(c, c.currentTime + 0.01, 0.9);
  bubble(c, c.currentTime + 0.09, 0.3);
}

/** 참견이가 기억을 꺼내 올 때 — 맑은 종소리 세 개가 위로. 물속 소리가 켜져 있을 때만. */
export function recallChime() {
  if (!playing || !ctx || !master) return;
  const c = ctx;
  const out = master;
  [659, 784, 1047].forEach((f, i) => {
    const at = c.currentTime + 0.02 + i * 0.13;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.09, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    osc.connect(g);
    g.connect(out);
    osc.start(at);
    osc.stop(at + 1);
    osc.onended = () => {
      try {
        g.disconnect();
      } catch {
        /* 이미 끊김 */
      }
    };
  });
  bubble(c, c.currentTime + 0.45, 0.4);
}

// ---- 심해에서 혼자 노는 참견이 소리(components/DeepSea.tsx) — 물속 소리가 켜져 있을 때만 ----
//   tok   조개를 배 위 돌에 탁 — 물속이라 둔하게(저역 통과)
//   munch 오물오물 — 아주 작게
//   tik   조약돌 받을 때 똑
//   ting  주머니에서 꺼낸 돌이 반짝
//   swish 바닥까지 "슝" 다이빙 / 친구가 휙 달아날 때 — 물을 가르는 소리(낮게 쓸려 가는 잡음)
//   rustle 해초를 톡톡 — 사각사각 아주 작게
//   boop  친구랑 콩 부딪힐 때 — 동그란 "뿅" + 방울 하나
//   crackle 아지트 열수구(물속 아궁이) 타닥 — 아주 작게, 계속(components/DeepSea.tsx가 박자를 정함)
//   sizzle  열수구에 조개 구울 때 / 눌렀을 때 — 치익 + 보글
//   spark   저녁 빛 플랑크톤 불꽃 — 퐁 올라가서 맑게 반짝(작게)
export type OtterSound = "tok" | "munch" | "tik" | "ting" | "swish" | "rustle" | "boop" | "crackle" | "sizzle" | "spark";

function noiseBurst(c: AudioContext, out: AudioNode, at: number, dur: number, freq: number, q: number, vol: number, type: BiquadFilterType) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(at);
  src.stop(at + dur + 0.02);
  src.onended = () => {
    try {
      g.disconnect();
      f.disconnect();
    } catch {
      /* 이미 끊김 */
    }
  };
}

function tone(c: AudioContext, out: AudioNode, at: number, f0: number, f1: number, dur: number, vol: number) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(f0, at);
  osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g);
  g.connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.02);
  osc.onended = () => {
    try {
      g.disconnect();
    } catch {
      /* 이미 끊김 */
    }
  };
}

export function otterSound(kind: OtterSound) {
  if (!playing || !ctx || !master) return;
  const c = ctx;
  const out = master;
  const at = c.currentTime + 0.005;
  const k = night ? 0.6 : 1;
  if (kind === "tok") {
    noiseBurst(c, out, at, 0.07, 900 + Math.random() * 300, 1.2, 0.5 * k, "lowpass");
    tone(c, out, at, 180 + Math.random() * 40, 90, 0.08, 0.18 * k);
  } else if (kind === "munch") {
    noiseBurst(c, out, at, 0.05, 700 + Math.random() * 400, 2.5, 0.12 * k, "bandpass");
  } else if (kind === "tik") {
    tone(c, out, at, 1500 + Math.random() * 300, 1300, 0.04, 0.06 * k);
  } else if (kind === "swish") {
    noiseBurst(c, out, at, 0.45, 520, 0.7, 0.32 * k, "lowpass");
    noiseBurst(c, out, at + 0.05, 0.3, 1100, 1.4, 0.08 * k, "bandpass");
  } else if (kind === "rustle") {
    for (let i = 0; i < 3; i++) noiseBurst(c, out, at + i * 0.07 + Math.random() * 0.02, 0.05, 2200 + Math.random() * 800, 3, 0.06 * k, "bandpass");
  } else if (kind === "crackle") {
    // 장작 타는 소리처럼 — 짧은 딱 + 가끔 두세 번 연달아
    const n = Math.random() < 0.25 ? 2 + Math.floor(Math.random() * 2) : 1;
    for (let i = 0; i < n; i++) noiseBurst(c, out, at + i * (0.03 + Math.random() * 0.05), 0.012 + Math.random() * 0.02, 1600 + Math.random() * 2400, 1.6, (0.05 + Math.random() * 0.05) * k, "bandpass");
    if (Math.random() < 0.12) bubble(c, at + 0.05, 0.6 + Math.random() * 0.4);
  } else if (kind === "sizzle") {
    noiseBurst(c, out, at, 0.7, 3800, 0.9, 0.05 * k, "highpass");
    bubble(c, at + 0.1, 0.4);
    bubble(c, at + 0.22, 0.7);
  } else if (kind === "spark") {
    const notes = [784, 880, 1047, 1175, 1319];
    const f = notes[Math.floor(Math.random() * notes.length)];
    tone(c, out, at, 300, 620, 0.22, 0.05 * k);
    tone(c, out, at + 0.24, f, f, 0.9, 0.05 * k);
    tone(c, out, at + 0.3, f * 1.5, f * 1.5, 0.7, 0.025 * k);
    for (let i = 0; i < 4; i++) noiseBurst(c, out, at + 0.26 + i * 0.06 + Math.random() * 0.04, 0.015, 3000 + Math.random() * 2000, 2, 0.03 * k, "bandpass");
  } else if (kind === "boop") {
    tone(c, out, at, 420, 760, 0.14, 0.09 * k);
    bubble(c, at + 0.12, 0.5);
  } else {
    tone(c, out, at, 1320, 1320, 0.7, 0.05 * k);
    tone(c, out, at + 0.08, 1760, 1760, 0.6, 0.035 * k);
  }
}
