
import { supabase } from '@/lib/supabase';
import { resolveEntity } from '@/lib/entityResolver';

export type MemoryType =
  | 'event' | 'person' | 'relationship' | 'pet' | 'place' | 'interest'
  | 'emotion' | 'thought' | 'reflection' | 'concern' | 'preference'
  | 'commitment' | 'experience';

export type Retention = 'permanent' | 'temporary' | 'contextual';
export type MemoryStatus = 'open' | 'resolved';

const MEMORY_TYPES: MemoryType[] = [
  'event', 'person', 'relationship', 'pet', 'place', 'interest',
  'emotion', 'thought', 'reflection', 'concern', 'preference', 'commitment', 'experience',
];
const RETENTIONS: Retention[] = ['permanent', 'temporary', 'contextual'];
const STATUSES: MemoryStatus[] = ['open', 'resolved'];

export interface MemoryCandidate {
  memory_type: MemoryType;
  subject: string | null;
  content: string;
  emotional_relevance: string | null;
  temporal_context: string | null;
  importance: number;
  retention: Retention;
  status: MemoryStatus;
}

export interface ExtractionResult {
  candidates: MemoryCandidate[];
  latencyMs: number;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

const SYSTEM_PROMPT = `너는 참견이의 "기억 추출" 담당이다. 사용자가 방금 한 말(transcript) 하나에서,
앞으로 다른 날 다른 대화에서 다시 연결될 가능성이 있는 정보를 폭넓게 찾아낸다.

가장 중요한 판단 기준은 딱 하나다:
"사용자가 기억해달라고 했는가"가 아니라
"이 정보가 미래의 어떤 상황과 다시 연결될 가능성이 있는가"

저장 후보가 될 수 있는 것 (예시일 뿐, 같은 성격이면 목록에 없어도 후보가 된다):
반복해서 언급될 가능성이 있는 사람, 반려동물, 특정 장소, 최근 발생한 사건, 강한 감정이 실린 경험,
아직 해결되지 않은 걱정, 사용자가 스스로 이상하다고 느낀 생각, 과거 경험에서 비롯된 회상,
선호나 싫어하는 것, 하고 싶은 일, 실제 행동 의지, 앞으로 다시 확인할 가치가 있는 일상적인 사건.

candidate를 만들지 않는 것: "ㅋㅋ", "졸려", "배고파", "오늘 날씨 좋다" 같은 단순 반응이나 인사,
그리고 어떤 미래 대화와도 연결될 가능성이 거의 없는 일회성 정보.

애매할 때는 저장하지 않는 쪽이 아니라 저장하는 쪽으로 판단해라. 여기서는 넓게 저장해도,
실제로 나중에 이걸 다시 꺼낼지는 완전히 별도의 검색 단계에서 훨씬 엄격하게 다시 판단하니
지금 단계에서 과도하게 걸러낼 필요 없다.

하나의 발화에서 서로 다른 미래 맥락(다른 대상, 다른 시점, 다른 주제)을 가진 기억이 여러 개
나올 수 있다. 하지만 하나의 사건 안에서 감정이나 결과가 자연스럽게 딸려 있으면 억지로 쪼개서
여러 개로 만들지 마라 — 그럴 땐 하나의 candidate로 합쳐라.
예) "고양이가 아파서 놀랐는데 다행히 괜찮아졌어" → event 하나 (감정과 결과를 다 포함)
예) "고양이가 아파서 놀랐어. 그리고 갑자기 엄마가 나 어떻게 키웠는지 생각났어"
   → event 하나 + reflection 하나 (서로 다른 대상·주제라 분리)

각 candidate는 다음을 판단한다:
- memory_type: event | person | relationship | pet | place | interest | emotion | thought
  | reflection | concern | preference | commitment | experience 중 가장 알맞은 것
- subject: 이 기억이 붙는 대상의 표면형 텍스트 (예: "고양이", "엄마"). 뚜렷한 대상이 없으면 null
- content: 한 문장으로 정제한 기억. 사용자가 실제로 한 말의 의미만 담고, 성향을 일반화하지 마라
  (금지: "사용자는 반려동물을 매우 사랑한다" / 허용: "고양이가 식물을 핥아서 크게 놀랐다")
- emotional_relevance: 이 기억에 실린 감정을 짧게 (예: "놀람 → 안도", "죄책감", "의아함"). 없으면 null
- temporal_context: 시간적 위치를 자연어 원문 그대로 (예: "오늘", "며칠 전", "이번 주말",
  "어렸을 때", "그때", "다음 주쯤"). timestamp로 변환하지 말고 자연어 그대로 담아라. 없으면 null
- importance: 0~1. 앞으로 다시 언급될 가능성 / 개인적 의미 / 다른 기억과 연결될 여지를 종합해서
  판단해라. importance가 낮다고 candidate 자체를 빼지는 마라 — 판단만 정직하게 낮게 줘라.
- retention: permanent(지속적 성향/관계) | temporary(몇 주~몇 달은 유효) | contextual(이 대화 안에서만)
- status: open(아직 진행 중/미해결) | resolved(발화 안에서 이미 해결된 것으로 언급됨)

절대 하지 마라: 사용자가 말하지 않은 성향이나 이유를 지어내는 것.

반드시 아래 JSON으로만 답해:
{ "candidates": [
  { "memory_type": "...", "subject": "..." | null, "content": "...",
    "emotional_relevance": "..." | null, "temporal_context": "..." | null,
    "importance": 0.0, "retention": "permanent|temporary|contextual", "status": "open|resolved" }
] }`;

export async function extractMemoryCandidates(transcript: string): Promise<ExtractionResult> {
  const startedAt = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `방금 한 말: "${transcript}"` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
      }),
    });

    const latencyMs = Date.now() - startedAt;
    if (!res.ok) throw new Error('memory extraction 실패: ' + (await res.text()));

    const json = await res.json();
    const usage = json.usage
      ? {
          prompt_tokens: json.usage.prompt_tokens,
          completion_tokens: json.usage.completion_tokens,
          total_tokens: json.usage.total_tokens,
        }
      : null;
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');

    const candidates: MemoryCandidate[] = Array.isArray(parsed.candidates)
      ? parsed.candidates
          .filter(
            (c: any) =>
              c &&
              MEMORY_TYPES.includes(c.memory_type) &&
              typeof c.content === 'string' &&
              c.content.trim().length > 0 &&
              RETENTIONS.includes(c.retention) &&
              STATUSES.includes(c.status)
          )
          .map(
            (c: any): MemoryCandidate => ({
              memory_type: c.memory_type,
              subject: typeof c.subject === 'string' && c.subject.trim() ? c.subject.trim() : null,
              content: c.content.trim(),
              emotional_relevance:
                typeof c.emotional_relevance === 'string' && c.emotional_relevance.trim()
                  ? c.emotional_relevance.trim()
                  : null,
              temporal_context:
                typeof c.temporal_context === 'string' && c.temporal_context.trim()
                  ? c.temporal_context.trim()
                  : null,
              importance:
                typeof c.importance === 'number' && !Number.isNaN(c.importance)
                  ? Math.min(1, Math.max(0, c.importance))
                  : 0.5,
              retention: c.retention,
              status: c.status,
            })
          )
      : [];

    console.log(
      `[memoryExtraction] latencyMs=${latencyMs} usage=${JSON.stringify(usage)} candidates=${candidates.length}`
    );
    return { candidates, latencyMs, usage };
  } catch (err: any) {
    const latencyMs = Date.now() - startedAt;
    console.error('[memoryExtraction] 추출 실패:', err?.message);
    return { candidates: [], latencyMs, usage: null };
  }
}

export interface StoreMemoryUnitsResult {
  inserted: number;
  skipped: number;
}

export async function storeMemoryUnits(
  entryId: string,
  userId: string,
  sourceChannel: 'voice' | 'text' | 'sms_reply',
  candidates: MemoryCandidate[]
): Promise<StoreMemoryUnitsResult> {
  let inserted = 0;
  let skipped = 0;

  for (const c of candidates) {
    const subjectEntityId = await resolveEntity(userId, c.subject, c.memory_type);

    const { error } = await supabase.from('memory_units').insert({
      user_id: userId,
      source_entry_id: entryId,
      source_channel: sourceChannel,
      memory_type: c.memory_type,
      subject_entity_id: subjectEntityId,
      content: c.content,
      emotion: c.emotional_relevance,
      temporal_context: c.temporal_context,
      importance: c.importance,
      retention: c.retention,
      decay_rate: c.retention === 'permanent' ? 0 : 0.05,
      status: c.status,
    });

    if (error) {
      console.error('[memoryExtraction] memory_units insert failed:', error.message);
      skipped++;
    } else {
      inserted++;
    }
  }

  return { inserted, skipped };
}
