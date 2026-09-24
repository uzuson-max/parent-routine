import { supabase } from '@/lib/supabase';
import { RelevantMemoryUnit } from '@/lib/memoryRetrieval';
import { RelevantInsight } from '@/lib/insightEngine';

import type {
  ValidationContext,
  ResponseResult,
  RecentTurn,
} from '@/lib/response/responsetypes';
import {
  validateResponse,
  isClosingResponse,
  computeRepeatedMemoryDetected,
} from '@/lib/response/responsevalidator';
import { buildGeneratedResult } from '@/lib/response/responseutils';
import {
  PERSONALITY_PROMPT,
  buildRegenerationPrompt,
  buildSystemPrompt,
} from '@/lib/response/responseprompt';

// 기존에 이 파일에서 export하던 PERSONALITY_PROMPT — 외부 5개 파일이 '@/lib/responseEngine'에서 import하므로 그대로 다시 export한다.
export { PERSONALITY_PROMPT };

// 기존에 이 파일에서 export하던 validateResponse — 외부 import 경로('@/lib/responseEngine')를 유지하기 위해 다시 export한다.
export { validateResponse };

// 기존에 이 파일에서 export하던 타입들 — 외부 import 경로('@/lib/responseEngine')를 그대로 유지하기 위해 다시 export한다.
export type {
  MemoryRelevanceItem,
  ConversationOpportunitySource,
  ConversationOpportunityType,
  ConversationOpportunityStrength,
  ConversationOpportunity,
  ValidationFailureReason,
  ValidationResult,
  ValidationContext,
  ResponseResult,
} from '@/lib/response/responsetypes';

function calcRelationshipLevel(entryCount: number): number {
  if (entryCount <= 2) return 1;
  if (entryCount <= 5) return 2;
  if (entryCount <= 10) return 3;
  if (entryCount <= 20) return 4;
  return 5;
}

export async function canCallNow(userId: string): Promise<boolean> {
  const now = new Date();
  const day1Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count: count24h } = await supabase
    .from('voice_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('call_state', 'calling_sent')
    .gte('created_at', day1Ago);

  if ((count24h ?? 0) > 0) return false;

  const { count: count7d } = await supabase
    .from('voice_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('call_state', 'calling_sent')
    .gte('created_at', day7Ago);

  return (count7d ?? 0) < 2;
}

async function getEntryCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('voice_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count ?? 0;
}

async function fetchNickname(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_memory')
    .select('nickname')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.nickname ?? null;
}


// 발화당 프롬프트에 얹을 최근 대화 턴 수. 무제한으로 늘리지 않는다 — 너무 많이 넣으면 프롬프트가
// 길어지고 LLM이 오히려 뭘 우선해야 할지 흐려진다. 초기값 4는 heuristic이며, 실제 로그를 보고
// 튜닝 대상이다.
const RECENT_TURN_LIMIT = 4;

// Phase 3 — "사용자의 후속 답변도 새로운 입력이다"가 실제로 작동하려면, 지금 이 발화가 참견이가
// 최근에 물어본 것에 대한 답일 수도 있다는 걸 프롬프트가 알아야 한다. 기존에는 직전 1턴만 봐서,
// "라면 먹었어~" → "무슨 라면?" → "크림라면" 같은 짧은 흐름 자체는 이어갈 수 있어도, 그보다
// 조금만 더 오래된 흐름(예: 같은 화제를 몇 턴 전에도 물어본 것)은 아예 안 보였다.
// 이제 최근 N턴(RECENT_TURN_LIMIT)을 한 번에 가져온다. 새 테이블 없이 voice_entries 자체
// (transcript/call_message/response/created_at)만 조회하는 변경이다.
// 실패해도 절대 던지지 않고 빈 배열을 반환한다 (최근 대화 없이 기존 방식대로 계속 진행).
async function fetchRecentTurns(
  userId: string,
  excludeEntryId: string,
  limit: number = RECENT_TURN_LIMIT
): Promise<RecentTurn[]> {
  try {
    const { data, error } = await supabase
      .from('voice_entries')
      .select('transcript, call_message, response, created_at')
      .eq('user_id', userId)
      .neq('id', excludeEntryId)
      .not('transcript', 'is', null)
      .not('call_message', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[responseEngine] fetchRecentTurns 조회 실패 (최근 대화 없이 계속):', error.message);
      return [];
    }
    if (!data || data.length === 0) return [];

    return data
      .filter((row: any) => row.transcript && row.call_message && row.transcript !== '(음성 변환 실패)')
      .map((row: any) => {
        const minutesAgo = Math.max(0, Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000));
        // response는 generateResponse()가 반환한 ResponseResult 전체를 그대로 저장해둔 jsonb다.
        // 과거 행이거나 필드가 비어 있을 수도 있으니 전부 optional로 다룬다.
        const parsedResponse = (row.response ?? null) as Partial<ResponseResult> | null;
        return {
          transcript: row.transcript as string,
          response: row.call_message as string,
          minutesAgo,
          strategy: parsedResponse?.response_strategy ?? null,
          memoryUnitIdUsed: parsedResponse?.memory_unit_id_used ?? null,
          insightIdUsed: parsedResponse?.insight_id_used ?? null,
        };
      });
  } catch (err: any) {
    console.error('[responseEngine] fetchRecentTurns 실패 (무시):', err?.message);
    return [];
  }
}

