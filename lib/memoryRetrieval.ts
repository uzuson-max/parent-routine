
import { supabase } from '@/lib/supabase';
 
export interface RelevantMemoryUnit {
  id: number;
  memory_type: string;
  subject: string | null;
  content: string;
  emotion: string | null;
  temporal_context: string | null;
  importance: number;
  status: string;
  created_at: string;
  last_referenced_at: string | null;
  // 아래 두 필드는 내부 랭킹/디버깅용이다. responseEngine 프롬프트에는 절대 넣지 않는다
  // (사용자에게 relevance score 자체를 보여주지 않는다는 원칙).
  relevanceScore: number;
  relevanceReason: string;
}
 
// 형태소 분석 없이 아주 단순한 포함 여부 기반 MVP라, 조사가 그대로 붙어있으면
// "크림라면에"와 "라면"처럼 같은 단어인데도 토큰이 달라서 겹침을 못 잡는 문제가 있었다.
// 완전한 형태소 분석기 없이, 흔한 조사만 잘라내는 가벼운 보정을 추가한다.
const TRAILING_PARTICLES = [
  '에서', '으로', '한테', '이랑', '부터', '까지', '에게', '와', '과', '이랑',
  '이', '가', '은', '는', '을', '를', '에', '도', '만', '의', '로', '랑', '께',
];
 
function stripParticle(token: string): string {
  for (const p of TRAILING_PARTICLES) {
    if (token.length - p.length >= 2 && token.endsWith(p)) {
      return token.slice(0, token.length - p.length);
    }
  }
  return token;
}
 
function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  // 한글/영문/숫자 2글자 이상 토큰만. 각 토큰에서 흔한 조사를 한 번 잘라낸 stem도 함께 담아서
  // "라면"과 "크림라면에" 같은 조사 차이로 인한 매칭 실패를 줄인다.
  const raw = text.match(/[가-힣a-zA-Z0-9]{2,}/g) ?? [];
  const stems = raw.map(stripParticle).filter((t) => t.length >= 2);
  return [...raw, ...stems];
}
 
function scoreCandidate(
  m: any,
  transcript: string,
  transcriptTokens: Set<string>,
  matchedEntityIds: Set<string>
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];
 
  if (m.subject_entity_id && matchedEntityIds.has(m.subject_entity_id)) {
    score += 5;
    reasons.push('entity_match');
  }
 
  const contentTokens = tokenize(m.content);
  const exactOverlap = new Set(contentTokens.filter((t) => transcriptTokens.has(t)));
  if (exactOverlap.size > 0) {
    score += exactOverlap.size;
    reasons.push(`keyword_overlap:${Array.from(exactOverlap).join(',')}`);
  }
 
  // "크림라면" 안에 "라면"이 들어있는 것처럼, 조사 제거만으로는 못 잡는 복합명사 부분 포함도
  // 약한 가중치로 잡아준다 (형태소 분석 없이 쓸 수 있는 가장 단순한 보정).
  const partialOverlap = new Set<string>();
  for (const ct of contentTokens) {
    if (exactOverlap.has(ct)) continue;
    for (const tt of transcriptTokens) {
      if (tt.length >= 2 && ct.length >= 2 && (ct.includes(tt) || tt.includes(ct))) {
        partialOverlap.add(`${ct}~${tt}`);
      }
    }
  }
  if (partialOverlap.size > 0) {
    score += partialOverlap.size * 0.5;
    reasons.push(`partial_overlap:${Array.from(partialOverlap).join(',')}`);
  }
 
  score += typeof m.importance === 'number' ? m.importance : 0.5;
 
  if (m.retention === 'permanent') {
    score += 0.5;
    reasons.push('permanent');
  }
 
  const referenceCount = m.reference_count ?? 0;
  if (referenceCount > 0) {
    score += Math.min(referenceCount, 5) * 0.2;
    reasons.push(`referenced:${referenceCount}`);
  }
 
  if (m.status === 'open') {
    score += 0.3;
    reasons.push('open');
  }
 
  if (m.created_at) {
    const daysSince = (Date.now() - new Date(m.created_at).getTime()) / (24 * 60 * 60 * 1000);
    const recencyBonus = Math.max(0, 1 - daysSince / 30) * 0.5;
    if (recencyBonus > 0) {
      score += recencyBonus;
      if (recencyBonus > 0.1) reasons.push(`recent:${Math.round(daysSince)}일전`);
    }
  }
 
  return { score, reason: reasons.length > 0 ? reasons.join('; ') : 'baseline(importance/retention만)' };
}
 
const MEMORY_UNIT_COLUMNS =
  'id, memory_type, subject_entity_id, content, emotion, temporal_context, importance, retention, status, created_at, last_referenced_at, reference_count, entities(name)';
 
