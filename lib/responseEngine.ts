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
  buildResponsePrompt,
} from '@/lib/response/responseprompt';
import type { ResponsePrompt, SystemPromptInput } from '@/lib/response/responseprompt';
import {
  buildIntentFallback,
  STT_FAILED_RESPONSE,
  STT_FAILED_TRANSCRIPT,
  tryRepair,
} from '@/lib/response/responsefallback';
import { negativeTargets } from '@/lib/response/understanding';

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

  return generateResponseCore({
    transcript,
    analysis,
    memoryCandidates,
    existingCommitments,
    relevantMemoryUnits,
    relevantInsights,
    initialTopic,
    relationshipLevel: calcRelationshipLevel(entryCount),
    nickname,
    callAllowed,
    recentTurns,
  });
}

// 1차 수정 — DB 조회가 끝난 뒤의 순수 생성 경로. generateResponse()가 조회 결과를 넘겨 호출하고,
// scripts/test-response-v1.ts가 DB 없이 같은 경로를 그대로 돌릴 때도 이 함수를 쓴다.
export async function generateResponseCore(input: SystemPromptInput): Promise<ResponseResult> {
  const {
    transcript,
    analysis,
    relevantMemoryUnits,
    relevantInsights,
    relationshipLevel,
    callAllowed,
    recentTurns,
  } = input;
  const utteranceIntent: string | null = analysis?.utterance_intent ?? null;

  // 음성 인식 실패는 GPT로 보내지 않는다 (예전엔 "음성 변환이 실패했구나. 무슨 일이 있었던 거야?" 같은 응답이 나갔다).
  if (!transcript || !transcript.trim() || transcript === STT_FAILED_TRANSCRIPT) {
    return {
      ...emptyDecisionFields(relationshipLevel),
      response_strategy: 'CASUAL',
      question_present: true,
      response: STT_FAILED_RESPONSE,
      validation_passed: false,
      validation_failure_reason: null,
      regeneration_count: 0,
      closes_conversation: false,
      repeated_memory_detected: false,
      fallback_used: true,
      utterance_intent: utteranceIntent,
      repaired: false,
      fallback_kind: 'stt_failed',
      anchor_discarded: false,
    };
  }

  // 1차 수정 — 정적 규칙(system, 매 호출 동일 → prompt caching)과 동적 입력+출력 계약(user)을 분리했다.
  const prompt = buildResponsePrompt(input);

  const chronologicalTurns = [...recentTurns].reverse();

  // STEP 6 — validation에 필요한 후보 id 집합과, REPEATED_QUESTION/REPEATED_MEMORY 판정에 쓸
  // "가장 최근 턴" 정보를 미리 준비해둔다. chronologicalTurns는 오래된 순으로 정렬돼 있다.
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
    // 1차 수정 — 질문 무시 / 부정 뒤집기 / anchor 원문 대조 검사에 쓰인다.
    transcript,
    utteranceIntent,
    userQuestion: analysis?.user_question ?? null,
    negativeTargets: negativeTargets(analysis?.stances),
  };

  const finalize = (
    result: GeneratedResult,
    extra: Pick<ResponseResult, 'validation_passed' | 'validation_failure_reason' | 'regeneration_count'> & {
      repaired: boolean;
      anchorDiscarded: boolean;
    }
  ): ResponseResult => ({
    ...result,
    validation_passed: extra.validation_passed,
    validation_failure_reason: extra.validation_failure_reason,
    regeneration_count: extra.regeneration_count,
    closes_conversation: isClosingResponse(result.response),
    repeated_memory_detected: computeRepeatedMemoryDetected(result.memory_unit_id_used, result.response, previousTurnForValidation),
    fallback_used: false,
    utterance_intent: utteranceIntent,
    repaired: extra.repaired,
    fallback_kind: null,
    anchor_discarded: extra.anchorDiscarded,
  });

  const build = (parsed: any) =>
    buildGeneratedResult(parsed, callAllowed, relevantMemoryUnits, relevantInsights, relationshipLevel, validMemoryUnitIds, validInsightIds);

  try {
    // 1차 generation
    const firstResult = build(await callGenerationGPT(prompt, GENERATION_TEMPERATURE));
    const firstValidation = validateResponse(firstResult, validationContext);

    if (firstValidation.passed) {
      return finalize(firstResult, {
        validation_passed: true,
        validation_failure_reason: null,
        regeneration_count: 0,
        repaired: false,
        anchorDiscarded: false,
      });
    }

    // 1차 수정 — 실패 사유가 형식 문제뿐이면(질문 2개 이상 / anchor 인용 불일치) 재생성 대신 코드로 최소 수정한다.
    // 수정본도 validator를 그대로 다시 통과해야 한다(규칙 완화 없음). 예전 실데이터의 재생성 사유는 거의 전부
    // TOO_MANY_QUESTIONS였다 — 이 경로가 불필요한 두 번째 GPT 호출을 없앤다.
    const firstRepair = tryRepair({ result: firstResult, reasons: firstValidation.reasons }, validationContext);
    if (firstRepair) {
      return finalize(firstRepair.result, {
        validation_passed: true,
        validation_failure_reason: firstValidation.reasons.join(', '),
        regeneration_count: 0,
        repaired: true,
        anchorDiscarded: firstRepair.anchorDiscarded,
      });
    }

    // 의미 문제(질문 무시, 부정 뒤집기, 기억 오용 등)는 정확히 1회 재생성한다. 정적 system은 그대로(캐시 유지),
    // user 메시지 끝에 실패 사유만 덧붙인다.
    const regenerationPrompt = buildRegenerationPrompt(prompt, firstValidation.reasons, firstResult.response);
    const secondResult = build(await callGenerationGPT(regenerationPrompt, REGENERATION_TEMPERATURE));
    const secondValidation = validateResponse(secondResult, validationContext);

    if (secondValidation.passed) {
      return finalize(secondResult, {
        validation_passed: true,
        // 최종적으로는 통과했지만, 왜 regeneration이 필요했는지 알 수 있도록 1차 실패 사유를 남긴다.
        validation_failure_reason: firstValidation.reasons.join(', '),
        regeneration_count: 1,
        repaired: false,
        anchorDiscarded: false,
      });
    }

    const secondRepair = tryRepair({ result: secondResult, reasons: secondValidation.reasons }, validationContext);
    if (secondRepair) {
      return finalize(secondRepair.result, {
        validation_passed: true,
        validation_failure_reason: secondValidation.reasons.join(', '),
        regeneration_count: 1,
        repaired: true,
        anchorDiscarded: secondRepair.anchorDiscarded,
      });
    }

    // 마지막 안전장치 — 키워드가 아니라 발화 의도 / 질문 원문 / 입장 / anchor 기반 문장 (GPT 호출 없음).
    const fallbackText = buildIntentFallback(transcript, analysis, secondResult.conversation_opportunity.anchor_quote);
    return {
      ...emptyDecisionFields(relationshipLevel),
      response_strategy: /[?？]/.test(fallbackText) ? 'QUESTION' : 'CASUAL',
      memory_relevance: secondResult.memory_relevance,
      conversation_opportunity: {
        ...secondResult.conversation_opportunity,
        // fallback 문장은 기억을 쓰지 않는다. 원문에 없는 anchor는 기록에서도 폐기한다.
        memory_unit_id: null,
        ...(secondValidation.reasons.includes('ANCHOR_NOT_IN_TRANSCRIPT') ? { anchor_quote: null, anchor_fact: null } : {}),
      },
      question_present: /[?？]/.test(fallbackText),
      response: fallbackText,
      validation_passed: false,
      validation_failure_reason: secondValidation.reasons.join(', '),
      regeneration_count: 1,
      closes_conversation: isClosingResponse(fallbackText),
      repeated_memory_detected: false,
      fallback_used: true,
      utterance_intent: utteranceIntent,
      repaired: false,
      fallback_kind: 'intent_template',
      anchor_discarded: secondValidation.reasons.includes('ANCHOR_NOT_IN_TRANSCRIPT'),
    };
  } catch (err) {
    console.error('[responseEngine] 생성 실패:', err);
    // 네트워크/파싱 자체가 실패한 경우. 예전엔 무조건 "오늘 얘기 잘 들었어."였는데, 질문/부탁이었다면 그걸 무시하게 된다.
    const text = buildIntentFallback(transcript, analysis, null);
    return {
      ...emptyDecisionFields(relationshipLevel),
      response_strategy: /[?？]/.test(text) ? 'QUESTION' : 'CASUAL',
      question_present: /[?？]/.test(text),
      response: text,
      // "규칙 위반"이 아니라 "생성 실패"이므로 validation_failure_reason은 null.
      validation_passed: false,
      validation_failure_reason: null,
      regeneration_count: 0,
      closes_conversation: isClosingResponse(text),
      repeated_memory_detected: false,
      fallback_used: true,
      utterance_intent: utteranceIntent,
      repaired: false,
      fallback_kind: 'error',
      anchor_discarded: false,
    };
  }
}