export async function generateResponse(
  transcript: string,
  analysis: any,
  userId: string,
  entryId: string,
  memoryCandidates: { memory_type: string; content: string }[] = [],
  existingCommitments: { id: string; commitment: string }[] = [],
  relevantMemoryUnits: RelevantMemoryUnit[] = [],
  relevantInsights: RelevantInsight[] = [],
  // 홈 화면에서 참견이가 먼저 던진 proactive callback(단일 memory_unit 콜백/insight 콜백) 문장.
  // 사용자가 "대답하기"로 들어와서 남긴 발화라면 여기 채워진다 — 이 값 자체는 어디에도 저장하지 않고
  // (app/api/user/proactive-line/route.ts에서 이미 그렇게 설계됨), 이번 응답 생성 프롬프트에만
  // "방금 참견이가 먼저 이렇게 말 걸었다"는 맥락으로 한 번 전달된다. 없으면(일반 발화) 기존과 동일하게 동작.
  initialTopic?: string
): Promise<ResponseResult> {
  const [entryCount, callAllowed, nickname, recentTurns] = await Promise.all([
    getEntryCount(userId),
    canCallNow(userId),
    fetchNickname(userId),
    fetchRecentTurns(userId, entryId),
  ]);
  const relationshipLevel = calcRelationshipLevel(entryCount);

  // systemPrompt 조립(블록 8개 + 본문 템플릿)은 lib/response/responsePrompt.ts의 buildSystemPrompt()로 이동했다.
  // 넘기는 값은 원래 이 자리에서 쓰던 것과 완전히 같다 — 결과 문자열도 원본과 동일하다.
  const systemPrompt = buildSystemPrompt({
    transcript,
    analysis,
    memoryCandidates,
    existingCommitments,
    relevantMemoryUnits,
    relevantInsights,
    initialTopic,
    relationshipLevel,
    nickname,
    callAllowed,
    recentTurns,
  });

  // 아래 validation 준비(직전 턴 찾기)에서 쓰던 값. 원래는 systemPrompt 조립 중에 만들어졌는데 그 코드가
  // buildSystemPrompt()로 옮겨갔으므로, 원본과 똑같은 식으로 여기서도 계산한다.
  const chronologicalTurns = [...recentTurns].reverse();

  // STEP 6 — validation에 필요한 후보 id 집합과, REPEATED_QUESTION/REPEATED_MEMORY 판정에 쓸
  // "가장 최근 턴" 정보를 미리 준비해둔다. chronologicalTurns는 위에서 이미 오래된 순으로 정렬돼 있다.
  const validMemoryUnitIds = new Set(relevantMemoryUnits.map((m) => m.id));
  const validInsightIds = new Set(relevantInsights.map((i) => i.id));
  const previousTurnForValidation: ValidationContext['previousResponse'] =
    chronologicalTurns.length > 0
      ? {
          response: chronologicalTurns[chronologicalTurns.length - 1].response,
          memoryUnitIdUsed: chronologicalTurns[chronologicalTurns.length - 1].memoryUnitIdUsed,
        }
      : null;
  const validationContext: ValidationContext = {
    validMemoryUnitIds,
    previousResponse: previousTurnForValidation,
  };

  try {
    // 1차 generation — 기존 STEP 1~5와 완전히 동일한 GPT 호출 1회.
    const firstParsed = await callGenerationGPT(systemPrompt);
    const firstResult = buildGeneratedResult(
      firstParsed,
      callAllowed,
      relevantMemoryUnits,
      relevantInsights,
      relationshipLevel,
      validMemoryUnitIds,
      validInsightIds
    );
    const firstValidation = validateResponse(firstResult, validationContext);

    if (firstValidation.passed) {
      return {
        ...firstResult,
        validation_passed: true,
        validation_failure_reason: null,
        regeneration_count: 0,
        // STEP 7 — 실제로 반환되는 firstResult 기준으로 계산한다.
        closes_conversation: isClosingResponse(firstResult.response),
        repeated_memory_detected: computeRepeatedMemoryDetected(
          firstResult.memory_unit_id_used,
          firstResult.response,
          previousTurnForValidation
        ),
        fallback_used: false,
      };
    }

    // STEP 6 — validation 실패 시 정확히 1회만 regeneration을 시도한다. 별도의 validator GPT 호출을
    // 만들지 않고, 기존 generateResponse() GPT 호출(callGenerationGPT)을 실패 사유가 추가된 프롬프트로
    // 다시 호출하는 방식으로 구현한다. 정상 흐름의 GPT 호출 3회는 그대로 유지되고, 이 1회만 추가되므로
    // 최대 GPT 호출 수는 4회이며 5회 이상 호출되는 경로는 없다.
    const regenerationPrompt = buildRegenerationPrompt(systemPrompt, firstValidation.reasons, firstResult.response);
    const secondParsed = await callGenerationGPT(regenerationPrompt);
    const secondResult = buildGeneratedResult(
      secondParsed,
      callAllowed,
      relevantMemoryUnits,
      relevantInsights,
      relationshipLevel,
      validMemoryUnitIds,
      validInsightIds
    );
    const secondValidation = validateResponse(secondResult, validationContext);

    if (secondValidation.passed) {
      return {
        ...secondResult,
        validation_passed: true,
        // 최종적으로는 통과했지만, "왜 regeneration이 필요했는지"를 로그에서 알 수 있도록 1차
        // 실패 사유를 남겨둔다 (validation_passed=true인데 이 필드가 채워져 있으면 "regeneration을
        // 거쳐 통과했다"는 뜻으로 읽으면 된다).
        validation_failure_reason: firstValidation.reasons.join(', '),
        regeneration_count: 1,
        // STEP 7 — 실제로 반환되는 secondResult 기준으로 계산한다.
        closes_conversation: isClosingResponse(secondResult.response),
        repeated_memory_detected: computeRepeatedMemoryDetected(
          secondResult.memory_unit_id_used,
          secondResult.response,
          previousTurnForValidation
        ),
        fallback_used: false,
      };
    }

    // STEP 6 — regeneration까지 실패하면 deterministic fallback을 반환한다. 이 경로에는 추가 GPT
    // 호출이 전혀 없다 — buildDeterministicFallback()은 순수 함수로, 현재 발화의 몇 가지 뚜렷한
    // 키워드에 대응하는 고정 질문 패턴 중 하나를 코드로 "고르기"만 한다. memory/insight는 사용하지
    // 않는다 (memory_unit_id_used는 반드시 null).
    const fallbackResponseText = buildDeterministicFallback(transcript);
    return {
      response_strategy: 'QUESTION',
      interference_purpose: 'listen',
      tone: 'neutral',
      humor_opportunity: 'low',
      memory_used: false,
      memory_reference: null,
      memory_unit_id_used: null,
      insight_id_used: null,
      memory_relevance: secondResult.memory_relevance,
      conversation_opportunity: secondResult.conversation_opportunity,
      question_present: /[?？]/.test(fallbackResponseText),
      channel: 'text',
      response: fallbackResponseText,
      relationship_level: relationshipLevel,
      validation_passed: false,
      validation_failure_reason: secondValidation.reasons.join(', '),
      regeneration_count: 1,
      // STEP 7 — fallback 문장은 memory_unit_id_used가 항상 null이므로
      // repeated_memory_detected는 항상 false다. closes_conversation은 fallback 문장 자체를
      // isClosingResponse()로 판정한 결과를 그대로 쓴다(새 로직 아님).
      closes_conversation: isClosingResponse(fallbackResponseText),
      repeated_memory_detected: computeRepeatedMemoryDetected(null, fallbackResponseText, previousTurnForValidation),
      fallback_used: true,
    };
  } catch (err) {
    console.error('[responseEngine] 생성 실패:', err);
    return {
      response_strategy: 'CASUAL',
      interference_purpose: 'listen',
      tone: 'neutral',
      humor_opportunity: 'low',
      memory_used: false,
      memory_reference: null,
      memory_unit_id_used: null,
      insight_id_used: null,
      memory_relevance: [],
      conversation_opportunity: { source: 'none', type: 'none', strength: 'NONE', memory_unit_id: null },
      question_present: false,
      channel: 'text',
      response: '오늘 얘기 잘 들었어.',
      relationship_level: relationshipLevel,
      // 네트워크/파싱 자체가 실패한 경우(=rule validation까지 가보지도 못한 경우)이므로
      // validation_failure_reason은 null로 둔다 — 이건 "규칙 위반"이 아니라 "생성 실패"다.
      validation_passed: false,
      validation_failure_reason: null,
      regeneration_count: 0,
      // STEP 7 — 이 경로는 memory를 전혀 쓰지 않았으므로 repeated_memory_detected는 항상 false다.
      // 하드코딩된 안전 응답 문장 자체를 동일한 isClosingResponse()로 판정한다(새 로직 아님).
      closes_conversation: isClosingResponse('오늘 얘기 잘 들었어.'),
      repeated_memory_detected: false,
      fallback_used: true,
    };
  }
}

