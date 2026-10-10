
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
// P0 — 기억과 현재 발화의 관계. "관련 있음(relevance)"과 "지금 꺼낼 가치"를 분리하기 위한 라벨.
//   same_problem           같은 문제/고민이 다시 나옴
//   past_want_relevant_now 과거에 원했던 것이 지금 상황과 직접 이어짐
//   past_plan_relevant_now 과거에 하려던 계획이 지금 상황과 직접 이어짐
//   contradiction          과거와 지금이 흥미롭게 다름
//   continuation           과거 관심·행동이 이어지거나 커졌음
//   same_topic_only        주제만 같고 지금 꺼낼 이유는 약함 (관련은 있지만 꺼내지 않는 게 기본)
//   no_relation            관련 없음 (relevance=NO)
export type MemoryRelation =
  | 'same_problem'
  | 'past_want_relevant_now'
  | 'past_plan_relevant_now'
  | 'contradiction'
  | 'continuation'
  | 'same_topic_only'
  | 'no_relation';

export const MEMORY_RELATIONS: readonly MemoryRelation[] = [
  'same_problem',
  'past_want_relevant_now',
  'past_plan_relevant_now',
  'contradiction',
  'continuation',
  'same_topic_only',
  'no_relation',
];

// 실제 응답에 기억을 꺼내 써도 되는 관계. same_topic_only / no_relation은 여기 없다
// (RETRIEVAL RELEVANCE ≠ INTERVENTION WORTHINESS — responsevalidator.ts RULE 8에서 강제).
export const WORTHY_MEMORY_RELATIONS: ReadonlySet<MemoryRelation> = new Set<MemoryRelation>([
  'same_problem',
  'past_want_relevant_now',
  'past_plan_relevant_now',
  'contradiction',
  'continuation',
]);