type GeneratedResult = ReturnType<typeof buildGeneratedResult>;

// fallback/STT 실패 경로에서 공통으로 쓰는 "기억을 전혀 쓰지 않은" 판단 필드 기본값.
function emptyDecisionFields(relationshipLevel: number) {
  return {
    interference_purpose: 'listen' as const,
    tone: 'neutral',
    humor_opportunity: 'low' as const,
    memory_used: false,
    memory_reference: null,
    memory_unit_id_used: null,
    insight_id_used: null,
    memory_relevance: [] as ResponseResult['memory_relevance'],
    conversation_opportunity: {
      source: 'none' as const,
      type: 'none' as const,
      strength: 'NONE' as const,
      memory_unit_id: null,
      anchor_quote: null,
      anchor_fact: null,
      question_target: null,
    },
    answered_user_question: false,
    channel: 'text' as const,
    relationship_level: relationshipLevel,
  };
}

// ==================================================
// STEP 6 — Rule-Based Response Validation / Regeneration / Fallback 헬퍼
// ==================================================

// 1차 수정 — temperature. 예전엔 분류(relevance/opportunity)와 문장 생성을 같은 호출에서 0.9로 했다.
// 목표는 창의성을 없애는 게 아니라 "사용자가 한 말과 다른 방향으로 튀는 것"을 줄이는 것 — 생성은 0.6,
// 이미 한 번 규칙을 어긴 뒤의 재생성은 더 보수적으로 0.4. (분석 호출은 lib/analysis.ts에서 0.8 → 0.2)
const GENERATION_TEMPERATURE = 0.6;
const REGENERATION_TEMPERATURE = 0.4;

// 정적 규칙은 system, 동적 입력+출력 계약은 user 메시지로 보낸다. system이 매 호출 동일하므로
// OpenAI 자동 prompt caching(1,024 토큰 이상 동일 prefix)의 대상이 된다. 재생성도 같은 함수를 쓴다.
async function callGenerationGPT(prompt: ResponsePrompt, temperature: number): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      response_format: { type: 'json_object' },
      temperature,
    }),
  });

  if (!res.ok) throw new Error('response engine 호출 실패: ' + (await res.text()));
  const json = await res.json();
  if (json.usage) {
    // 비용 비교용 — prompt_tokens / cached_tokens(캐시 적중분)를 남긴다.
    console.log(
      `[responseEngine] usage prompt=${json.usage.prompt_tokens} cached=${json.usage.prompt_tokens_details?.cached_tokens ?? 0} completion=${json.usage.completion_tokens}`
    );
  }
  return JSON.parse(json.choices[0].message.content);
}

// 예전 buildDeterministicFallback()(transcript.includes('제주도') → 고정 질문 등 키워드 하드코딩)은 제거했다.
// 대체: lib/response/responsefallback.ts의 tryRepair() / buildIntentFallback().
