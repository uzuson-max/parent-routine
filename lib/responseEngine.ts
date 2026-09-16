
import { supabase } from '@/lib/supabase';
import { RelevantMemoryUnit } from '@/lib/memoryRetrieval';
import { RelevantInsight } from '@/lib/insightEngine';

type Strategy =
  | 'CASUAL' | 'EMPATHY' | 'PLAYFUL' | 'TEASING' | 'MEMORY_REFERENCE'
  | 'CONTRADICTION' | 'QUESTION' | 'ENCOURAGEMENT' | 'INTERVENTION' | 'SILENT'
  | 'UNEXPECTED_INTERJECTION';
 
// WHY: 지금 왜 이 반응/참견을 하는가. HOW(response_strategy)와 독립적으로 판단한다.
type InterferencePurpose =
  | 'listen' | 'comfort' | 'notice' | 'tease' | 'challenge'
  | 'validate' | 'expose_desire' | 'push' | 'confront' | 'silence';
 
export interface ResponseResult {
  response_strategy: Strategy;
  interference_purpose: InterferencePurpose;
  tone: string;
  humor_opportunity: 'low' | 'medium' | 'high';
  memory_used: boolean;
  memory_reference: string | null;
  memory_unit_id_used: number | null;
  insight_id_used: number | null;
  channel: 'text' | 'voice' | 'call';
  response: string;
  relationship_level: number;
}
 
export const PERSONALITY_PROMPT = `너는 "참견이"라는 존재야.
 
정체성:
너는 AI 비서가 아니다. 상담사가 아니다. 생산성 코치가 아니다.
너는 "정답을 주는 AI"가 아니라, 사용자가 하고 싶었던 말 / 듣고 싶었던 말 / 피하고 있던 말을
적절한 순간에 대신 꺼내주는 존재다.
이름 그대로 약간 오지랖 있고, 친구처럼 끼어들고, 가끔 선을 넘는 것처럼 보이지만,
결국 사용자가 "얘가 나를 좀 아네"라고 느끼게 만드는 게 목표다.
 
가장 중요한 원칙 (다른 모든 지시보다 우선한다):
"참견이는 항상 재미있는 말을 하는 AI가 아니다. 참견할 가치가 있을 때만 끼어드는 AI다."
"강한 말보다 정확한 말이 중요하다."
"사용자가 듣고 싶어 하는 말만 하는 것도 참견이 아니다."
그리고 가장 중요한 것: 참견이의 핵심 경쟁력은 말투(Gen Z 영어/비속어/밈)가 아니라
"언제 끼어들고, 왜 끼어들며, 어디까지 끼어드는가"다. 말투는 그 다음이다.
우선순위: ①정확한 타이밍 ②정확한 맥락 ③정확한 참견 목적 ④자연스러운 인간적 관계감
⑤적절한 강도 ⑥그 다음에야 Gen Z식 표현/영어/비속어/밈.
 
주의: "참견하지 않는다"는 것이 "반응하지 않는다"는 뜻은 아니다.
NO INTERFERENCE ≠ NO RESPONSE.
의미 있게 끼어들 이유가 없는 평범한 일상 발화에도, 짧고 인간적인 반응 정도는 자연스럽게 해도 된다.
interference_purpose의 "silence"는 "이 순간엔 의미 있는 참견을 만들어내지 않는다"는 뜻이지,
"아무 말도 하지 않는다"는 뜻이 아니다.
 
절대 금지: 외모/가족/장애·질병/인종·성별·종교 등 민감 특성 공격, 자해·극단적 선택 관련 조롱,
정신질환 진단하듯 말하기, 과도한 욕설, 사용자의 취약점을 악의적으로 이용하는 것.
"킹받는 친구"이지 "악성 AI"가 아니다.`;
 
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

interface PreviousTurn {
  transcript: string;
  response: string;
  minutesAgo: number;
}

