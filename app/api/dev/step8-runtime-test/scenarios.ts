import type { ResponseResult } from '@/lib/responseEngine';
import type { RelevantMemoryUnit } from '@/lib/memoryRetrieval';
import type { RelevantInsight } from '@/lib/insightEngine';

// generateResponse()의 analysis 파라미터는 어떤 필드가 없어도 ?? 기본값으로 처리되지만,
// 시나리오마다 명시적으로 채워서 어떤 분석 결과를 가정하고 테스트하는지 분명히 해둔다.
export function defaultAnalysis(overrides: Partial<Record<string, any>> = {}) {
  return {
    goal: null,
    commitment: null,
    commitment_type: null,
    commitment_confidence: null,
    excuse: null,
    emotion: null,
    detected_pattern: null,
    contradictions: [],
    intervention_needed: false,
    intervention_reason: null,
    fulfilled_commitments: [],
    ...overrides,
  };
}

function memUnit(partial: Partial<RelevantMemoryUnit> & { id: number; content: string }): RelevantMemoryUnit {
  return {
    memory_type: 'interest',
    subject: null,
    emotion: null,
    temporal_context: null,
    importance: 3,
    status: 'active',
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    last_referenced_at: null,
    relevanceScore: 0.7,
    relevanceReason: 'STEP 8 harness fixture',
    ...partial,
  };
}

export interface Step8Scenario {
  id: string;
  label: string;
  transcript: string;
  analysis: ReturnType<typeof defaultAnalysis>;
  memoryCandidates: { memory_type: string; content: string }[];
  existingCommitments: { id: string; commitment: string }[];
  relevantMemoryUnits: RelevantMemoryUnit[];
  relevantInsights: RelevantInsight[];
  initialTopic?: string;
  // D처럼 "직전 턴에 이미 이 memory를 이런 문장으로 썼다"는 상황을 실제로 재현하려면, generateResponse()가
  // 내부에서 조회하는 voice_entries에 그 직전 턴을 실제로 심어둬야 한다 (recentTurns는 DB 조회이기 때문에
  // 파라미터로 흉내낼 수 없다). 러너가 이 필드가 있으면 먼저 INSERT하고, 테스트 후 DELETE로 정리한다.
  seedPreviousTurn?: {
    transcript: string;
    callMessage: string;
    memoryUnitIdUsed: number | null;
    minutesAgo: number;
  };
  // 기계적으로 판정 가능한 구조적 기대치만 검사한다. "이 응답이 실제로 좋은가"는 사람이 response 텍스트를
  // 직접 읽고 판단해야 하는 영역이라 여기 넣지 않는다 — STEP 8 스펙이 요구한 것도 그거다.
  check: (result: ResponseResult) => { label: string; pass: boolean; detail: string }[];
}

