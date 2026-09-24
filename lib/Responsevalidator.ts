// responseEngine.ts에서 옮겨온 rule-based response validation (2026-09 구조 분리).
// 규칙·정규식·패턴 문자열·함수 로직은 원본과 동일하다 — 파일 위치만 바뀌었다.
// 의존 방향: responseTypes ← responseValidator ← responseEngine (이 파일은 responseEngine을 import하지 않는다).
import type {
  ResponseResult,
  ValidationContext,
  ValidationFailureReason,
  ValidationResult,
} from '@/lib/response/responseTypes';

// ---- Validation 내부 유틸 ----

// 완벽한 NLP 문장 분리를 구현하지 않는다 — STEP 6은 "명백한 실패"만 잡는 것이 목적이므로,
// 한국어 문장 종결부호(. ! ? ？ ~) 뒤를 기준으로 한 단순 분리로 충분하다.
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?？~])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function normalizeForMatch(s: string): string {
  return s.trim().replace(/[?？.!~\s]+$/g, '');
}

function normalizeForRepeatCheck(s: string): string {
  return s.replace(/[\s.,!?？~]/g, '');
}

const GENERIC_QUESTION_PATTERNS = [
  '더 이야기해줄래',
  '말해줄래',
  '어떻게 생각해',
  '그래서 어떻게 생각해',
  '왜',
  '왜 그런 거야',
  '무슨 일이야',
  '어때',
  '괜찮아',
  '어떻게 하고 싶어',
  '앞으로 어떻게 할 거야',
  '무슨 생각이 들어',
  '더 자세히 말해줘',
];

// "질문 문장 앞에 현재 상황을 구체적으로 설명하지 않고, generic question만 단독으로 존재하면
// FAIL한다"(스펙 8절) — 즉 응답이 정확히 한 문장이고, 그 문장 자체가 generic 패턴과 완전히
// 일치할 때만 실패시킨다. 앞에 구체적인 문장이 붙어 있으면(=STEP 5의 "빈칸" 구조를 이미 지킨
// 경우) 실패시키지 않는다.
function isGenericQuestion(response: string): boolean {
  const sentences = splitSentences(response);
  if (sentences.length !== 1) return false;
  const normalized = normalizeForMatch(sentences[0]);
  return GENERIC_QUESTION_PATTERNS.some((p) => normalizeForMatch(p) === normalized);
}

const CLOSING_PATTERNS = [
  '힘내',
  '화이팅',
  '응원할게',
  '잘 될 거야',
  '잘할 수 있을 거야',
  '좋은 하루 보내',
  '잘 자',
  '좋겠다',
  '대단하다',
  '멋지다',
  '괜찮아',
  '충분히 잘하고 있어',
  '잘하고 있어',
];

// 응답에 물음표(빈칸)가 하나라도 있으면 애초에 "닫힌" 응답이 아니다. 물음표가 없고, 마지막
// 문장이 closing 패턴과 정확히 일치할 때만 FAIL한다(스펙 9절 — "단어 하나가 포함되었다고
// 실패시키지 않는다").
export function isClosingResponse(response: string): boolean {
  if (/[?？]/.test(response)) return false;
  const sentences = splitSentences(response);
  if (sentences.length === 0) return false;
  const last = normalizeForMatch(sentences[sentences.length - 1]);
  return CLOSING_PATTERNS.some((p) => normalizeForMatch(p) === last);
}

const GENERIC_ENCOURAGEMENT_PATTERNS = [
  '그럴 수 있어',
  '괜찮아',
  '힘내',
  '잘할 수 있을 거야',
  '충분히 잘하고 있어',
  '응원할게',
];

// 응답을 이루는 문장 전부가 generic encouragement 패턴뿐이고, 현재 상황에 대한 구체적인 언급이
// 하나도 없을 때만 FAIL한다. "구체적인 현재 상황 + 반응/관찰 + (필요하면) 빈칸" 구조가 있으면
// 통과한다(스펙 10절).
function isGenericEncouragement(response: string): boolean {
  const sentences = splitSentences(response);
  if (sentences.length === 0) return false;
  return sentences.every((s) => {
    const normalized = normalizeForMatch(s);
    return GENERIC_ENCOURAGEMENT_PATTERNS.some((p) => normalizeForMatch(p) === normalized);
  });
}