// Phase 3 — "사용자의 후속 답변도 새로운 입력이다"가 실제로 작동하려면, 지금 이 발화가 참견이가
// 바로 직전에 물어본 것에 대한 답일 수도 있다는 걸 프롬프트가 알아야 한다. 지금까지는 각 voice_entries
// 호출이 서로 완전히 독립적이라(memory_units/insight retrieval은 "예전 기억"만 다루고 "바로 직전 턴"은
// 아무 데도 없었다), "라면 먹었어~" → "무슨 라면?" → "크림라면"처럼 짧게 이어지는 실제 대화에서
// 두 번째 발화("크림라면")만 뚝 떼어놓고 보면 참견이가 방금 무슨 질문을 했는지 알 방법이 없었다.
// 새 테이블 없이 voice_entries 자체(transcript/call_message/created_at)만 조회하는 가장 작은 변경이다.
// 실패해도 절대 던지지 않고 null을 반환한다 (직전 대화 없이 기존 방식대로 계속 진행).
async function fetchPreviousTurn(userId: string, excludeEntryId: string): Promise<PreviousTurn | null> {
  try {
    const { data, error } = await supabase
      .from('voice_entries')
      .select('transcript, call_message, created_at')
      .eq('user_id', userId)
      .neq('id', excludeEntryId)
      .not('transcript', 'is', null)
      .not('call_message', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[responseEngine] fetchPreviousTurn 조회 실패 (직전 대화 없이 계속):', error.message);
      return null;
    }
    if (!data || !data.transcript || !data.call_message) return null;
    if (data.transcript === '(음성 변환 실패)') return null;

    const minutesAgo = Math.max(0, Math.round((Date.now() - new Date(data.created_at).getTime()) / 60000));
    return { transcript: data.transcript, response: data.call_message, minutesAgo };
  } catch (err: any) {
    console.error('[responseEngine] fetchPreviousTurn 실패 (무시):', err?.message);
    return null;
  }
}

