"use client";

// ============================================================================
// 수달어 — 말풍선 글자가 찍힐 때마다 나는 아주 짧은 "뽁/뾱" 소리 (동물의숲 주민 말소리 방식).
// ----------------------------------------------------------------------------
// 사람 목소리 TTS를 안 쓴다: 어설픈 사람 목소리는 귀엽지 않고, 진짜 니 목소리와의 대비도 죽는다.
// 소리 파일 없음 — 글자 하나마다 60~80ms짜리 음을 코드로 만들어 바로 낸다(네트워크 0, 비용 0).
//
//   - 한글은 모음(중성)에 따라 음높이가 달라진다 → 같은 문장은 늘 같은 "말투"로 들린다.
//   - mode
//       mild  : 순한맛. 낮고 동글동글, 천천히
//       spicy : 매운맛. 높고 톡톡, 빠르게
//       mimic : 니 말 따라하기(놀리기). 더 높고 콧소리, 음이 오르락내리락 — 끝 "~"는 쭉 올라간다
//   - MY > 효과음 OFF(localStorage "ganseobi_sound_enabled" = "0")면 소리 안 냄. 글자는 그대로 찍힌다.
//   - 실패해도 조용히 넘어간다. 화면은 소리에 의존하지 않는다.
//   - AudioContext는 부르는 쪽이 넘긴다(조개 열기 버튼 터치로 이미 깨운 것) — 아이폰은 터치 없이 소리를 못 낸다.
// ============================================================================

export type BabbleMode = "mild" | "spicy" | "mimic";

const SOUND_KEY = "ganseobi_sound_enabled";
const VOLUME = 0.11;

const MODE: Record<BabbleMode, { base: number; spread: number; len: number; glide: number; wobble: number; nasal: number }> = {
  mild: { base: 430, spread: 150, len: 0.075, glide: -0.12, wobble: 0, nasal: 0.15 },
  spicy: { base: 610, spread: 220, len: 0.058, glide: -0.2, wobble: 0, nasal: 0.25 },
  mimic: { base: 760, spread: 260, len: 0.07, glide: 0.18, wobble: 0.06, nasal: 0.45 },
};

// 한 글자를 찍는 간격(ms) — 말풍선 타이핑 속도도 이걸 쓴다
export const BABBLE_STEP_MS: Record<BabbleMode, number> = { mild: 62, spicy: 44, mimic: 58 };

function soundOn(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

// 이 글자가 소리를 낼 글자인가 (띄어쓰기·문장부호·ㅋㅋ의 자음만 있는 건 따로)
export function isVoiced(ch: string): boolean {
  return /[가-힣a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ]/.test(ch);
}

// 0~1 — 같은 글자는 늘 같은 높이
function pitchOf(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const vowel = Math.floor(((code - 0xac00) % 588) / 28); // 0~20 (ㅏ ㅐ ㅑ … ㅣ)
    // 밝은 모음(ㅏ ㅑ ㅗ ㅛ)은 살짝 높게, 어두운 모음(ㅓ ㅜ ㅡ)은 낮게
    const bright = [0.75, 0.7, 0.85, 0.8, 0.35, 0.4, 0.45, 0.5, 0.8, 0.7, 0.65, 0.6, 0.9, 0.3, 0.35, 0.4, 0.45, 0.6, 0.2, 0.3, 0.55];
    return bright[vowel] ?? 0.5;
  }
  return ((code * 2654435761) >>> 0) / 0xffffffff;
}

/**
 * 글자 하나 소리. index는 문장 안 몇 번째 글자인지(따라하기의 오르락내리락용), rise는 문장 끝 "~" 올림.
 */
export function babble(ctx: AudioContext | null, ch: string, mode: BabbleMode, index = 0, rise = false): void {
  if (!ctx || typeof window === "undefined" || !soundOn() || !isVoiced(ch)) return;
  try {
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    const m = MODE[mode];
    const t0 = ctx.currentTime + 0.005;
    // ㅋ/ㅎ 자음만 있는 웃음은 더 짧고 높게 "킥"
    const laugh = /[ㅋㅎ]/.test(ch);
    const len = laugh ? m.len * 0.6 : m.len;
    let f = m.base + (pitchOf(ch) - 0.5) * m.spread;
    if (mode === "mimic") f *= index % 2 === 0 ? 1.06 : 0.94; // 놀리듯 노래하는 말투
    if (laugh) f *= 1.35;
    if (rise) f *= 1.12;
    const f1 = f * (1 + (rise ? 0.35 : m.glide));

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, f1), t0 + len);
    if (m.wobble) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 22;
      lfoGain.gain.value = f * m.wobble;
      lfo.connect(lfoGain).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + len + 0.02);
    }

    // 콧소리 — 한 옥타브 위 사인파를 살짝 섞는다
    const nasal = ctx.createOscillator();
    nasal.type = "sine";
    nasal.frequency.setValueAtTime(f * 2, t0);
    nasal.frequency.exponentialRampToValueAtTime(Math.max(160, f1 * 2), t0 + len);
    const nasalGain = ctx.createGain();
    nasalGain.gain.value = m.nasal;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(VOLUME, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + len);

    // 둥글게 — 고음을 깎는다
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = mode === "mild" ? 2200 : 3200;

    osc.connect(env);
    nasal.connect(nasalGain).connect(env);
    env.connect(lp).connect(ctx.destination);
    osc.start(t0);
    nasal.start(t0);
    osc.stop(t0 + len + 0.02);
    nasal.stop(t0 + len + 0.02);
    osc.onended = () => {
      try {
        lp.disconnect();
      } catch {
        /* 무시 */
      }
    };
  } catch {
    /* 소리는 실패해도 그만 */
  }
}
