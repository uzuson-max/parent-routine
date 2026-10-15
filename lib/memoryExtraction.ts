import { supabase } from '@/lib/supabase';
import { resolveEntity } from '@/lib/entityResolver';
import { isGroundedIn, Stance, STANCES } from '@/lib/response/understanding';

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
  // 1차 수정 — 이 기억에서 사용자가 대상에 대해 드러낸 입장, 그리고 근거가 된 원문 구간.
  // raw_quote는 memory_units.raw_quote(기존 컬럼)에, stance는 memory_units.stance(migration으로 추가)에 저장된다.
  stance: Stance | null;
  raw_quote: string | null;
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
나올 수 있다. 긴 발화(여러 문장에 걸친 이야기)일수록 서로 다른 사실이 여러 개 들어 있다 — 숫자·금액이 붙은 사건,
아직 끝내지 않은 일("돈까지 썼는데 아직 안 했다"), 스스로 내린 평가는 각각 놓치지 말고 candidate로 만든다. 하지만 하나의 사건 안에서 감정이나 결과가 자연스럽게 딸려 있으면 억지로 쪼개서
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
  · content는 반드시 같은 candidate의 raw_quote 구간만 요약한다. 발화의 다른 부분 내용을 섞지 마라.
    다른 부분에 다른 사실이 있으면 그건 별도 candidate다.
  · raw_quote에 있는 숫자·기간·금액·횟수("2년", "5만원", "3개", "1분")와 사용자의 평가·판단 표현
    ("만족스럽지 못하다", "실망", "후회", "외면했다", "아직 안 했다", "별로였다")은 content에서 빼지 마라.
    나중에 다시 꺼낼 때 가장 중요한 건 바로 이 부분이다.
    예) raw_quote "가게 연 지 다음 달이면 1년인데 자리는 잡았지만 솔직히 만족스럽진 않아"
      → ❌ "다음 달에 목표를 이루고 나서 온라인 판매도 해보려 한다" (발화의 다른 부분 내용 + 핵심 평가 누락)
      → ✅ "가게 연 지 다음 달이면 1년인데, 자리는 잡았지만 만족스럽지 않다"
  · "사용자는 ~", "~라고 했다" 같은 3인칭·보고체를 쓰지 말고 사실만 쓴다 ("~라고 했다" ❌ → "~다" ✅).
- emotional_relevance: 이 기억에 실린 감정을 짧게 (예: "놀람 → 안도", "죄책감", "의아함"). 없으면 null
- temporal_context: 시간적 위치를 자연어 원문 그대로 (예: "오늘", "며칠 전", "이번 주말",
  "어렸을 때", "그때", "다음 주쯤"). timestamp로 변환하지 말고 자연어 그대로 담아라. 없으면 null
- importance: 0~1. 앞으로 다시 언급될 가능성 / 개인적 의미 / 다른 기억과 연결될 여지를 종합해서
  판단해라. importance가 낮다고 candidate 자체를 빼지는 마라 — 판단만 정직하게 낮게 줘라.
- retention: permanent(지속적 성향/관계) | temporary(몇 주~몇 달은 유효) | contextual(이 대화 안에서만)
- status: open(아직 진행 중/미해결) | resolved(발화 안에서 이미 해결된 것으로 언급됨)
- stance: 이 기억에서 사용자가 subject(대상)에 드러낸 입장. positive(끌림/좋아함) | negative(싫음/안 함/거절)
  | neutral(그냥 언급) | uncertain(고민 중/망설임). 부정한 것을 관심사로 바꾸지 마라.
  예) "제주도는 가기 싫고" → stance "negative", content "제주도는 가기 싫다고 했다" (❌ "제주도에 관심이 있다")
  예) "일본도 괜찮은데 비행기값이 비싸" → stance "uncertain"
- raw_quote: 이 기억의 근거가 된 발화 원문 구간을 글자 그대로 복사 (요약·교정 금지). 없으면 null
  content가 말하는 내용이 전부 이 구간 안에 있어야 한다.
- content는 입장을 반드시 그대로 담는다: "싫다", "안 하기로 했다", "비싸서 고민 중" 같은 의미를 빼거나 뒤집지 마라.

절대 하지 마라: 사용자가 말하지 않은 성향이나 이유를 지어내는 것.

