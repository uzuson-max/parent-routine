
import { supabase } from '@/lib/supabase';
import { generateMemoryEmbedding } from '@/lib/memoryEmbedding';

// STEP 2 — semantic retrieval 관련 baseline 상수. 전부 초기 추정치이며 "최적값"이 아니다 —
// STEP 8에서 실제 로그 데이터가 쌓인 뒤 튜닝 대상이다.
const SEMANTIC_SIMILARITY_WEIGHT = 4;
const RECENT_USAGE_PENALTY_WEIGHT = 0.6;
const RECENT_USAGE_PENALTY_WINDOW_HOURS = 24;
const SEMANTIC_CANDIDATE_LIMIT = 15;

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
  relevanceScore: number;
  relevanceReason: string;
}
 
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
 
export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  const raw = text.match(/[가-힣a-zA-Z0-9]{2,}/g) ?? [];
  const stems = raw.map(stripParticle).filter((t) => t.length >= 2);
  return [...raw, ...stems];
}
 
function scoreCandidate(
  m: any,
  transcript: string,
  transcriptTokens: Set<string>,
  matchedEntityIds: Set<string>,
  semanticSimilarity: number = 0
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
 
  const partialOverlap = new Set<string>();
  const transcriptTokenArr = Array.from(transcriptTokens);
  for (const ct of contentTokens) {
    if (exactOverlap.has(ct)) continue;
    for (const tt of transcriptTokenArr) {
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
 
  // STEP 2 — Freeze v1 수정사항 #3: reference_count가 높다고 점수를 올리던 기존 로직(버그의 원인)을
  // 제거하고, "최근에" 재사용됐을 때만 감쇠형 페널티를 준다. 후보 자체는 절대 제거하지 않는다.
  const referenceCount = m.reference_count ?? 0;
  if (referenceCount > 0 && m.last_referenced_at) {
    const hoursSinceRef = (Date.now() - new Date(m.last_referenced_at).getTime()) / (60 * 60 * 1000);
    const recencyFactor = Math.max(0, 1 - hoursSinceRef / RECENT_USAGE_PENALTY_WINDOW_HOURS);
    if (recencyFactor > 0) {
      const penalty = Math.min(referenceCount, 5) * RECENT_USAGE_PENALTY_WEIGHT * recencyFactor;
      score -= penalty;
      reasons.push(`recent_usage_penalty:-${penalty.toFixed(2)}(ref=${referenceCount},${Math.round(hoursSinceRef)}h전)`);
    }
  }

  // STEP 2 — semantic similarity(0~1, RPC의 cosine 유사도)를 후보 우선순위에 반영한다.
  // 이 값 자체가 "사용 여부"를 결정하지 않는다 — 순수 랭킹 가산점이다.
  if (semanticSimilarity > 0) {
    const semanticBonus = semanticSimilarity * SEMANTIC_SIMILARITY_WEIGHT;
    score += semanticBonus;
    reasons.push(`semantic:${semanticSimilarity.toFixed(2)}(+${semanticBonus.toFixed(2)})`);
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
  'id, memory_type, subject_entity_id, content, emotion, temporal_context, importance, retention, status, created_at, last_referenced_at, reference_count, source_entry_id, entities(name)';

<export async function filterConfirmedCommitments
  T extends { memory_type: string; source_entry_id?: string | null }
>(userId: string, units: T[]): Promise<T[]> {
  const commitmentUnits = units.filter((u) => u.memory_type === 'commitment');
  if (commitmentUnits.length === 0) return units;

  const entryIds = Array.from(
    new Set(
      commitmentUnits
        .map((u) => u.source_entry_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  if (entryIds.length === 0) {
    return units.filter((u) => u.memory_type !== 'commitment');
  }

  try {
    const { data, error } = await supabase
      .from('commitment_memory')
      .select('voice_entry_id')
      .eq('user_id', userId)
      .in('voice_entry_id', entryIds);

    if (error) {
      console.error(
        '[memoryRetrieval] filterConfirmedCommitments: commitment_memory 조회 실패 — commitment-type memory 전부 제외:',
        error.message
      );
      return units.filter((u) => u.memory_type !== 'commitment');
    }

    const confirmedEntryIds = new Set(
      (data ?? []).map((r: any) => r.voice_entry_id).filter((id: any) => typeof id === 'string')
    );

    return units.filter((u) => {
      if (u.memory_type !== 'commitment') return true;
      return typeof u.source_entry_id === 'string' && confirmedEntryIds.has(u.source_entry_id);
    });
  } catch (err: any) {
    console.error(
      '[memoryRetrieval] filterConfirmedCommitments 실패 — commitment-type memory 전부 제외:',
      err?.message
    );
    return units.filter((u) => u.memory_type !== 'commitment');
  }
}

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
 
    // STEP 2 — semantic(embedding 기반) 후보 수집. keyword 기반 basePool/entityPool을 대체하지 않고
    // 항상 "추가로" 모은다. 아래 각 단계는 실패해도 개별적으로 흡수되어 keyword-only 결과로 계속 진행한다.
    let semanticPool: any[] = [];
    const semanticSimilarityById = new Map<number, number>();
    try {
      const queryEmbedding = await generateMemoryEmbedding(transcript);
      if (queryEmbedding) {
        const { data: matches, error: rpcError } = await supabase.rpc('match_memory_units', {
          query_embedding: queryEmbedding,
          match_user_id: userId,
          match_count: SEMANTIC_CANDIDATE_LIMIT,
        });
        if (rpcError) {
          console.error('[memoryRetrieval] semantic RPC 실패 (keyword retrieval만으로 계속):', rpcError.message);
        } else if (matches && matches.length > 0) {
          const semanticIds = matches.map((r: any) => r.id);
          const { data: rows, error: rowsError } = await supabase
            .from('memory_units')
            .select(MEMORY_UNIT_COLUMNS)
            .eq('user_id', userId)
            .in('status', ['open', 'resolved'])
            .in('id', semanticIds);
          if (rowsError) {
            console.error(
              '[memoryRetrieval] semantic candidate 상세 조회 실패 (keyword retrieval만으로 계속):',
              rowsError.message
            );
          } else {
            semanticPool = rows ?? [];
            for (const r of matches) {
              if (typeof r.similarity === 'number') semanticSimilarityById.set(r.id, r.similarity);
            }
          }
        }
      }
    } catch (semanticErr: any) {
      console.error('[memoryRetrieval] semantic retrieval 전체 실패 (keyword retrieval만으로 계속):', semanticErr?.message);
    }

    const merged = new Map<number, any>();
    for (const m of [...(basePool ?? []), ...entityPool, ...semanticPool]) merged.set(m.id, m);
    if (merged.size === 0) return [];

    const eligibleUnits = await filterConfirmedCommitments(userId, Array.from(merged.values()));
    if (eligibleUnits.length === 0) return [];

    const transcriptTokens = new Set(tokenize(transcript));

    const scored = eligibleUnits.map((m) => {
      const semanticSimilarity = semanticSimilarityById.get(m.id) ?? 0;
      const { score, reason } = scoreCandidate(m, transcript, transcriptTokens, matchedEntityIds, semanticSimilarity);
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