export interface MemoryRelevanceItem {
  memory_unit_id: number;
  relevance: 'YES' | 'NO';
  // P0 — buildGeneratedResult가 항상 채운다. 예전 기록/테스트 객체와의 호환을 위해 optional.
  relation?: MemoryRelation;
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
  // Opportunity STEP 1 (2026-09) — "무엇을 붙잡았는가"를 관찰 가능하게 만드는 필드들.
  // source/type/strength는 "어떤 종류의 기회인가"라는 분류일 뿐이고, 실제로 사용자 발화의 어느
  // 부분을 붙잡았는지는 아래 3개 필드에 남는다. 전부 같은 generation GPT 호출에서 생성된다.
  // source='none'이면 셋 다 null (코드 레벨에서 강제 — responseUtils.buildGeneratedResult 참고).
  // 이 필드들이 추가되기 전에 저장된 voice_entries.response에는 이 키들이 아예 없다 — 읽는 쪽은
  // 항상 없을 수 있다고 가정해야 한다.
  anchor_quote: string | null; // 이번 발화 원문에서 그대로 복사한 붙잡은 구간
  anchor_fact: string | null; // 그 구간이 말하는 사실 한 문장 (원문의 사실관계 보존)
  question_target: string | null; // 그 anchor에서 참견이가 궁금한 것 한 가지 (짧은 명사구)
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
  | 'STRATEGY_OUTPUT_MISMATCH'
  // 1차 수정 (2026-09)
  | 'QUESTION_NOT_ANSWERED' // 사용자가 질문/부탁했는데 답/확인 없이 되묻기만 함
  | 'NEGATIVE_STANCE_AS_INTEREST' // 사용자가 싫다고 한 대상을 원하는 것처럼 물음
  | 'ANCHOR_NOT_IN_TRANSCRIPT' // anchor_quote가 사용자 원문에 없음
  | 'SPECIFIC_CURRENT_TURN_WITHOUT_OPPORTUNITY' // 구체적 디테일이 있는 발화인데 opportunity를 none으로 냄
  | 'ANCHOR_TRUNCATED_HEAD' // 숫자로 시작하는 anchor가 앞 대상(을/를)을 잘랐고 response에서도 그 대상이 사라짐
  // 2026-10-11 — 기억 선택 실패 (SOFT: 재생성 1회는 유도하지만, 재생성 후에도 남아 있으면 fallback으로 떨어뜨리지 않는다)
  | 'MEMORY_RELEVANCE_SKIPPED' // 기억 후보가 있는데 memory_relevance를 아예 비워서 냄(판단 자체를 건너뜀)
  | 'SELECTED_MEMORY_NOT_USED' // opportunity로 기억을 골라놓고(source=memory, STRONG) 정작 response에는 안 씀
  | 'FEELING_TARGET_OVER_MEMORY'; // 꺼낼 가치가 있는 기억(worthy relation)이 있는데 말하지 않은 기분/생각을 묻는 쪽을 고름

// 2026-10-11 — SOFT 사유. 재생성 1회의 계기는 되지만, 재생성 결과에 이 사유만 남았다면 그 결과를 그대로 내보낸다
// (fallback 템플릿보다 GPT 문장이 낫다). 첫 생성이 이 사유만으로 실패했는데 재생성이 다른(HARD) 이유로 망가지면
// 첫 생성 결과를 쓴다. 기존 HARD 규칙(질문 개수·질문 무시·부정 뒤집기 등)의 동작은 바뀌지 않는다.
export const SOFT_VALIDATION_REASONS: ReadonlySet<ValidationFailureReason> = new Set<ValidationFailureReason>([
  'MEMORY_RELEVANCE_SKIPPED',
  'SELECTED_MEMORY_NOT_USED',
  'FEELING_TARGET_OVER_MEMORY',
]);

export interface ValidationResult {
  passed: boolean;
  reasons: ValidationFailureReason[];
}

// REPEATED_QUESTION/REPEATED_MEMORY 판정에 쓰는 "가장 최근 턴" 정보. 없으면(첫 발화 등) null.
export interface ValidationContext {
  validMemoryUnitIds: Set<number>;
  previousResponse: { response: string; memoryUnitIdUsed: number | null } | null;
  // 1차 수정 — 아래 값이 없으면(예전 스크립트 등) 해당 규칙은 검사하지 않는다.
  transcript?: string;
  utteranceIntent?: string | null;
  userQuestion?: string | null;
  negativeTargets?: string[];
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
  // 1차 수정 — 모델 자기 보고: 사용자의 질문/부탁에 실제로 답(또는 reminder 확인)했는가.
  // validator가 결정적 검사(질문만으로 된 응답인지)와 함께 쓴다. 예전 행에는 없다.
  answered_user_question?: boolean;
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
  // 1차 수정 — 로깅용. 예전 행에는 없다.
  //   utterance_intent: analysis가 판단한 발화 의도 (lib/response/understanding.ts)
  //   repaired: LLM이 쓴 응답에서 형식 문제만 코드로 고쳐(초과 질문 문장 제거, 원문에 없는 anchor 폐기)
  //             validator를 다시 통과시킨 경우 true. 문장 자체는 LLM이 쓴 것이므로 fallback_used는 false다.
  //   fallback_kind: fallback_used=true일 때 어떤 방식이었는지
  //     'intent_template' — 발화 의도/질문 원문/입장/anchor 기반 안전 문장 (키워드 하드코딩 아님)
  //     'stt_failed'      — 음성 인식 실패 안내 (GPT 호출 없음)
  //     'error'           — 생성 자체 실패(네트워크/파싱)
  //   anchor_discarded: anchor_quote가 원문에 없어서 폐기(null 처리)했는가
  utterance_intent?: string | null;
  repaired?: boolean;
  fallback_kind?: 'intent_template' | 'stt_failed' | 'error' | null;
  anchor_discarded?: boolean;
  // 2026-09-29 — 관찰용 기록만. repair(keepOneQuestion)가 실제로 실행될 때마다 그 입력/출력을 남긴다.
  // 동작에는 영향이 없다(값을 읽는 곳 없음). 예전 행에는 없다.
  repair_log?: RepairLogEntry[];
  // 2026-09-30 — 관찰용 기록만. 첫 생성(GPT 원본 → buildGeneratedResult 이후 → 첫 검증)을 비교하기 위해 남긴다.
  // 동작에는 영향이 없다(값을 읽는 곳 없음). validation_failure_reason의 의미는 그대로다. 예전 행에는 없다.
  initial_trace?: InitialGenerationTrace;
}

// 첫 생성 1회분 관찰 기록. raw는 GPT가 낸 값을 가공 없이 그대로(타입이 틀려도 그대로) 담는다.
export interface InitialGenerationTrace {
  generation: 'initial';
  raw: {
    opportunity: {
      source: unknown;
      type: unknown;
      strength: unknown;
      memory_unit_id: unknown;
      anchor: unknown;
      fact: unknown;
      target: unknown;
    } | null; // conversation_opportunity 자체가 없거나 객체가 아니면 null
    memory_used: unknown;
    memory_relevance: unknown;
    response: unknown;
  };
  normalized: {
    opportunity: {
      source: string;
      type: string;
      strength: string;
      memory_unit_id: number | null;
      anchor: string | null;
      fact: string | null;
      target: string | null;
    };
    response: string;
  };
  validation: {
    passed: boolean;
    failure_reason: string | null; // 첫 검증 사유 원본 (나중 단계에서 덮어써지지 않음)
  };
}

// tryRepair()가 keepOneQuestion을 실제로 실행한 1회분 기록 (관찰용, 동작 영향 없음).
export interface RepairLogEntry {
  repair_stage: 'initial' | 'regeneration' | 'rule19_regeneration';
  repair_reason: string; // 이 repair를 일으킨 검증 실패 사유 (예: "TOO_MANY_QUESTIONS")
  repair_input_response: string; // repair 전 LLM 원문
  repair_question_target: string | null;
  repair_anchor_quote: string | null;
  repair_output_response: string; // keepOneQuestion 결과
  repair_applied: boolean; // 수정본이 validator를 통과해 실제로 쓰였는가 (false면 버려짐)
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