반드시 아래 JSON으로만 답해:
{ "candidates": [
  { "memory_type": "...", "subject": "..." | null, "content": "...",
    "emotional_relevance": "..." | null, "temporal_context": "..." | null,
    "importance": 0.0, "retention": "permanent|temporary|contextual", "status": "open|resolved",
    "stance": "positive|negative|neutral|uncertain" | null, "raw_quote": "..." | null }
] }`;

// 강 돌다리처럼 "질문에 대한 대답"일 때 — 질문을 같이 줘야 "피아노"가 "언젠가 해보고 싶은 것: 피아노"로 저장된다.
export interface ExtractionQuestionContext {
  question: string;
  label: string;
}

function buildUserMessage(transcript: string, ctx?: ExtractionQuestionContext): string {
  if (!ctx) return `방금 한 말: "${transcript}"`;
  return [
    `참견이가 던진 질문: "${ctx.question}"`,
    `방금 한 대답: "${transcript}"`,
    '',
    `이 대답은 질문에 답한 것이다. 대답 원문만으로는 뜻이 비어 보여도 질문의 의미를 살려 기억을 만든다.`,
    `- 대답의 핵심을 담은 기억 하나는 content에 "${ctx.label}"이라는 의미가 드러나게 쓴다. (예: "언젠가 해보고 싶은 것으로 피아노를 꼽음")`,
    `- raw_quote는 대답 원문 그대로(질문 문구를 섞지 않는다).`,
    `- 대답에 다른 사실·사람·사건이 함께 나오면 평소처럼 따로 뽑는다.`,
  ].join('\n');
}

export async function extractMemoryCandidates(transcript: string, ctx?: ExtractionQuestionContext): Promise<ExtractionResult> {
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
          { role: 'user', content: buildUserMessage(transcript, ctx) },
        ],
        response_format: { type: 'json_object' },
        // 1차 수정: 추출은 원문 충실도가 중요하다 — 0.4 → 0.2.
        temperature: 0.2,
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
              stance: STANCES.includes(c.stance) ? c.stance : null,
              // 원문에 실제로 있는 구간일 때만 저장한다 (모델이 지어낸 인용 방지).
              raw_quote:
                typeof c.raw_quote === 'string' && c.raw_quote.trim() && isGroundedIn(c.raw_quote, transcript)
                  ? c.raw_quote.trim().slice(0, 300)
                  : null,
            })
          )
          // 2026-10-11 — 요약이 자기 원문의 핵심(숫자·평가)을 잃었으면 원문을 우선한다.
          // 원문이 너무 길면(여러 문장을 통째로 잡은 경우) 대체하지 않는다 — 기억이 녹음 전체가 돼버리고,
          // 그런 경우 빠진 숫자는 대개 날짜·시각 같은 부수 정보였다(평가 결과: "10월 11일", "30대").
          // 원문은 raw_quote로 따로 저장되고 응답 엔진이 원문을 먼저 보므로 정보 자체는 사라지지 않는다.
          .map((c: MemoryCandidate): MemoryCandidate => {
            const lost = findLostInContent(c.content, c.raw_quote);
            if (lost.length === 0 || !c.raw_quote) return c;
            if (c.raw_quote.length > RAW_QUOTE_REPLACE_MAX) {
              console.log(`[memoryExtraction] content가 원문 핵심을 잃음(${lost.join(', ')}) — 원문이 길어 요약 유지: "${c.content}"`);
              return c;
            }
            console.log(`[memoryExtraction] content가 원문 핵심을 잃음(${lost.join(', ')}) → 원문으로 대체: "${c.content}"`);
            return { ...c, content: c.raw_quote };
          })
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

// 2026-10-11 — 원문(raw_quote) 우선 원칙. 요약(content)이 원문에 있는 숫자·기간·금액이나 사용자의 평가 표현을
// 빠뜨렸는지 본다. 빠진 게 있으면 그 목록을 돌려준다(빈 배열이면 문제 없음). GPT 호출 없음.
// 실데이터 기준: 105("…2년인데 …만족스럽지는 못한 결과치" → 요약에서 "2년", "만족" 누락),
// 125("1분도 되고 2분도 되고" → 숫자 누락), 110("계정 3개" → 숫자 누락).
// 부정 표현("안 했다"/"하지 않았다")은 요약에서 바꿔 말해도 뜻이 유지되는 경우가 많아 검사하지 않는다.
const RAW_QUOTE_REPLACE_MAX = 100;
const EVALUATION_WORDS = ['만족', '실망', '후회', '외면', '포기', '접었', '별로', '싫', '아직'];

export function findLostInContent(content: string, rawQuote: string | null | undefined): string[] {
  if (!rawQuote) return [];
  const lost: string[] = [];
  const contentDigits = new Set(content.match(/\d+/g) ?? []);
  for (const n of rawQuote.match(/\d+/g) ?? []) {
    if (!contentDigits.has(n) && !lost.includes(n)) lost.push(n);
  }
  for (const w of EVALUATION_WORDS) {
    if (rawQuote.includes(w) && !content.includes(w)) lost.push(w);
  }
  return lost;
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
