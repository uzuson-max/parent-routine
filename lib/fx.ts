
"use client";

// 참견이 버튼 효과음(FX) — "효과음"보다는 작은 물건을 톡 건드리는 촉감에 가깝게.
//
// 사운드 파일을 따로 두지 않고, 처음 재생할 때 아주 짧은 소리(45~70ms)를 코드로 한 번 만들어 캐시한다.
//   - 파일 로딩이 없어서 첫 클릭도 바로 소리가 난다 (네트워크 요청 0).
//   - 세 소리는 같은 방식(짧게 떨어지는 음 + 아주 약한 접촉 잡음, 고음 깎음)이고 높이/길이만 달라서
//     하나의 작은 사운드 언어처럼 들린다.
//
// 원칙:
//   - playFx()는 아무것도 기다리지 않는다(동기 호출, await 없음) → 버튼 동작/녹음 시작을 지연시키지 않는다.
//   - 어떤 이유로든 실패하면 조용히 넘어간다 (에러 throw/콘솔 출력 없음). 앱 기능은 소리에 의존하지 않는다.
//   - 반드시 사용자 클릭 핸들러 안에서 부른다 — 모바일 autoplay 정책 때문에 AudioContext를 제스처 안에서 깨워야 한다.
//   - 볼륨은 Web Audio GainNode로 조절한다 (iOS Safari는 <audio>.volume을 무시하기 때문).
//   - MY > 효과음 토글(localStorage "ganseobi_sound_enabled" = "0")이 꺼져 있으면 재생하지 않는다.
//     대신 그 경우에만 아주 짧은 햅틱(navigator.vibrate)으로 대체한다 (아래 playHaptic).

export type FxName = "micStart" | "micStop" | "buttonPress";

// 전체 볼륨(0~1). "소리가 있었나?" 정도에서 시작해서 실제 기기에서 조금씩 올린다.
const MASTER_VOLUME = 0.15;

// 이 간격 안에 다시 불리면 무시 — 연타/상태 전환 순간 겹쳐서 다다닥 나는 것 방지.
const MIN_INTERVAL_MS = 90;

const SOUND_KEY = "ganseobi_sound_enabled"; // MyPageScreen의 효과음 토글과 같은 키

type FxSpec = {
  fromHz: number; // 시작 음높이
  toHz: number; // 떨어져서 머무는 음높이
  decayMs: number; // 소리가 줄어드는 속도 (짧을수록 "톡")
  lengthMs: number; // 전체 길이
  level: number; // 세 소리 사이의 상대 크기
};

const SPECS: Record<FxName, FxSpec> = {
  micStart: { fromHz: 900, toHz: 660, decayMs: 11, lengthMs: 60, level: 1 }, // 톡
  micStop: { fromHz: 520, toHz: 380, decayMs: 14, lengthMs: 70, level: 1 }, // 툭 (조금 낮고 둔하게)
  buttonPress: { fromHz: 720, toHz: 560, decayMs: 8, lengthMs: 45, level: 0.75 }, // 더 짧고 작게
};

// 소리 한 개를 샘플 배열로 만든다. 순수 함수 — 같은 입력이면 항상 같은 소리.
export function renderFx(name: FxName, sampleRate: number): Float32Array {
  const spec = SPECS[name];
  const n = Math.max(1, Math.round((spec.lengthMs / 1000) * sampleRate));
  const out = new Float32Array(n);
  const decay = spec.decayMs / 1000;
  const glide = 0.008; // 음높이가 떨어지는 속도
  const attack = 0.0008; // 너무 날카롭지 않게 아주 살짝 부드러운 시작
  let phase = 0;
  let seed = 12345; // 접촉 잡음용 고정 난수 (항상 같은 소리)
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const freq = spec.toHz + (spec.fromHz - spec.toHz) * Math.exp(-t / glide);
    phase += (2 * Math.PI * freq) / sampleRate;
    const env = (1 - Math.exp(-t / attack)) * Math.exp(-t / decay);
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = (seed / 0x7fffffff) * 2 - 1;
    const click = noise * 0.25 * Math.exp(-t / 0.0006); // 손끝이 닿는 아주 짧은 접촉감
    out[i] = Math.sin(phase) * env + click;
  }
  // 고음을 깎아서 디지털 "삑" 느낌 대신 둔탁하게 (1-pole lowpass, 약 2.8kHz)
  const a = Math.exp((-2 * Math.PI * 2800) / sampleRate);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = (1 - a) * out[i] + a * y;
    out[i] = y;
  }
  // 끝 5ms는 0으로 부드럽게 (끝에서 딸깍 소리 방지)
  const fade = Math.min(n, Math.round(0.005 * sampleRate));
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  // 피크 정규화 후 상대 크기 적용
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const k = peak > 0 ? (0.9 * spec.level) / peak : 0;
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