// "3시간 전" 같은 정확한 숫자보다, 참견이가 자연스럽게 판단할 수 있을 정도의 대략적인 표현이면 충분하다.
// 정확한 컷오프로 "직전 대화 반영 여부"를 코드에서 강제로 끊지 않고, 이 표현 + 아래 프롬프트 지침을 근거로
// 최종 판단은 LLM에게 맡긴다 (memory_units/insight를 다룰 때와 같은 원칙).
function formatElapsed(minutesAgo: number): string {
  if (minutesAgo < 2) return '방금 전';
  if (minutesAgo < 60) return `${minutesAgo}분 전`;
  const hours = Math.round(minutesAgo / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days === 1) return '어제';
  return `${days}일 전`;
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
  const [entryCount, callAllowed, nickname, previousTurn] = await Promise.all([
    getEntryCount(userId),
    canCallNow(userId),
    fetchNickname(userId),
    fetchPreviousTurn(userId, entryId),
  ]);
  const relationshipLevel = calcRelationshipLevel(entryCount);
 
  const memoryCandidatesBlock = memoryCandidates.length > 0
    ? memoryCandidates.map(m => `- (${m.memory_type}) "${m.content}"`).join('\n')
    : '(아직 기록된 기억 후보 없음)';
 
  const existingCommitmentsBlock = existingCommitments.length > 0
    ? existingCommitments.map(c => `- "${c.commitment}"`).join('\n')
    : '(실제로 확정된 약속 없음)';

  // memory_units에서 retrieval된, 오늘 발화와 관련될 가능성이 있는 과거 기억. relevanceScore/relevanceReason은
  // 내부 랭킹용이라 절대 프롬프트에 넣지 않는다 (사용자에게든 LLM에게든 점수 자체를 노출하지 않는다).
  const relevantMemoryUnitsBlock = relevantMemoryUnits.length > 0
    ? relevantMemoryUnits
        .map((m) => {
          const subjectPart = m.subject ? `, 관련 대상: ${m.subject}` : '';
          const temporalPart = m.temporal_context ? ` (그때 시점: ${m.temporal_context})` : '';
          const emotionPart = m.emotion ? ` (그때 감정: ${m.emotion})` : '';
          return `- (memory_unit_id=${m.id}, ${m.memory_type}${subjectPart}) "${m.content}"${temporalPart}${emotionPart}`;
        })
        .join('\n')
    : '(관련 기억 없음)';

  // memory_insights — 여러 memory_units를 합쳐서 이미 한 번 "관찰"로 판단된 것들. relevanceScore/
  // relevanceReason은 memory_units 때와 똑같이 내부 랭킹용이라 프롬프트에 절대 넣지 않는다.
  const relevantInsightsBlock = relevantInsights.length > 0
    ? relevantInsights
        .map((ins) => `- (insight_id=${ins.id}${ins.theme ? `, 주제: ${ins.theme}` : ''}) "${ins.content}"`)
        .join('\n')
    : '(관련 관찰 없음)';

  // memory_units/insight는 "예전에 있었던 일"이고, 이건 그것과 완전히 다른 종류의 맥락이다 —
  // 바로 직전 voice_entries 한 건(참견이가 방금 뭐라고 물었는지/말했는지)이다. 없으면(첫 발화거나
  // 조회 실패) 그냥 지금 발화에만 반응하는 기존 동작 그대로다.
  const previousTurnBlock = previousTurn
    ? `${formatElapsed(previousTurn.minutesAgo)}, 아래처럼 대화가 있었다:
사용자: "${previousTurn.transcript}"
참견이: "${previousTurn.response}"`
    : '(직전 대화 없음 — 오늘 발화가 새로운 시작이라고 보면 된다)';

  // previousTurnBlock(=예전에 있었던 완결된 대화 한 쌍)과는 다른 종류의 맥락이다.
  // 이건 "방금, 지금 이 응답을 만들기 직전에" 참견이가 먼저 문자/홈 화면으로 말을 걸었고,
  // 사용자가 바로 그 자리에서 "대답하기"를 눌러 남긴 발화라는 뜻 — 즉 참견이가 던진 질문에
  // 사용자가 곧바로 답하러 온 상황이다. 확률적 추정(previousTurn)이 아니라 이번 발화의 확정된 출처이므로
  // previousTurnBlock보다 우선해서 판단해라.
  const initialTopicBlock = initialTopic
    ? `
[참견이가 방금 먼저 던진 말 — 사용자는 지금 그 말에 답하러 온 것이다]
참견이가 먼저 이렇게 말을 걸었다: "${initialTopic}"
사용자가 방금 한 말(위 "사용자가 방금 한 말")은 원칙적으로 이 말에 대한 대답이다. 참견이가 바로 방금 그 말을 하고 사용자가 이어서 답한 것처럼, 완전히 새로운 화제를 시작하듯 처음부터 다시 묻지 말고 자연스럽게 이어가라.
단, 사용자의 답이 이 말과 명백히 동떨어진 얘기라면 억지로 연결하지 말고 사용자가 실제로 한 말을 우선해라.
이 문장을 사용자에게 그대로 다시 읽어주거나 "너가 방금 이 질문에 답하러 온 거잖아"처럼 보고하듯 언급하지 마라 — 그냥 원래 나누던 대화가 자연스럽게 이어지는 것처럼 반응해라.`
    : '';

  const analysisBlock = `
goal: ${analysis.goal ?? '없음'}
commitment: ${analysis.commitment ?? '없음'} (type: ${analysis.commitment_type ?? '-'}, confidence: ${analysis.commitment_confidence ?? '-'})
excuse: ${analysis.excuse ?? '없음'}
emotion: ${analysis.emotion ?? '없음'}
detected_pattern: ${analysis.detected_pattern ?? '없음'}
contradictions: ${(analysis.contradictions ?? []).join(', ') || '없음'}
intervention_needed: ${analysis.intervention_needed}
intervention_reason: ${analysis.intervention_reason ?? '없음'}
fulfilled_commitments: ${(analysis.fulfilled_commitments ?? []).join(', ') || '없음'}`;
 
  const nicknameBlock = nickname
    ? `
사용자 닉네임: "${nickname}"
이름 사용 원칙:
- 이름은 필요한 순간에만 써라. 일반적인 답변엔 생략해라.
- 중요한 개입, 전화, 친밀한 순간에만 자연스럽게 써라.
- 문장 맨 앞에 억지로 이름을 붙이지 마라. ("${nickname
