
export async function shouldIntervene(
  userId: string,
  situation: { utterance?: string; triggeredBy: 'live_turn' | 'proactive_cron' },
  candidates: RetrievedMemory[]
): Promise<{ decision: 'intervene' | 'hold'; chosenMemoryId: number | null; reason: string }> {
  if (candidates.length === 0) return { decision: 'hold', chosenMemoryId: null, reason: 'no_candidates' };

  // 가드레일 먼저 (LLM 호출 전에 값싸게 걸러냄):
  // - 같은 memory_unit을 최근 N시간 안에 이미 참견에 썼으면 제외
  // - proactive_cron이면 하루 참견 총량 상한 체크 (사용자 피로도 방지)

  // 남은 후보만 LLM에 넘겨서 "지금 꺼내면 자연스러운가"를 판단.
  // live_turn(사용자가 방금 말함)이면 문맥 연결이 판단 기준.
  // proactive_cron(예: "일주일 전 아팠던 게 얼마나 됐는지 궁금해할 시점")이면
  // expected_relevance_until이 지금 시점에 가까운지가 판단 기준.

  // 결과를 intervention_log에 반드시 기록 (decision='hold'도 기록 — 나중에 "왜 참견 안 했는지" 추적 가능해짐)
}
