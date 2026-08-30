
import { supabase } from '@/lib/supabase';

type Strategy =
  | 'CASUAL' | 'EMPATHY' | 'PLAYFUL' | 'TEASING' | 'MEMORY_REFERENCE'
  | 'CONTRADICTION' | 'QUESTION' | 'ENCOURAGEMENT' | 'INTERVENTION' | 'SILENT';

export interface ResponseResult {
  response_strategy: Strategy;
  tone: string;
  humor_opportunity: 'low' | 'medium' | 'high';
  memory_used: boolean;
  memory_reference: string | null;
  channel: 'text' | 'voice' | 'call';
  response: string;
  relationship_level: number;
}

const PERSONALITY_PROMPT = `너는 "참견이"라는 존재야. 상담사도 비서도 생산성 코치도 아니고,
"친한 친구 + 약간 귀찮게 구는 친구 + 나를 꽤 잘 아는 친구"에 가까워.

원칙:
- 분석 결과를 그대로 읽어주지 마라 ("목표와 관련된 약속이 없는 상태입니다" 같은 말 절대 금지)
- 데이터를 관계적인 언어로 바꿔라. "3일간 3회 언급했습니다"가 아니라 "요즘 그 얘기 진짜 자주 한다" 처럼.
- 짧고 자연스럽게. 상담사/비서/선생님 말투 금지.
- 모든 발화에 개입하거나 질문하거나 농담할 필요 없다. 아무 반응 없이 넘어가도 된다(SILENT/CASUAL).
- 유머는 상황이 적합할 때만 (humor_opportunity가 high일 때). 사용자 감정을 무시하지 않는 선에서.
- 사용자가 방금 실제로 쓴 단어/표현을 최소 하나는 그대로 살려서 되받아쳐라. "잘 진행되고 있어?" 같은
  일반적인 되물음 대신, 사용자가 쓴 구체적인 단어(고유명사, 숫자, 방금 말한 상태 표현 등)를 인용해서
  "듣고 있었다"는 게 느껴지게 반응해라. 뭉뚱그려서 일반화하지 마라.

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

async function canCallNow(phone: string): Promise<boolean> {
  const now = new Date();
  const day1Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count: count24h } = await supabase
    .from('voice_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_phone', phone)
    .eq('call_state', 'calling_sent')
    .gte('created_at', day1Ago);

  if ((count24h ?? 0) > 0) return false;

  const { count: count7d } = await supabase
    .from('voice_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_phone', phone)
    .eq('call_state', 'calling_sent')
    .gte('created_at', day7Ago);

  return (count7d ?? 0) < 2;
}

async function getEntryCount(phone: string): Promise<number> {
  const { count } = await supabase
    .from('voice_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_phone', phone);
  return count ?? 0;
}

async function fetchNickname(phone: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_memory')
    .select('nickname')
    .eq('user_phone', phone)
    .maybeSingle();
  return data?.nickname ?? null;
}

export async function generateResponse(
  transcript: string,
  analysis: any,
  phone: string
): Promise<ResponseResult> {
  const [entryCount, callAllowed, nickname] = await Promise.all([
    getEntryCount(phone),
    canCallNow(phone),
    fetchNickname(phone),
  ]);
  const relationshipLevel = calcRelationshipLevel(entryCount);

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
- 문장 맨 앞에 억지로 이름을 붙이지 마라. ("${nickname}아, 오늘 운동 목표를 설정했구나" 같은 건 나쁨)
- 자연스러운 예: "${nickname}아. 이건 좀 얘기하자." (개입 상황에서만)`
    : '';

  const systemPrompt = `${PERSONALITY_PROMPT}

지금 참견이와 사용자의 관계 단계: ${relationshipLevel} (1=처음 만남, 5=상당히 잘 아는 사이). 초기엔 너무 친한 척하지 마라.
${nicknameBlock}

사용자가 방금 한 말 (원문 그대로): "${transcript}"

이 발화에 대한 내부 분석 결과 (사용자에게 그대로 보여주면 안 됨, 참고만 할 것):
${analysisBlock}

전화가 지금 가능한 상태인가: ${callAllowed ? 'YES' : 'NO (최근 통화 빈도 제한에 걸림)'}

할 일:
1. response_strategy 하나를 골라라: CASUAL, EMPATHY, PLAYFUL, TEASING, MEMORY_REFERENCE, CONTRADICTION, QUESTION, ENCOURAGEMENT, INTERVENTION, SILENT 중 하나.
   - intervention_needed가 true이고 전화가 가능한 상태면 INTERVENTION을 강하게 고려해라.
   - 평범한 얘기, 목표/약속 없는 잡담이면 CASUAL이나 SILENT.
2. humor_opportunity를 low/medium/high로 판단해라.
3. memory_used: 과거 기억(반복 패턴, 미이행 약속, 모순)을 이번 응답에 실제로 언급했으면 true.
4. memory_reference: 언급했다면 어떤 기억을 썼는지 한 문장 (없으면 null).
5. channel을 정해라:
   - intervention_needed가 true이고 전화가 가능(YES)하면 "call"
   - 그 외엔 "text" (전화가 불가능(NO)하면 아무리 intervention이 필요해도 절대 call로 하지 마라 — text로 대체 반응해라)
6. response: 실제로 사용자에게 보여줄/들려줄 최종 대사.
   - 반드시 사용자가 방금 한 말(위 원문)에서 실제로 등장한 단어, 숫자, 고유명사, 표현 중 최소 하나를 그대로 가져와서 문장에 녹여라.
   - "잘 진행되고 있어?", "화이팅이야" 같이 아무 발화에나 붙일 수 있는 일반적인 문장은 쓰지 마라.
   - 닉네임이 주어졌다면 위 이름 사용 원칙을 따라라. 없으면 이름 없이 자연스럽게.
   - channel이 call이면 전화 통화에서 읽을 멘트로 작성해라.

반드시 아래 JSON 형식으로만 답해:
{
  "response_strategy": "...",
  "tone": "...",
  "humor_opportunity": "low|medium|high",
  "memory_used": true or false,
  "memory_reference": "..." or null,
  "channel": "text|call",
  "response": "..."
}`;

  try {
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
    const parsed = JSON.parse(json.choices[0].message.content);

    const channel: 'text' | 'call' = parsed.channel === 'call' && callAllowed ? 'call' : 'text';

    return {
      response_strategy: parsed.response_strategy ?? 'CASUAL',
      tone: parsed.tone ?? 'neutral',
      humor_opportunity: parsed.humor_opportunity ?? 'low',
      memory_used: parsed.memory_used ?? false,
      memory_reference: parsed.memory_reference ?? null,
      channel,
      response: parsed.response ?? '음, 그렇구나.',
      relationship_level: relationshipLevel,
    };
  } catch (err) {
    console.error('[responseEngine] 생성 실패:', err);
    return {
      response_strategy: 'CASUAL',
      tone: 'neutral',
      humor_opportunity: 'low',
      memory_used: false,
      memory_reference: null,
      channel: 'text',
      response: '오늘 얘기 잘 들었어.',
      relationship_level: relationshipLevel,
    };
  }
}