// MEMORY_REFERENCE 전략인데 memory_unit_id_used가 없는데도 "전에/예전에/저번에 ~했잖아" 식으로
// 과거 사실을 확정적으로 언급하는, 명백한 경우만 잡는다. 자연어를 완벽하게 판정하려 하지 않는다
// (스펙 17절 — "명백한 경우만 검사한다").
function mentionsPastMemoryLikePhrase(response: string): boolean {
  return /(전에|예전에|저번에).{0,30}(했잖아|말했잖아|그랬잖아)/.test(response);
}

function isRepeatedQuestion(previous: string, current: string): boolean {
  if (!previous || !current) return false;
  return normalizeForRepeatCheck(previous) === normalizeForRepeatCheck(current);
}

// 같은 memory_unit_id를 연속으로 다시 쓰면서, 문장까지 사실상 동일한(한쪽이 다른 쪽을 거의
// 그대로 포함하는) 명백한 반복만 잡는다. 완전히 다른 각도로 다시 꺼낸 경우(예: 새로운 현재
// 상황과 새롭게 연결한 경우)는 이 함수가 true를 반환하지 않는다 — 그건 STEP 5가 이미 권장하는
// "다른 각도" 접근이지 반복이 아니기 때문이다(스펙 16절).
function hasNearIdenticalWording(a: string, b: string): boolean {
  const na = normalizeForRepeatCheck(a);
  const nb = normalizeForRepeatCheck(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= 6 && longer.includes(shorter);
}

// STEP 7 — REPEATED_MEMORY(RULE 13)와 완전히 동일한 조건을 재사용 가능한 함수로 뽑아낸 것이다.
// 새로운 판정 로직이 아니다. validateResponse()의 RULE 13과 generateResponse()의
// repeated_memory_detected 로깅이 이 함수 하나를 공유하므로, 두 곳의 판정이 어긋날 수 없다.
export function computeRepeatedMemoryDetected(
  memoryUnitIdUsed: number | null,
  response: string,
  previousResponse: ValidationContext['previousResponse']
): boolean {
  return (
    previousResponse !== null &&
    memoryUnitIdUsed !== null &&
    previousResponse.memoryUnitIdUsed === memoryUnitIdUsed &&
    hasNearIdenticalWording(previousResponse.response, response)
  );
}

// STEP 6 — rule-based validation 본체. 새 GPT 호출을 전혀 하지 않는다. 이미 만들어진
// ResponseResult(validation 3개 필드 제외)와 이번 턴의 context(후보 memory id 집합, 직전 턴
// 정보)만으로 판정한다. 한 응답에서 여러 규칙이 동시에 위반될 수 있으므로 실패 사유는 배열로
// 전부 모은다(스펙 3절 — "가능하면 모든 failure reason을 수집한다").
export function validateResponse(
  result: Pick<
    ResponseResult,
    | 'response'
    | 'response_strategy'
    | 'question_present'
    | 'memory_unit_id_used'
    | 'memory_relevance'
    | 'conversation_opportunity'
  >,
  context: ValidationContext
): ValidationResult {
  const reasons: ValidationFailureReason[] = [];
  const response = typeof result.response === 'string' ? result.response : '';

  // RULE 1 — EMPTY_RESPONSE
  if (response.trim().length === 0) {
    reasons.push('EMPTY_RESPONSE');
  }

  const sentences = splitSentences(response);
  const questionMarkCount = (response.match(/[?？]/g) ?? []).length;
  const hasQuestionMark = questionMarkCount > 0;

  // RULE 2 — RESPONSE_TOO_LONG
  if (sentences.length >= 6 || response.length > 500) {
    reasons.push('RESPONSE_TOO_LONG');
  }

  // RULE 3 — TOO_MANY_QUESTIONS
  if (questionMarkCount >= 2) {
    reasons.push('TOO_MANY_QUESTIONS');
  }

  // RULE 4 — QUESTION_STRATEGY_WITHOUT_QUESTION
  if (result.response_strategy === 'QUESTION' && result.question_present !== true && !hasQuestionMark) {
    reasons.push('QUESTION_STRATEGY_WITHOUT_QUESTION');
  }

  // RULE 5 — GENERIC_QUESTION
  if (isGenericQuestion(response)) {
    reasons.push('GENERIC_QUESTION');
  }

  // RULE 6 — CLOSING_RESPONSE
  if (isClosingResponse(response)) {
    reasons.push('CLOSING_RESPONSE');
  }

  // RULE 7 — GENERIC_ENCOURAGEMENT
  if (isGenericEncouragement(response)) {
    reasons.push('GENERIC_ENCOURAGEMENT');
  }

  // RULE 8 — MEMORY_RELEVANCE_MISMATCH (스펙 11절의 5개 조건 전부)
  if (result.memory_unit_id_used !== null) {
    const id = result.memory_unit_id_used;
    const relevanceYes = result.memory_relevance.some((r) => r.memory_unit_id === id && r.relevance === 'YES');
    const validId = context.validMemoryUnitIds.has(id);
    const oppMatches =
      result.conversation_opportunity.source === 'memory' &&
      result.conversation_opportunity.strength === 'STRONG' &&
      result.conversation_opportunity.memory_unit_id === id;
    if (!validId || !relevanceYes || !oppMatches) {
      reasons.push('MEMORY_RELEVANCE_MISMATCH');
    }
  }

  // RULE 9 — OPPORTUNITY_MEMORY_MISMATCH (스펙 12절 Case A~D)
  if (result.memory_unit_id_used !== null) {
    const opp = result.conversation_opportunity;
    if (
      opp.type === 'none' || // Case A
      opp.strength === 'WEAK' || // Case B
      opp.strength === 'NONE' ||
      opp.source === 'current_turn' || // Case C
      opp.source === 'none' // Case D
    ) {
      reasons.push('OPPORTUNITY_MEMORY_MISMATCH');
    }
  }

  // RULE 10 — CURRENT_TURN_MEMORY_MISMATCH (스펙 13절)
  if (result.memory_unit_id_used !== null && result.conversation_opportunity.source === 'current_turn') {
    reasons.push('CURRENT_TURN_MEMORY_MISMATCH');
  }

  // RULE 11 — INVALID_MEMORY_REFERENCE (스펙 14절 — string으로 온 id를 number로 자동 변환해서
  // 통과시키지 않는다. typeof 체크 자체가 그 방어다.)
  if (result.memory_unit_id_used !== null) {
    if (
      typeof result.memory_unit_id_used !== 'number' ||
      !context.validMemoryUnitIds.has(result.memory_unit_id_used)
    ) {
      reasons.push('INVALID_MEMORY_REFERENCE');
    }
  }

  // RULE 12 — REPEATED_QUESTION (스펙 15절)
  if (context.previousResponse && isRepeatedQuestion(context.previousResponse.response, response)) {
    reasons.push('REPEATED_QUESTION');
  }

  // RULE 13 — REPEATED_MEMORY (스펙 16절 — 같은 memory_unit_id + 명백히 동일한 문장일 때만)
  // STEP 7에서 computeRepeatedMemoryDetected()로 뽑아낸 것과 동일한 조건이다.
  if (computeRepeatedMemoryDetected(result.memory_unit_id_used, response, context.previousResponse)) {
    reasons.push('REPEATED_MEMORY');
  }

  // RULE 14 — STRATEGY_OUTPUT_MISMATCH (스펙 17절 — MEMORY_REFERENCE의 명백한 불일치만 검사한다.
  // QUESTION 불일치는 이미 RULE 4가 QUESTION_STRATEGY_WITHOUT_QUESTION으로 잡는다.)
  if (
    result.response_strategy === 'MEMORY_REFERENCE' &&
    result.memory_unit_id_used === null &&
    mentionsPastMemoryLikePhrase(response)
  ) {
    reasons.push('STRATEGY_OUTPUT_MISMATCH');
  }

  return { passed: reasons.length === 0, reasons };
}