/**
 * 목표: "최근 기억 찾기"가 아니라 "현재 발화와 연결되는 과거 기억 찾기".
 * 1차 MVP — vector DB/embedding 없이 순수 애플리케이션 레벨 하이브리드 스코어링만 사용한다.
 *   1) subject(entity)가 오늘 transcript에 그대로 등장하는가 (가장 강한 신호)
 *   2) content와 transcript의 키워드가 겹치는가
 *   3) importance / permanent 여부 / 얼마나 자주 참조됐는지 / 최근성(약한 가중치)
 * 키워드가 하나도 안 겹쳐도 importance가 높은 기억은 baseline pool로 함께 넘어갈 수 있다 —
 * "진짜 연결되는지"의 최종 판단은 여기서 끝내지 않고 responseEngine의 기존 LLM 추론에 맡긴다.
 * 실패해도 절대 던지지 않고 빈 배열을 반환한다 (호출부 로직에 영향 없음).
 */
export async function retrieveRelevantMemories(
  userId: string,
  transcript: string,
  limit = 5
): Promise<RelevantMemoryUnit[]> {
  try {
    if (!transcript || !transcript.trim() || transcript === '(음성 변환 실패)') return [];
 
    const { data: entities, error: entitiesError } = await supabase
      .from('entities')
      .select('id, name')
      .eq('user_id', userId)
      .limit(300);
 
    if (entitiesError) {
      console.error('[memoryRetrieval] entities 조회 실패 (엔티티 매칭 없이 계속):', entitiesError.message);
    }
 
    const matchedEntityIds = new Set<string>(
      (entities ?? [])
        .filter((e: any) => e.name && typeof e.name === 'string' && transcript.includes(e.name))
        .map((e: any) => e.id)
    );
 
    const { data: basePool, error: baseError } = await supabase
      .from('memory_units')
      .select(MEMORY_UNIT_COLUMNS)
      .eq('user_id', userId)
      .in('status', ['open', 'resolved'])
      .order('importance', { ascending: false })
      .limit(50);
 
    if (baseError) console.error('[memoryRetrieval] base pool 조회 실패:', baseError.message);
 
    let entityPool: any[] = [];
    if (matchedEntityIds.size > 0) {
      const { data, error } = await supabase
        .from('memory_units')
        .select(MEMORY_UNIT_COLUMNS)
        .eq('user_id', userId)
        .in('status', ['open', 'resolved'])
        .in('subject_entity_id', Array.from(matchedEntityIds))
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) console.error('[memoryRetrieval] entity pool 조회 실패:', error.message);
      entityPool = data ?? [];
    }
 
    const merged = new Map<number, any>();
    for (const m of [...(basePool ?? []), ...entityPool]) merged.set(m.id, m);
    if (merged.size === 0) return [];
 
    const transcriptTokens = new Set(tokenize(transcript));
 
    const scored = Array.from(merged.values()).map((m) => {
      const { score, reason } = scoreCandidate(m, transcript, transcriptTokens, matchedEntityIds);
      return { m, score, reason };
    });
 
    scored.sort((a, b) => b.score - a.score);
 
    return scored.slice(0, limit).map(({ m, score, reason }) => ({
      id: m.id,
      memory_type: m.memory_type,
      subject: m.entities?.name ?? null,
      content: m.content,
      emotion: m.emotion,
      temporal_context: m.temporal_context,
      importance: m.importance,
      status: m.status,
      created_at: m.created_at,
      last_referenced_at: m.last_referenced_at,
      relevanceScore: score,
      relevanceReason: reason,
    }));
  } catch (err: any) {
    console.error('[memoryRetrieval] retrieveRelevantMemories 전체 실패 (빈 배열 반환):', err?.message);
    return [];
  }
}
 
/**
 * responseEngine이 실제로 특정 memory_unit(들)을 답변에 썼을 때 last_referenced_at/reference_count를
 * 갱신한다. 새 테이블 없이 memory_units 자체의 기존 컬럼만 갱신하는 가장 작은 변경이다.
 * 실패해도 절대 던지지 않는다 (호출부 로직에 영향 없음).
 */
export async function markMemoriesReferenced(memoryUnitIds: number[]): Promise<void> {
  if (!memoryUnitIds || memoryUnitIds.length === 0) return;
  try {
    for (const id of memoryUnitIds) {
      const { data: row, error: fetchError } = await supabase
        .from('memory_units')
        .select('reference_count')
        .eq('id', id)
        .maybeSingle();
 
      if (fetchError) {
        console.error('[memoryRetrieval] reference_count 조회 실패:', fetchError.message);
        continue;
      }
 
      const { error } = await supabase
        .from('memory_units')
        .update({
          last_referenced_at: new Date().toISOString(),
          reference_count: (row?.reference_count ?? 0) + 1,
        })
        .eq('id', id);
 
      if (error) console.error('[memoryRetrieval] last_referenced_at 업데이트 실패:', error.message);
    }
  } catch (err: any) {
    console.error('[memoryRetrieval] markMemoriesReferenced 실패 (무시):', err?.message);
  }
}
 