// ==================================================
// STEP 6 — Rule-Based Response Validation / Regeneration / Fallback 헬퍼
// ==================================================

// 기존에 generateResponse() 안에 인라인으로 있던 fetch 호출을 그대로 함수로 옮긴 것뿐이다 —
// 요청 payload/모델/temperature 등 어떤 것도 바꾸지 않았다. regeneration 시에도 이 함수를
// 그대로 재사용한다 (별도의 validator GPT 호출이 아니라 같은 generation 호출의 재시도).
async function callGenerationGPT(systemPrompt: string): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0.9,
    }),
  });

  if (!res.ok) throw new Error('response engine 호출 실패: ' + (await res.text()));
  const json = await res.json();
  return JSON.parse(json.choices[0].message.content);
}

// STEP 6 — deterministic fallback. GPT를 다시 호출하지 않는다. 현재 발화에 등장하는 몇 가지
// 뚜렷한 키워드에 대응하는, 미리 정해둔 고정 질문 패턴 중 하나를 코드가 직접 고를 뿐이다.
// "생성"이 아니라 "선택"이므로 이름 그대로 완전히 결정적(deterministic)이다.
function buildDeterministicFallback(transcript: string): string {
  if (transcript.includes('답답')) return '오늘 뭐가 제일 답답했어?';
  if (transcript.includes('바쁘')) return '오늘 제일 먼저 끝내야 하는 건 뭐야?';
  if (transcript.includes('제주도')) return '제주도에서 제일 해보고 싶은 게 뭐야?';
  return '지금은 뭐가 제일 걸려?';
}
