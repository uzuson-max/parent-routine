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
