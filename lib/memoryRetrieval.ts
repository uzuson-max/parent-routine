
import { embedText } from '@/lib/embeddings';
import { supabase } from '@/lib/supabase';

interface RetrievedMemory {
  id: number; content: string; memory_type: string; importance: number;
  event_time: string | null; score: number;
}

async function keywordEntitySearch(userId: string, utterance: string) {
  // to_tsvector 매치 + entities.name/aliases가 utterance에 포함되는지 체크
}
async function semanticSearch(userId: string, embedding: number[]) {
  // memory_units.embedding <=> query embedding, cosine distance, limit 15
}
async function recencySearch(userId: string) {
  // last_referenced_at 없는(=한 번도 안 꺼낸) 최근 memory 우선
}
async function importantOpenSearch(userId: string) {
  // status='open' and retention in ('permanent','temporary') order by importance desc
}
async function recurringSearch(userId: string, utterance: string) {
  // 같은 entity/주제가 mention_count 높은 것 우선 (entities.mention_count)
}

export async function retrieveRelevantMemories(
  userId: string, utterance: string, limit = 5
): Promise<RetrievedMemory[]> {
  const embedding = await embedText(utterance);
  const [kw, sem, recent, important, recurring] = await Promise.all([
    keywordEntitySearch(userId, utterance),
    semanticSearch(userId, embedding),
    recencySearch(userId),
    importantOpenSearch(userId),
    recurringSearch(userId, utterance),
  ]);

  const candidates = dedupeById([...kw, ...sem, ...recent, ...important, ...recurring]).slice(0, 15);
  if (candidates.length === 0) return [];

  // 후보가 많아졌을 때만 LLM 재순위 호출 (비용 절감 — 15개 이하면 스킵하고 규칙 기반 스코어만 사용해도 됨)
  return llmRerank(utterance, candidates, limit);
}

async function llmRerank(utterance: string, candidates: RetrievedMemory[], limit: number) {
  // gpt-4o-mini에 "현재 발화 + 후보 15개 요약"만 넘기고,
  // "지금 이 상황과 실제로 연결되는 기억인가"를 0~1 점수로만 받아온다 (내용 재생성 X, 순위만).
  // DB가 전체를 판단하지 않고, AI가 후보 안에서만 최종 판단하게 하는 구조.
}
