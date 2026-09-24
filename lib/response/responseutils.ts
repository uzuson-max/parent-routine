// responseEngine.ts에서 옮겨온 LLM 응답(JSON) 정리/방어 로직 (2026-09 구조 분리).
// 함수 본문·판정 조건·기본값은 원본과 동일하다 — 파일 위치만 바뀌었다.
// 의존 방향: responseTypes ← responseUtils ← responseEngine (이 파일은 responseEngine을 import하지 않는다).
import type { RelevantMemoryUnit } from '@/lib/memoryRetrieval';
import type { RelevantInsight } from '@/lib/insightEngine';
import type {
  ConversationOpportunity,
  ConversationOpportunitySource,
  ConversationOpportunityStrength,
  ConversationOpportunityType,
  MemoryRelevanceItem,
  ResponseResult,
} from '@/lib/response/responseTypes';

// GPT가 반환한 원시 JSON(parsed)을 STEP 3~5에서 이미 만든 방어 로직 그대로 통과시켜, validation
// 이전 단계의 ResponseResult(=STEP 6의 3개 validation 필드만 제외)를 만든다. STEP 6 이전 로직과
// 판정 기준을 하나도 바꾸지 않았다 — 인라인으로 있던 코드를 재사용 가능한 함수로 옮겼을 뿐이다
// (1차 generation과 regeneration 양쪽에서 동일하게 호출한다).
export function buildGeneratedResult(
  parsed: any,
  callAllowed: boolean,
  relevantMemoryUnits: RelevantMemoryUnit[],
  relevantInsights: RelevantInsight[],
  relationshipLevel: number,
  validMemoryUnitIds: Set<number>,
  validInsightIds: Set<number>
): Omit<
  ResponseResult,
  'validation_passed' | 'validation_failure_reason' | 'regeneration_count' | 'closes_conversation' | 'repeated_memory_detected' | 'fallback_used'
> {
  const channel: 'text' | 'call' = parsed.channel === 'call' && callAllowed ? 'call' : 'text';

  const rawMemoryRelevance = Array.isArray(parsed.memory_relevance) ? parsed.memory_relevance : [];
  const memoryRelevance: MemoryRelevanceItem[] = rawMemoryRelevance
    .filter(
      (item: any) =>
        item &&
        typeof item.memory_unit_id === 'number' &&
        validMemoryUnitIds.has(item.memory_unit_id) &&
        (item.relevance === 'YES' || item.relevance === 'NO')
    )
    .map((item: any) => ({ memory_unit_id: item.memory_unit_id, relevance: item.relevance }));

  const relevantYesIds = new Set(
    memoryRelevance.filter((r) => r.relevance === 'YES').map((r) => r.memory_unit_id)
  );

  const rawOpportunity =
    parsed.conversation_opportunity && typeof parsed.conversation_opportunity === 'object'
      ? parsed.conversation_opportunity
      : {};

  let opportunitySource: ConversationOpportunitySource =
    rawOpportunity.source === 'memory' ||
    rawOpportunity.source === 'current_turn' ||
    rawOpportunity.source === 'none'
      ? rawOpportunity.source
      : 'none';

  const VALID_OPPORTUNITY_TYPES = new Set([
    'unspoken_part',
    'contradiction',
    'unexpected_link',
    'past_present_link',
    'reactable_point',
    'self_correction',
    'third_party_view',
    'none',
  ]);
  let opportunityType: ConversationOpportunityType =
    typeof rawOpportunity.type === 'string' && VALID_OPPORTUNITY_TYPES.has(rawOpportunity.type)
      ? (rawOpportunity.type as ConversationOpportunityType)
      : 'none';

  let opportunityStrength: ConversationOpportunityStrength =
    rawOpportunity.strength === 'NONE' ||
    rawOpportunity.strength === 'WEAK' ||
    rawOpportunity.strength === 'STRONG'
      ? rawOpportunity.strength
      : 'NONE';

  let opportunityMemoryUnitId: number | null =
    typeof rawOpportunity.memory_unit_id === 'number' ? rawOpportunity.memory_unit_id : null;

  if (opportunityType === 'none') {
    opportunityStrength = 'NONE';
  }

  if (
    opportunitySource === 'memory' &&
    (opportunityMemoryUnitId === null || !relevantYesIds.has(opportunityMemoryUnitId))
  ) {
    opportunitySource = 'none';
    opportunityType = 'none';
    opportunityStrength = 'NONE';
    opportunityMemoryUnitId = null;
  }

  if (opportunitySource !== 'memory') {
    opportunityMemoryUnitId = null;
  }

  const conversationOpportunity: ConversationOpportunity = {
    source: opportunitySource,
    type: opportunityType,
    strength: opportunityStrength,
    memory_unit_id: opportunityMemoryUnitId,
  };

  const rawMemoryUnitIdUsed = parsed.memory_unit_id_used;
  const memoryUnitIdUsed =
    typeof rawMemoryUnitIdUsed === 'number' &&
    validMemoryUnitIds.has(rawMemoryUnitIdUsed) &&
    relevantYesIds.has(rawMemoryUnitIdUsed) &&
    conversationOpportunity.source === 'memory' &&
    conversationOpportunity.strength === 'STRONG' &&
    conversationOpportunity.memory_unit_id === rawMemoryUnitIdUsed
      ? rawMemoryUnitIdUsed
      : null;

  const rawInsightIdUsed = parsed.insight_id_used;
  const candidateInsightIdUsed =
    typeof rawInsightIdUsed === 'number' && validInsightIds.has(rawInsightIdUsed) ? rawInsightIdUsed : null;
  const insightIdUsed = memoryUnitIdUsed !== null ? null : candidateInsightIdUsed;

  const responseText: string = parsed.response ?? '음, 그렇구나.';
  const questionPresent: boolean =
    typeof parsed.question_present === 'boolean' ? parsed.question_present : /[?？]/.test(responseText);

  return {
    response_strategy: parsed.response_strategy ?? 'CASUAL',
    interference_purpose: parsed.interference_purpose ?? 'listen',
    tone: parsed.tone ?? 'neutral',
    humor_opportunity: parsed.humor_opportunity ?? 'low',
    memory_used: parsed.memory_used ?? false,
    memory_reference: parsed.memory_reference ?? null,
    memory_unit_id_used: memoryUnitIdUsed,
    insight_id_used: insightIdUsed,
    memory_relevance: memoryRelevance,
    conversation_opportunity: conversationOpportunity,
    question_present: questionPresent,
    channel,
    response: responseText,
    relationship_level: relationshipLevel,
  };
}
