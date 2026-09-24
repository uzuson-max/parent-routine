// responseEngine.ts에서 옮겨온 rule-based response validation (2026-09 구조 분리).
// 규칙·정규식·패턴 문자열·함수 로직은 원본과 동일하다 — 파일 위치만 바뀌었다.
// 의존 방향: responseTypes ← responseValidator ← responseEngine (이 파일은 responseEngine을 import하지 않는다).
import type {
  ResponseResult,
  ValidationContext,
  ValidationFailureReason,
  ValidationResult,
} from '@/lib/response/responsetypes';

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

// ==================================================
// STEP 5-1 (초안) — Answerability: "사용자가 무엇에 답해야 하는지 모르는 질문" 탐지
// ==================================================
// ⚠️ 아직 validateResponse()에서 호출하지 않는다. scripts/eval-answerability.ts의 평가 세트로
// 오탐(false positive)이 0인지 확인하면서 다듬은 뒤에, 별도 단계에서 연결 여부를 결정한다.
//
// 설계 원칙 — "명백한 경우만" 잡는 보수적인 detector:
// - 문장 길이, 지시어 존재, "어때" 포함, 물음표 유무만으로는 절대 실패시키지 않는다.
// - 질문 문장이 (연결어·지시어를 걷어내면) "평가형 서술어"나 "꼬리 주제어"만 남는 경우,
//   또는 "궁금하다" 앞에 궁금한 대상이 없는 경우만 본다.
// - 그마저도 같은 문장의 앞 절이나 바로 앞 문장이 대상을 제공하면 통과시킨다
//   (예: "예전에 아메리카노 매일 마신다고 했잖아. 요즘도 그래?"). 앞 내용이 "~것 같던데" 같은
//   추측이면 대상을 제공한 것으로 보지 않는다 (가리키는 것이 사용자의 말이 아니라 모델의 추측이므로).

export type UnanswerablePattern =
  | 'PRONOUN_EVALUATIVE' // "그거 어때?", "그건 어떤 것 같아?", "그거 아직도 그래?"
  | 'BARE_TOPIC_TAIL' // "그래서 요즘은?", "그건?"
  | 'EMPTY_CURIOSITY'; // "그게 궁금한데?", "좀 궁금하네.", "회사 얘기 들으니까 좀 궁금한데?"

export interface UnanswerableDetection {
  pattern: UnanswerablePattern;
  sentence: string;
}

const ANSWERABILITY_LEADING_CONNECTORS = ['그래서', '근데', '그럼', '그러면', '아무튼', '암튼', '그리고', '그래도'];
const ANSWERABILITY_DEMONSTRATIVES = [
  '그런 건', '그런 거', '그런 게', '그런건', '그런거', '그런게',
  '그거', '그건', '그게', '그것', '이거', '이건', '이게', '저거', '저건',
];
const ANSWERABILITY_EVALUATIVE_PREDICATES = [
  '어때', '어떤 것 같아', '어떤 거 같아', '어떻게 생각해', '어떤 느낌이야',
  '아직도 그래', '요즘도 그래', '여전히 그래', '지금도 그래',
];
const ANSWERABILITY_BARE_TOPICS = ['그건', '그거는', '그게', '이건', '요즘은', '지금은', '그다음은', '그 다음은', '너는', '넌', '그런 건'];
const ANSWERABILITY_FILLERS = ['좀', '조금', '되게', '진짜', '그냥', '뭔가', '괜히', '살짝', '약간'];
// 앞 내용이 이렇게 끝나면 "대상을 제공했다"고 보지 않는다 — 사용자의 말이 아니라 사용자에 대한 모델의
// 추측/관찰("~것 같던데", "~보니까")이기 때문. "~것 같은데"(모델이 주제에 대한 자기 의견을 말한 뒤 묻는 경우,
// 예: "영향이 클 것 같은데, 어떻게 생각해?")는 질문 대상이 문장에 드러나 있으므로 여기에 넣지 않는다
// (실제 운영 응답에서 오탐으로 확인됨).
const ANSWERABILITY_SPECULATIVE_ENDING = /(것 같던데|거 같던데|던데|보니까|보니)$/;
// "궁금하다" 앞이 이렇게 끝나면 그건 궁금한 "대상"이 아니라 "계기"다 (예: "회사 얘기 들으니까 좀 궁금한데").
const ANSWERABILITY_REASON_ENDING = /(니까|는데|던데|보니|어서|아서|해서|길래)$/;
const ANSWERABILITY_CURIOUS_TAIL = /^(.*?)\s*궁금(한데|하네|해|하다|했어|해져|하긴 해|하긴 하네)?$/;