export const STEP8_SCENARIOS: Step8Scenario[] = [
  {
    id: 'A',
    label: '일반 일상 대화',
    transcript: '오늘 점심에 김치찌개 먹었어.',
    analysis: defaultAnalysis(),
    memoryCandidates: [],
    existingCommitments: [],
    relevantMemoryUnits: [],
    relevantInsights: [],
    check: (r) => [
      {
        label: '관련 기억이 하나도 없으니 memory_unit_id_used는 null이어야 한다',
        pass: r.memory_unit_id_used === null,
        detail: `memory_unit_id_used=${r.memory_unit_id_used}`,
      },
      {
        label: 'memory_used도 false여야 한다',
        pass: r.memory_used === false,
        detail: `memory_used=${r.memory_used}`,
      },
    ],
  },
  {
    id: 'B',
    label: '현재 발화의 빈칸 (unspoken_part 유도)',
    transcript: '오늘 진짜 어이없는 일이 있었는데, 말하기도 좀 그렇다.',
    analysis: defaultAnalysis(),
    memoryCandidates: [],
    existingCommitments: [],
    relevantMemoryUnits: [],
    relevantInsights: [],
    check: (r) => [
      {
        label: 'memory 후보가 없으니 opportunity source는 current_turn 또는 none이어야 한다',
        pass: r.conversation_opportunity.source !== 'memory',
        detail: `source=${r.conversation_opportunity.source}`,
      },
      {
        label: '(기대) 오늘 발화 자체에 빈칸이 있으니 current_turn 기회를 잡았으면 좋다 — 사람 판단 필요',
        pass: r.conversation_opportunity.source === 'current_turn',
        detail: `source=${r.conversation_opportunity.source}, type=${r.conversation_opportunity.type}, strength=${r.conversation_opportunity.strength}`,
      },
    ],
  },
  {
    id: 'C',
    label: '제주도 과거 기억 ↔ 현재 회사 스트레스',
    transcript: '요즘 회사 진짜 답답하다. 그냥 다 놔두고 어디 멀리 가버리고 싶어.',
    analysis: defaultAnalysis({ emotion: '답답함' }),
    memoryCandidates: [],
    existingCommitments: [],
    relevantMemoryUnits: [
      memUnit({
        id: 91001,
        memory_type: 'desire',
        content: '제주도에서 한 달 살아보고 싶다는 생각을 여러 번 이야기했다',
        temporal_context: '두 달 전부터',
        emotion: '설렘',
      }),
    ],
    relevantInsights: [],
    check: (r) => [
      {
        label: '(핵심 검증 대상) memory_unit_id 91001의 relevance가 YES로 판단됐는가',
        pass: r.memory_relevance.some((m) => m.memory_unit_id === 91001 && m.relevance === 'YES'),
        detail: JSON.stringify(r.memory_relevance),
      },
      {
        label: 'memory를 실제로 썼다면 opportunity도 memory/STRONG이어야 한다 (STEP 6 게이트 무결성)',
        pass: r.memory_unit_id_used !== 91001 || (r.conversation_opportunity.source === 'memory' && r.conversation_opportunity.strength === 'STRONG'),
        detail: `memory_unit_id_used=${r.memory_unit_id_used}, opportunity=${JSON.stringify(r.conversation_opportunity)}`,
      },
    ],
  },
  {
    id: 'D',
    label: '식물가게 반복 기억',
    transcript: '오늘도 화원 들렀다가 또 식물 샀어. 이러다 진짜 가게 차릴 판이야.',
    analysis: defaultAnalysis(),
    memoryCandidates: [],
    existingCommitments: [],
    relevantMemoryUnits: [
      memUnit({
        id: 92001,
        memory_type: 'goal',
        content: '식물가게를 직접 운영해보고 싶다는 이야기를 여러 번 했다',
        temporal_context: '몇 주 전부터',
      }),
    ],
    relevantInsights: [],
    seedPreviousTurn: {
      transcript: '오늘 화원 갔다가 또 식물 사고 싶어졌어.',
      callMessage: '또 식물가게야? ㅋㅋ 언젠가 진짜 차릴 기세인데.',
      memoryUnitIdUsed: 92001,
      minutesAgo: 180,
    },
    check: (r) => [
      {
        label: '(관찰용) 직전 턴과 같은 memory_unit_id를 또 거의 동일한 문장으로 반복했는가',
        pass: !r.repeated_memory_detected,
        detail: `repeated_memory_detected=${r.repeated_memory_detected}, response="${r.response}"`,
      },
      {
        label: '(핵심) 반복이 감지됐어도 최종적으로 사용자에게 나가는 응답은 validation을 통과했거나 fallback으로라도 대체됐다',
        pass: r.validation_passed === true || r.fallback_used === true,
        detail: `validation_passed=${r.validation_passed}, fallback_used=${r.fallback_used}, regeneration_count=${r.regeneration_count}`,
      },
    ],
  },
  {
    id: 'E',
    label: '명백한 generic encouragement 유도',
    transcript: '나 요즘 진짜 다 포기하고 싶어. 뭘 해도 안 되는 것 같아.',
    analysis: defaultAnalysis({ emotion: '무기력' }),
    memoryCandidates: [],
    existingCommitments: [],
    relevantMemoryUnits: [],
    relevantInsights: [],
    check: (r) => [
      {
        label: '(관찰용) 1차 응답이 generic encouragement로 실패해서 regeneration이 발생했는가',
        pass: true,
        detail: `regeneration_count=${r.regeneration_count}, validation_failure_reason=${r.validation_failure_reason}`,
      },
      {
        label: '최종 응답 자체는 generic encouragement 패턴으로 닫히면 안 된다',
        pass: !r.closes_conversation,
        detail: `closes_conversation=${r.closes_conversation}, response="${r.response}"`,
      },
    ],
  },
  {
    id: 'F',
    label: 'closing response 유도',
    transcript: '나 내일 진짜 중요한 면접 있어. 완전 긴장돼 죽겠어.',
    analysis: defaultAnalysis({ emotion: '긴장' }),
    memoryCandidates: [],
    existingCommitments: [],
    relevantMemoryUnits: [],
    relevantInsights: [],
    check: (r) => [
      {
        label: '(관찰용) 1차 응답이 closing response로 실패해서 regeneration이 발생했는가',
        pass: true,
        detail: `regeneration_count=${r.regeneration_count}, validation_failure_reason=${r.validation_failure_reason}`,
      },
      {
        label: '최종 응답은 closing response(질문 없이 화이팅류로 끝)가 아니어야 한다',
        pass: !r.closes_conversation,
        detail: `closes_conversation=${r.closes_conversation}, response="${r.response}"`,
      },
    ],
  },
  {
    id: 'G',
    label: '잘못된 memory relevance 후보 (무관한 기억 끼워넣기)',
    transcript: '점심에 뭐 먹을지 고민 중이야.',
    analysis: defaultAnalysis(),
    memoryCandidates: [],
    existingCommitments: [],
    relevantMemoryUnits: [
      memUnit({ id: 93001, content: '제주도에서 한 달 살아보고 싶다는 생각을 했다' }),
    ],
    relevantInsights: [],
    check: (r) => [
      {
        label: '무관한 기억(93001)을 memory_unit_id_used로 쓰면 안 된다',
        pass: r.memory_unit_id_used !== 93001,
        detail: `memory_unit_id_used=${r.memory_unit_id_used}`,
      },
      {
        label: '(핵심 검증 대상) 93001의 relevance가 NO로 판단됐는가',
        pass: r.memory_relevance.some((m) => m.memory_unit_id === 93001 && m.relevance === 'NO') || r.memory_relevance.every((m) => m.memory_unit_id !== 93001),
        detail: JSON.stringify(r.memory_relevance),
      },
    ],
  },
  {
    id: 'H',
    label: '현재 발화 자체의 기회 + memory가 동시에 존재',
    transcript: '오늘 회사에서 별거 아닌 걸로 부장님이랑 부딪혔는데 이상하게 계속 신경 쓰이네.',
    analysis: defaultAnalysis(),
    memoryCandidates: [],
    existingCommitments: [],
    relevantMemoryUnits: [
      memUnit({ id: 94001, content: '예전에도 직장 상사와의 갈등 때문에 스트레스를 받은 적이 있다고 말했다' }),
    ],
    relevantInsights: [],
    check: (r) => [
      {
        label: 'memory_unit_id_used를 썼다면 opportunity.source는 반드시 memory여야 한다 (current_turn과 동시에 쓰면 안 됨)',
        pass: r.memory_unit_id_used === null || r.conversation_opportunity.source === 'memory',
        detail: `memory_unit_id_used=${r.memory_unit_id_used}, opportunity.source=${r.conversation_opportunity.source}`,
      },
    ],
  },
  {
    id: 'I',
    label: '여러 memory 후보 중 하나만 강하게 연결',
    transcript: '커피 마시다가 문득 예전에 하고 싶다던 카페 창업 생각이 다시 나더라.',
    analysis: defaultAnalysis(),
    memoryCandidates: [],
    existingCommitments: [],
    relevantMemoryUnits: [
      memUnit({ id: 95001, content: '카페를 직접 차려보고 싶다는 이야기를 했다' }),
      memUnit({ id: 95002, content: '삼각김밥은 명란 맛을 좋아한다' }),
      memUnit({ id: 95003, content: '제주도에서 한 달 살아보고 싶다는 생각을 했다' }),
    ],
    relevantInsights: [],
    check: (r) => [
      {
        label: '진짜 관련된 95001만 relevance YES가 나와야 한다',
        pass: r.memory_relevance.some((m) => m.memory_unit_id === 95001 && m.relevance === 'YES'),
        detail: JSON.stringify(r.memory_relevance),
      },
      {
        label: '무관한 95002/95003은 memory_unit_id_used로 쓰이면 안 된다',
        pass: r.memory_unit_id_used !== 95002 && r.memory_unit_id_used !== 95003,
        detail: `memory_unit_id_used=${r.memory_unit_id_used}`,
      },
    ],
  },
  {
    id: 'J',
    label: 'memory 없이도 좋은 QUESTION이 나와야 하는 경우',
    transcript: '오늘 새로 생긴 카페 갔는데 사장님이 좀 특이하더라.',
    analysis: defaultAnalysis(),
    memoryCandidates: [],
    existingCommitments: [],
    relevantMemoryUnits: [],
    relevantInsights: [],
    check: (r) => [
      {
        label: 'memory 후보가 없으니 memory_unit_id_used는 null이어야 한다',
        pass: r.memory_unit_id_used === null,
        detail: `memory_unit_id_used=${r.memory_unit_id_used}`,
      },
      {
        label: '(기대) memory 없이도 구체적인 질문이 나왔으면 좋다 — 사람 판단 필요',
        pass: r.question_present === true,
        detail: `question_present=${r.question_present}, response="${r.response}"`,
      },
    ],
  },
];
