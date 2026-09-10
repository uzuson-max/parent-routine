import { supabase } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { resolveEntity } from '@/lib/entityResolver';

export type MemoryType =
  | 'event' | 'person' | 'place' | 'feeling' | 'thought'
  | 'interest' | 'concern' | 'commitment' | 'preference'
  | 'relationship' | 'pattern';
export type Retention = 'permanent' | 'temporary' | 'contextual' | 'discard';

interface MemoryCandidate {
  memory_type: MemoryType;
  subject: string | null;          // "고양이" 표면형, resolveEntity가 entities로 정규화
  content: string;
  raw_quote: string | null;
  emotion: string | null;
  importance: number;              // 0~1
  retention: Retention;
  event_time_hint: string | null;       // "이번 주말" 등 자연어
  expected_relevance_hint: string | null; // "다음 주쯤 다시 물어볼 만함" 등
}

const SYSTEM_PROMPT = `너는 사용자의 발화에서 "나중에 다시 꺼내볼 만한 정보"를 넓게 찾아내는 역할이다.
이 단계는 오늘 무슨 일이 있었는지 판단하는 게 아니라, 이 발화에서 몇 개의 독립적인 기억 단위를 뽑아낼 수 있는지를 본다.
하나의 발화에서 여러 개(사건/사람/감정/생각 등)를 동시에 뽑아도 된다. 확신 없으면 넣지 마라.

각 후보마다 retention을 반드시 판단해라:
- permanent: 지속적인 성향/관계/취향 등, 시간이 지나도 계속 유효할 정보
- temporary: 지금부터 몇 주~몇 달 정도는 다시 꺼낼 가치가 있지만 영구적이진 않은 정보 (예: 최근 고민, 진행 중인 일)
- contextual: 지금 이 대화 맥락에서만 의미 있고, 다음에 굳이 안 꺼내도 되는 정보
- discard: 기억할 가치 없는 잡담/일회성 사실

절대 하지 마라: 사용자가 말하지 않은 성향을 일반화하는 것("사용자는 ~에 관심이 많다" 식). 사용자가 실제로 한 말의 의미만 보존해서 담아라.

반드시 아래 JSON으로만 답해:
{ "candidates": [
  { "memory_type": "...", "subject": "..." | null, "content": "...", "raw_quote": "..." | null,
    "emotion": "..." | null, "importance": 0.0, "retention": "...",
    "event_time_hint": "..." | null, "expected_relevance_hint": "..." | null }
] }`;

export async function extractMemoryCandidates(transcript: string): Promise<MemoryCandidate[]> {
  // gpt-4o-mini, response_format: json_object, temperature 0.4 (추출은 창의성보다 일관성이 중요)
  // ... callGPT와 같은 fetch 패턴 재사용
}

export async function storeMemoryUnits(entryId: string, userId: string, channel: string, candidates: MemoryCandidate[]) {
  for (const c of candidates) {
    if (c.retention === 'discard') continue; // 여기서 절대 사용자에게 묻지 않고 조용히 버림

    const entityId = c.subject ? await resolveEntity(userId, c.subject) : null;
    const embedding = await embedText(c.content);

    await supabase.from('memory_units').insert({
      user_id: userId,
      source_entry_id: entryId,
      source_channel: channel,
      memory_type: c.memory_type,
      subject_entity_id: entityId,
      content: c.content,
      raw_quote: c.raw_quote,
      emotion: c.emotion,
      importance: c.importance,
      retention: c.retention,
      decay_rate: c.retention === 'permanent' ? 0 : 0.05,
      embedding,
      // event_time_hint/expected_relevance_hint는 별도 경량 파서(또는 같은 호출 안에서)로
      // 실제 timestamptz로 변환해서 event_time/expected_relevance_until에 채운다
    });

    if (c.memory_type === 'commitment') {
      // memory_unit insert 결과의 id를 받아 commitment_details row도 함께 생성
      // (기존 confirmCommitment 로직을 여기로 이관)
    }
  }
}