// --- 햅틱(진동) — 효과음이 OFF일 때만 쓰는 대체 피드백 ---
// 같은 사용자 설정(MY > 효과음)을 쓴다: 효과음 ON → 소리만, 효과음 OFF → 아주 짧은 진동만.
// navigator.vibrate는 세기 조절이 안 되고 길이만 정할 수 있어서, "약하게" = 아주 짧게(8~12ms)로 맞춘다.
// iOS Safari 등 미지원 환경(navigator.vibrate 없음)과 PC(있어도 진동 모터 없음)에서는 아무 일도 일어나지 않는다.
const HAPTIC_MS: Record<FxName, number> = {
  micStart: 10, // 톡
  micStop: 12, // 툭 (아주 조금 더 길게)
  buttonPress: 8, // 가장 가볍게
};
const HAPTIC_MIN_INTERVAL_MS = 90; // 연타해도 진동이 다다닥 반복되지 않게 (효과음 MIN_INTERVAL_MS와 같은 값)
let lastHapticAt = -Infinity;

function playHaptic(name: FxName): void {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    const now = performance.now();
    if (now - lastHapticAt < HAPTIC_MIN_INTERVAL_MS) return;
    lastHapticAt = now;
    navigator.vibrate(HAPTIC_MS[name]);
  } catch {
    // 진동은 실패해도 아무 영향 없어야 한다 — 조용히 포기.
  }
}

let ctx: AudioContext | null = null;
let broken = false; // 이 기기에서 Web Audio가 안 되면 더 시도하지 않는다
const buffers: Partial<Record<FxName, AudioBuffer>> = {};
let current: AudioBufferSourceNode | null = null;
let lastPlayedAt = -Infinity;

function soundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctx: typeof AudioContext | undefined = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) {
    broken = true;
    return null;
  }
  ctx = new Ctx();
  return ctx;
}

// 브라우저에서 첫 AudioContext를 만드는 데 수십 ms가 걸린다(측정: 약 40ms). 그걸 클릭 순간에 하면
// 첫 탭의 소리와 화면 전환이 그만큼 늦어지므로, 손가락이 화면에 닿는 순간(pointerdown — 손을 떼는
// click보다 보통 50~100ms 먼저 온다)에 미리 한 번만 만들어 둔다. 실제 재생/resume은 여전히 click 안에서 한다.
if (typeof window !== "undefined") {
  const warm = () => {
    if (broken || ctx || !soundEnabled()) return;
    try { ensureContext(); } catch { broken = true; }
  };
  window.addEventListener("pointerdown", warm, { capture: true, once: true, passive: true });
}

export function playFx(name: FxName): void {
  // 효과음 OFF면 소리 대신 아주 약한 햅틱만 (지원 안 되면 아무것도 안 함). 효과음 ON이면 아래 기존 로직 그대로.
  if (typeof window !== "undefined" && !soundEnabled()) {
    playHaptic(name);
    return;
  }
  if (broken || typeof window === "undefined") return;
  try {
    if (!soundEnabled()) return;

    const now = performance.now();
    if (now - lastPlayedAt < MIN_INTERVAL_MS) return;
    lastPlayedAt = now;

    const ctx = ensureContext();
    if (!ctx) return;
    // 사용자 제스처 안에서 깨운다. 기다리지 않는다 — 깨어나는 즉시 아래 예약된 소리가 난다.
    if (ctx.state !== "running") ctx.resume().catch(() => {});

    let buffer = buffers[name];
    if (!buffer) {
      const data = renderFx(name, ctx.sampleRate);
      buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buffer.getChannelData(0).set(data);
      buffers[name] = buffer;
    }

    // 앞 소리가 아직 나고 있으면 끊고 새 소리 하나만 (겹침 방지)
    if (current) {
      try { current.stop(); } catch {}
      current = null;
    }

    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = MASTER_VOLUME;
    src.buffer = buffer;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.onended = () => {
      if (current === src) current = null;
      try { gain.disconnect(); } catch {}
    };
    src.start();
    current = src;
  } catch {
    // 소리는 실패해도 아무 영향 없어야 한다 — 조용히 포기.
    broken = true;
  }
}
