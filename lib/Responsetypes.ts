// responseEngine.ts에서 옮겨온 response generation 타입 모음 (2026-09 구조 분리).
// 내용은 원본과 동일하다 — 파일 위치만 바뀌었다. 외부 코드는 계속 '@/lib/responseEngine'에서
// import해도 되도록 responseEngine.ts가 이 타입들을 그대로 다시 export한다.

export type Strategy =
  | 'CASUAL' | 'EMPATHY' | 'PLAYFUL' | 'TEASING' | 'MEMORY_REFERENCE'
  | 'CONTRADICTION' | 'QUESTION' | 'ENCOURAGEMENT' | 'INTERVENTION' | 'SILENT'
  | 'UNEXPECTED_INTERJECTION';

// WHY: 지금 왜 이 반응/참견을 하는가. HOW(response_strategy)와 독립적으로 판단한다.
export type InterferencePurpose =
  | 'listen' | 'comfort' | 'notice' | 'tease' | 'challenge'
  | 'validate' | 'expose_desire' | 'push' | 'confront' | 'silence';

// STEP 3 — Memory Relevance. "이 memory 후보가 오늘 발화/최근 대화와 의미적으로 연결되는가"
// 만을 나타내는 값이다. YES는 "사용 가능한 후보"라는 뜻일 뿐, "이번 응답에 반드시 언급해야 한다"는
// 뜻이 아니다(그 판단은 Opportunity — STEP 4 — 의 몫이며 이번 단계에서는 구현하지 않는다).
export interface MemoryRelevanceItem {
  memory_unit_id: number;
  relevance: 'YES' | 'NO';
}

// STEP 4 — Conversation Opportunity. Relevance가 "연결 여부"라면, Opportunity는 "개입할 타이밍의 가치"다.
// Relevance=YES인 memory라고 해서 자동으로 Opportunity가 생기는 건 아니다 (예: 단어는 겹치지만 오늘
// 얘기의 핵심이 아닌 경우). source='current_turn'은 memory 없이도(또는 관련 memory가 전부 NO여도)
// 오늘 발화 자체에서 생기는 대화 기회(주로 reactable_point/unspoken_part)를 표현하기 위한 값이다.
export type ConversationOpportunitySource = 'memory' | 'current_turn' | 'none';

export type ConversationOpportunityType =
  | 'unspoken_part'
  | 'contradiction'
  | 'unexpected_link'
  | 'past_present_link'
  | 'reactable_point'
  | 'self_correction'
  | 'third_party_view'
  | 'none';

export type ConversationOpportunityStrength = 'NONE' | 'WEAK' | 'STRONG';

export interface ConversationOpportunity {
  source: ConversationOpportunitySource;
  type: ConversationOpportunityType;
  strength: ConversationOpportunityStrength;
  // source='memory'일 때만 채워진다. source가 'current_turn'|'none'이면 반드시 null
  // (코드 레벨에서 강제 — 아래 파싱/검증 로직 참고).
  memory_unit_id: number | null;
}

// STEP 6 — Rule-Based Response Validation. Generation 결과(ResponseResult)가 참견이의 최소 응답
// 품질 조건을 만족하는지 코드 레벨에서 검사하기 위한 타입들이다. Validation은 100% rule-based이며,
// 이 판정을 위해 별도의 LLM validator 호출을 절대 추가하지 않는다.
export type ValidationFailureReason =
  | 'EMPTY_RESPONSE'
  | 'RESPONSE_TOO_LONG'
  | 'TOO_MANY_QUESTIONS'
  | 'QUESTION_STRATEGY_WITHOUT_QUESTION'
  | 'GENERIC_QUESTION'
  | 'CLOSING_RESPONSE'
  | 'GENERIC_ENCOURAGEMENT'
  | 'REPEATED_QUESTION'
  | 'REPEATED_MEMORY'
  | 'MEMORY_RELEVANCE_MISMATCH'
  | 'OPPORTUNITY_MEMORY_MISMATCH'
  | 'INVALID_MEMORY_REFERENCE'
  | 'CURRENT_TURN_MEMORY_MISMATCH'
  | 'STRATEGY_OUTPUT_MISMATCH';

export interface ValidationResult {
  passed: boolean;
  reasons: ValidationFailureReason[];
}

// REPEATED_QUESTION/REPEATED_MEMORY 판정에 쓰는 "가장 최근 턴" 정보. 없으면(첫 발화 등) null.
export interface ValidationContext {
  validMemoryUnitIds: Set<number>;
  previousResponse: { response: string; memoryUnitIdUsed: number | null } | null;
}