function normalizeAnswerabilityClause(s: string): string {
  return s
    .replace(/[ㅋㅎㅠㅜ]+/g, ' ')
    .replace(/[?？.!~…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingConnectors(s: string): string {
  let out = s;
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of ANSWERABILITY_LEADING_CONNECTORS) {
      if (out === c) return '';
      if (out.startsWith(c + ' ')) {
        out = out.slice(c.length + 1).trim();
        changed = true;
      }
    }
  }
  return out;
}

function stripLeadingDemonstrative(s: string): { rest: string; hadDemonstrative: boolean } {
  for (const d of ANSWERABILITY_DEMONSTRATIVES) {
    if (s === d) return { rest: '', hadDemonstrative: true };
    if (s.startsWith(d + ' ')) return { rest: s.slice(d.length + 1).trim(), hadDemonstrative: true };
  }
  return { rest: s, hadDemonstrative: false };
}

function stripTrailingFillers(s: string): string {
  let out = s;
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of ANSWERABILITY_FILLERS) {
      if (out === f) return '';
      if (out.endsWith(' ' + f)) {
        out = out.slice(0, out.length - f.length - 1).trim();
        changed = true;
      }
    }
  }
  return out;
}

// 앞 내용(같은 문장의 앞 절 → 없으면 바로 앞 문장)이 질문의 대상을 제공하는가.
function hasGroundedAntecedent(beforeInSentence: string, previousSentence: string | null): boolean {
  const antecedent = normalizeAnswerabilityClause(beforeInSentence) || normalizeAnswerabilityClause(previousSentence ?? '');
  if (!antecedent) return false;
  return !ANSWERABILITY_SPECULATIVE_ENDING.test(antecedent);
}

export function detectUnanswerableQuestion(response: string): UnanswerableDetection | null {
  if (typeof response !== 'string') return null;
  const sentences = splitSentences(response);

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const isQuestion = /[?？]/.test(sentence);
    const clauses = sentence.split(/[,，]/);
    const lastClauseRaw = clauses[clauses.length - 1];
    const beforeInSentence = clauses.slice(0, -1).join(',');
    const previousSentence = i > 0 ? sentences[i - 1] : null;
    const clause = stripLeadingConnectors(normalizeAnswerabilityClause(lastClauseRaw));

    // 패턴 3 — "궁금하다"로 끝나는데 궁금한 대상이 없다 (물음표 유무와 무관).
    const curious = clause.match(ANSWERABILITY_CURIOUS_TAIL);
    if (curious) {
      const head = stripTrailingFillers(curious[1].trim());
      const { rest, hadDemonstrative } = stripLeadingDemonstrative(head);
      if (head && ANSWERABILITY_REASON_ENDING.test(head)) {
        return { pattern: 'EMPTY_CURIOSITY', sentence };
      }
      if ((head === '' || (hadDemonstrative && rest === '')) && !hasGroundedAntecedent(beforeInSentence, previousSentence)) {
        return { pattern: 'EMPTY_CURIOSITY', sentence };
      }
      continue;
    }

    // 패턴 1·2는 물음표가 있는 질문 문장만 본다 (질문이 없는 반응형 응답은 판정 대상이 아니다).
    if (!isQuestion) continue;

    // 패턴 1 — (지시어) + 평가형 서술어만 남는 질문.
    const { rest } = stripLeadingDemonstrative(clause);
    if (ANSWERABILITY_EVALUATIVE_PREDICATES.includes(rest) && !hasGroundedAntecedent(beforeInSentence, previousSentence)) {
      return { pattern: 'PRONOUN_EVALUATIVE', sentence };
    }

    // 패턴 2 — 주제어(은/는)만 남고 무엇을 묻는지 생략된 꼬리 질문.
    if (ANSWERABILITY_BARE_TOPICS.includes(clause) && !hasGroundedAntecedent(beforeInSentence, previousSentence)) {
      return { pattern: 'BARE_TOPIC_TAIL', sentence };
    }
  }
  return null;
}

export function isQuestionNotAnswerable(response: string): boolean {
  return detectUnanswerableQuestion(response) !== null;
}
