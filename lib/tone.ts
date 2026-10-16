// lib/tone.ts
// ============================================================================
// 참견 맛(순한맛/매운맛) — MY에서 한 번 고르면 참견이 대답 전체에 쓰는 값.
// ----------------------------------------------------------------------------
// 지금은 이 기기(localStorage)에만 저장하고, 소라 스테이지 대답이 읽는다.
// 홈 대답·편지·문자까지 넓히려면 서버(user_memory)에 같은 값을 저장해야 한다 — 다음 단계.
// 키 이름은 예전 강 탭에서 쓰던 그대로 둔다(이미 고른 사람 값이 날아가지 않게).
// ============================================================================

export type ChamTone = "mild" | "spicy";

export const TONE_KEY = "chamgyeoni_stage_tone";

export const TONE_OPTIONS: { tone: ChamTone; label: string; desc: string; example: string }[] = [
  { tone: "mild", label: "순한맛", desc: "궁금한 것만 물어봄", example: "헬스 이번 주도 못 갔어? 왜?" },
  { tone: "spicy", label: "매운맛", desc: "놀리고 찌름. 선은 지킴", example: "헬스 회원권 기부했냐 이 바보야ㅋㅋ 이번 주 몇 번 갔는데" },
];

export function readTone(): ChamTone {
  try {
    return localStorage.getItem(TONE_KEY) === "spicy" ? "spicy" : "mild";
  } catch {
    return "mild";
  }
}

export function saveTone(t: ChamTone) {
  try {
    localStorage.setItem(TONE_KEY, t);
  } catch {
    /* 저장 못 해도 이번 화면에선 반영 */
  }
}