export interface ResponseResult {
  response_strategy: Strategy;
  interference_purpose: InterferencePurpose;
  tone: string;
  humor_opportunity: 'low' | 'medium' | 'high';
  memory_used: boolean;
  memory_reference: string | null;
  memory_unit_id_used: number | null;
  insight_id_used: number | null;
  // STEP 3 — 이번 턴에서 검토된 memory 후보들 각각에 대한 Relevance 판단 결과.
  // 후보가 하나도 없었으면 빈 배열. 이 필드는 순수 로깅/디버깅용이며 memory_unit_id_used 검증에도 쓰인다.
  memory_relevance: MemoryRelevanceItem[];
  // STEP 4 — 이번 턴에 실제로 존재했던 대화 기회(있다면 memory 근거, 없다면 오늘 발화 자체 근거,
  // 그마저도 없으면 source: 'none'). 순수 로깅/디버깅용이며 memory_unit_id_used 검증에도 쓰인다.
  conversation_opportunity: ConversationOpportunity;
  // STEP 5 — 이번 응답(response) 문장 자체에 실제로 질문이 남아 있는지. "사용자가 한마디 더
  // 하고 싶어지게 만드는 응답"인지를 코드에서도 대략 점검할 수 있게 하는 순수 로깅/디버깅용 필드다.
  question_present: boolean;
  channel: 'text' | 'voice' | 'call';
  response: string;
  relationship_level: number;
  // STEP 6 — rule-based validation 결과. validation_passed=true면 규칙을 전부 통과한 응답이고,
  // false면(반드시 regeneration을 1회 시도한 뒤에도 실패해 deterministic fallback으로 대체된
  // 경우에만 false다) validation_failure_reason에 실패 사유가 남는다.
  validation_passed: boolean;
  validation_failure_reason: string | null;
  // 0이면 1차 generation이 그대로 통과, 1이면 regeneration 1회 후 통과했거나(또는 fallback으로
  // 대체됐거나) 한 경우다. 정확히 0 또는 1만 가능하며 절대 2 이상이 되지 않는다.
  regeneration_count: number;
  // STEP 7 — Response Decision Logging. 새로운 판정 알고리즘을 추가하지 않는다 — 전부 STEP 6에
  // 이미 존재하는 rule-based 함수(isClosingResponse/hasNearIdenticalWording 기반)의 결과를 최종
  // 반환값 기준으로 다시 읽어서 기록하는 것뿐이다.
  //
  // closes_conversation: 실제로 화면에 나가는 response 문장이 isClosingResponse() 기준으로
  // "대화를 닫는" 문장인지. validation_passed 여부와 무관하게, 최종적으로 반환되는 응답 기준으로
  // 계산한다.
  closes_conversation: boolean;
  // repeated_memory_detected: STEP 6 RULE 13(REPEATED_MEMORY)과 완전히 동일한 조건 — 직전 턴과
  // 같은 memory_unit_id를 다시 쓰면서 문장까지 사실상 동일한, 명백한 반복인 경우만 true다.
  // memory_unit_id_used가 null인 경로(fallback 등)에서는 항상 false다.
  repeated_memory_detected: boolean;
  // fallback_used: deterministic fallback(buildDeterministicFallback) 경로 또는 catch 블록(생성
  // 자체 실패) 경로로 반환된 경우에만 true다. 1차 generation 성공/regeneration 성공 경로는 항상
  // false다. validation_passed와는 독립적인 필드다 — validation_passed는 "LLM이 생성한 응답이
  // validation을 통과했는가"를 뜻하고, fallback_used는 "실제 화면에 나간 문장이 fallback 문장인가"를
  // 뜻한다. 즉 fallback_used=true인 경로는 항상 validation_passed=false이지만, 그 반대(
  // validation_passed=false인데 fallback_used=false)는 존재하지 않는다 — STEP 6 구조상 validation이
  // 최종적으로 실패하면 반드시 fallback 또는 catch 경로로 빠지기 때문이다.
  fallback_used: boolean;
}

// fetchRecentTurns()가 반환하는 최근 대화 한 턴 (responseEngine.ts에서 이동).
export interface RecentTurn {
  transcript: string;
  response: string;
  minutesAgo: number;
  // STEP 2(Memory Retrieval) 이후 단계에서 "최근에 어떤 memory/insight를 썼는지" 참고용으로 쓸 수 있도록
  // voice_entries.response(jsonb)에 이미 저장돼 있는 값을 그대로 꺼내둔다. 이번 STEP 1에서는 이 값을
  // 프롬프트에 직접 쓰지 않는다(반복 방지 로직 자체는 memory_units.reference_count/last_referenced_at
  // 기반으로 STEP 2/6에서 별도 구현) — 여기서는 구조만 만들어 둔다.
  strategy: string | null;
  memoryUnitIdUsed: number | null;
  insightIdUsed: number | null;
}
