
import { supabase } from '@/lib/supabase';
import { generateMemoryEmbedding } from '@/lib/memoryEmbedding';
import type { Stance } from '@/lib/response/understanding';

// STEP 2 — semantic retrieval 관련 baseline 상수. 전부 초기 추정치이며 "최적값"이 아니다 —
// STEP 8에서 실제 로그 데이터가 쌓인 뒤 튜닝 대상이다.
const SEMANTIC_SIMILARITY_WEIGHT = 4;
const RECENT_USAGE_PENALTY_WEIGHT = 0.6;
const RECENT_USAGE_PENALTY_WINDOW_HOURS = 24;
const SEMANTIC_CANDIDATE_LIMIT = 15;
// 1차 수정 — "이번 발화와 연결된 신호가 하나도 없는 기억"(importance/retention/최근성 가산점만으로 올라온 것)은
// 응답 엔진에 넘기지 않는다. semantic은 이 값 이상일 때만 "신호"로 친다.
// 0.35는 운영 DB의 기억-기억 유사도 분포(중앙값≈0.30, 상위 25%≈0.37, 같은 주제≈0.45~0.56)를 보고 잡은 초기값이다.
// 발화-기억 유사도 분포는 아직 측정하지 않았으므로 로그를 보고 튜닝 대상이다. 점수 계산 자체는 바꾸지 않는다.
const SEMANTIC_SIGNAL_MIN = 0.35;

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
  // 1차 수정 — 그 기억을 말할 때의 입장/원문. stance는 memory_units.stance 컬럼이 추가된 뒤에만 채워진다.
  stance?: Stance | null;
  raw_quote?: string | null;
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

// P0 — 검색 전용 불용어. memoryPipeline.ts의 LINK_STOPWORDS(링크 생성용)와 같은 목록에 어미/추임새 조각을 더했다.
// 예전엔 검색에 불용어가 없어서 "싶다/진짜/오늘" 같은 흔한 단어의 부분 일치만으로 아무 기억이나 "연결 신호"를 얻었다
// (예: "회사 그만두고 싶다" ↔ "식물 키워보고 싶다"). 링크 생성 동작은 바꾸지 않기 위해 별도 목록으로 둔다.
const RETRIEVAL_STOPWORDS = new Set([
  '오늘', '어제', '내일', '모레', '이번', '저번', '다음', '진짜', '정말', '너무', '완전',
  '그냥', '근데', '그런데', '그리고', '그래서', '하지만', '아니', '그래', '엄청', '약간',
  '거기', '여기', '저기', '이거', '그거', '저거', '뭔가', '이제', '아까', '갑자기', '계속',
  '우리', '나는', '내가', '너는', '니가', '한테', '한번', '조금',
  '한다', '했다', '된다', '싶다', '같다', '보다', '이다', '있다', '없다', '거야', '이야',
  '요즘', '생각', '사용자', '했던', '하는', '하고', '해서', '했어', '있어', '없어', '같아', '같은',
]);
// 어미/보조용언 조각으로 시작하는 토큰("싶다고", "싶어서", "있었는데", "했는데" 등)도 신호로 치지 않는다.
const RETRIEVAL_STOPWORD_PREFIX = /^(싶|같아|같은|같다|있었|있는|없는|없어|했|해서|해야|하는|하면|하고|한다|된다|되는|그냥|진짜|정말|너무|완전|요즘)/;

export function isRetrievalStopword(token: string): boolean {
  return RETRIEVAL_STOPWORDS.has(token) || RETRIEVAL_STOPWORD_PREFIX.test(token);
}

/** 검색용 토큰 — tokenize() 결과에서 불용어를 뺀 것. 발화 원문 + (있다면) 분석이 뽑은 핵심 주제어를 합친다. */
export function buildRetrievalTokens(transcript: string, topics: string[] = []): Set<string> {
  const tokens = [...tokenize(transcript), ...topics.flatMap((t) => tokenize(t))];
  return new Set(tokens.filter((t) => !isRetrievalStopword(t)));
}

export interface RankableMemoryUnit {
  id: number;
  content: string;
  subject_entity_id?: string | null;
  importance?: number | null;
  retention?: string | null;
  status?: string | null;
  created_at?: string | null;
  last_referenced_at?: string | null;
  reference_count?: number | null;
}

export interface RankedMemoryCandidate<T extends RankableMemoryUnit> {
  m: T;
  score: number;
  reason: string;
  simRaw: number;
  simSituation: number;
}

export interface RankInput {
  retrievalTokens: Set<string>;
  matchedEntityIds: Set<string>;
  // 기억 id → 발화 원문 임베딩과의 cosine 유사도 / 상황 문장 임베딩과의 유사도
  simRawById: Map<number, number>;
  simSituationById: Map<number, number>;
  limit?: number;
  now?: number;
}

function scoreCandidate(
  m: RankableMemoryUnit,
  retrievalTokens: Set<string>,
  matchedEntityIds: Set<string>,
  semanticSimilarity: number,
  now: number
): { score: number; reason: string; hasSignal: boolean } {
  let score = 0;
  const reasons: string[] = [];
  let hasSignal = false;

  if (m.subject_entity_id && matchedEntityIds.has(m.subject_entity_id)) {
    score += 5;
    reasons.push('entity_match');
    hasSignal = true;
  }

  const contentTokens = tokenize(m.content).filter((t) => !isRetrievalStopword(t));
  const exactOverlap = new Set(contentTokens.filter((t) => retrievalTokens.has(t)));
  if (exactOverlap.size > 0) {
    score += exactOverlap.size;
    hasSignal = true;
    reasons.push(`keyword_overlap:${Array.from(exactOverlap).join(',')}`);
  }

  const partialOverlap = new Set<string>();
  const retrievalTokenArr = Array.from(retrievalTokens);
  for (const ct of contentTokens) {
    if (exactOverlap.has(ct)) continue;
    for (const tt of retrievalTokenArr) {
      if (tt.length >= 2 && ct.length >= 2 && (ct.includes(tt) || tt.includes(ct))) {
        partialOverlap.add(`${ct}~${tt}`);
      }
    }
  }
  if (partialOverlap.size > 0) {
    score += partialOverlap.size * 0.5;
    hasSignal = true;
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
    const hoursSinceRef = (now - new Date(m.last_referenced_at).getTime()) / (60 * 60 * 1000);
    const recencyFactor = Math.max(0, 1 - hoursSinceRef / RECENT_USAGE_PENALTY_WINDOW_HOURS);
    if (recencyFactor > 0) {
      const penalty = Math.min(referenceCount, 5) * RECENT_USAGE_PENALTY_WEIGHT * recencyFactor;
      score -= penalty;
      reasons.push(`recent_usage_penalty:-${penalty.toFixed(2)}(ref=${referenceCount},${Math.round(hoursSinceRef)}h전)`);
    }
  }

  // STEP 2 — semantic similarity(0~1, RPC의 cosine 유사도)를 후보 우선순위에 반영한다.
  // P0 — 값은 "원문 검색어"와 "상황 문장 검색어" 중 더 높은 유사도다.
  if (semanticSimilarity > 0) {
    const semanticBonus = semanticSimilarity * SEMANTIC_SIMILARITY_WEIGHT;
    score += semanticBonus;
    if (semanticSimilarity >= SEMANTIC_SIGNAL_MIN) hasSignal = true;
    reasons.push(`semantic:${semanticSimilarity.toFixed(2)}(+${semanticBonus.toFixed(2)})`);
  }

  if (m.status === 'open') {
    score += 0.3;
    reasons.push('open');
  }

  if (m.created_at) {
    const daysSince = (now - new Date(m.created_at).getTime()) / (24 * 60 * 60 * 1000);
    const recencyBonus = Math.max(0, 1 - daysSince / 30) * 0.5;
    if (recencyBonus > 0) {
      score += recencyBonus;
      if (recencyBonus > 0.1) reasons.push(`recent:${Math.round(daysSince)}일전`);
    }
  }

  return { score, reason: reasons.length > 0 ? reasons.join('; ') : 'baseline(importance/retention만)', hasSignal };
}

/**
 * P0 — 점수 계산 + "연결 신호 없음" 제거 + 정렬 + 상위 limit개. DB를 읽지 않는 순수 함수다.
 * 운영 retrieval(retrieveRelevantMemoriesWithTrace)과 평가 스크립트(scripts/eval-memory-connection.ts)가 같은 함수를 쓴다.
 */
export function rankMemoryCandidates<T extends RankableMemoryUnit>(
  units: T[],
  input: RankInput
): { ranked: RankedMemoryCandidate<T>[]; droppedNoSignal: number } {
  const now = input.now ?? Date.now();
  const limit = input.limit ?? 5;
  let droppedNoSignal = 0;
  const scored: RankedMemoryCandidate<T>[] = [];
  for (const m of units) {
    const simRaw = input.simRawById.get(m.id) ?? 0;
    const simSituation = input.simSituationById.get(m.id) ?? 0;
    const { score, reason, hasSignal } = scoreCandidate(
      m,
      input.retrievalTokens,
      input.matchedEntityIds,
      Math.max(simRaw, simSituation),
      now
    );
    // 1차 수정 — 이번 발화와 연결 신호가 전혀 없는 기억은 후보에서 뺀다 (importance/최근성 가산점만으로는 안 올라온다).
    if (!hasSignal) {
      droppedNoSignal++;
      continue;
    }
    scored.push({ m, score, reason, simRaw, simSituation });
  }
  scored.sort((a, b) => b.score - a.score);
  return { ranked: scored.slice(0, limit), droppedNoSignal };
}

const MEMORY_UNIT_BASE_COLUMNS =
  'id, memory_type, subject_entity_id, content, raw_quote, emotion, temporal_context, importance, retention, status, created_at, last_referenced_at, reference_count, source_entry_id, entities(name)';

// memory_units.stance는 1차 수정의 migration(SQL 별도 제공)으로 추가되는 컬럼이다. migration 전에도 앱이 깨지지 않도록,
// 컬럼이 없다는 에러를 한 번 보면 이 프로세스에서는 stance 없이 조회한다.
let stanceColumnAvailable = true;
function memoryUnitColumns(): string {
  return stanceColumnAvailable ? `${MEMORY_UNIT_BASE_COLUMNS}, stance` : MEMORY_UNIT_BASE_COLUMNS;
}
export function isMissingStanceColumnError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message ?? '');
  return /stance/.test(msg) && (err.code === '42703' || err.code === 'PGRST204' || /does not exist|could not find/i.test(msg));
}
async function selectUnits(build: (columns: string) => PromiseLike<{ data: any; error: any }>): Promise<{ data: any; error: any }> {
  const first = await build(memoryUnitColumns());
  if (stanceColumnAvailable && isMissingStanceColumnError(first.error)) {
    stanceColumnAvailable = false;
    console.log('[memoryRetrieval] memory_units.stance 컬럼 없음 — stance 없이 조회 (migration 적용 전)');
    return build(memoryUnitColumns());
  }
  return first;
}

type CommitmentFilterable = { memory_type: string; source_entry_id?: string | null };

export async function filterConfirmedCommitments<T extends CommitmentFilterable>(userId: string, units: T[]): Promise<T[]> {
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

// P0 — 분석 단계(lib/analysis.ts)가 같은 호출에서 뽑은 검색 힌트. 없으면 원문만으로 검색한다(기존 동작).
export interface RetrievalHints {
  situation?: string | null;
  topics?: string[];
}

// P0 — 검색이 실제로 무엇을 했는지 남기는 기록. upload 라우트가 voice_entries.response.retrieval_trace로 저장한다.
// "검색이 못 찾았나 / GPT가 안 골랐나 / 검증에서 떨어졌나"를 구분하기 위한 것 — 동작에는 영향 없음.
export interface RetrievalTrace {
  queries: { raw: string; situation: string | null; topics: string[] };
  pool_sizes: { base: number; entity: number; semantic_raw: number; semantic_situation: number; merged: number; eligible: number };
  dropped_no_signal: number;
  candidates: { id: number; score: number; sim_raw: number; sim_situation: number; reason: string }[];
  errors: string[];
}

function emptyTrace(transcript: string, hints?: RetrievalHints): RetrievalTrace {
  return {
    queries: { raw: transcript, situation: hints?.situation ?? null, topics: hints?.topics ?? [] },
    pool_sizes: { base: 0, entity: 0, semantic_raw: 0, semantic_situation: 0, merged: 0, eligible: 0 },
    dropped_no_signal: 0,
    candidates: [],
    errors: [],
  };
}

async function semanticMatches(
  userId: string,
  queryText: string | null,
  trace: RetrievalTrace,
  label: string
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!queryText || !queryText.trim()) return out;
  try {
    const embedding = await generateMemoryEmbedding(queryText);
    if (!embedding) {
      trace.errors.push(`${label}: embedding 없음`);
      return out;
    }
    const { data: matches, error } = await supabase.rpc('match_memory_units', {
      query_embedding: embedding,
      match_user_id: userId,
      match_count: SEMANTIC_CANDIDATE_LIMIT,
    });
    if (error) {
      console.error(`[memoryRetrieval] semantic RPC 실패(${label}) — 이 검색어 없이 계속:`, error.message);
      trace.errors.push(`${label}: rpc ${error.message}`);
      return out;
    }
    for (const r of matches ?? []) {
      if (typeof r.id === 'number' && typeof r.similarity === 'number') out.set(r.id, r.similarity);
    }
  } catch (err: any) {
    console.error(`[memoryRetrieval] semantic retrieval 실패(${label}) — 이 검색어 없이 계속:`, err?.message);
    trace.errors.push(`${label}: ${err?.message ?? 'error'}`);
  }
  return out;
}

/**
 * P0 — 원문 + 상황 문장 두 검색어로 의미 검색, 원문 + 핵심 주제어로 키워드/엔티티 매칭.
 * 어떤 단계가 실패해도 던지지 않고 가능한 범위로 계속 진행한다.
 */
export async function retrieveRelevantMemoriesWithTrace(
  userId: string,
  transcript: string,
  hints?: RetrievalHints,
  limit = 5
): Promise<{ units: RelevantMemoryUnit[]; trace: RetrievalTrace }> {
  const trace = emptyTrace(transcript, hints);
  try {
    if (!transcript || !transcript.trim() || transcript === '(음성 변환 실패)') return { units: [], trace };

    const topics = (hints?.topics ?? []).filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim());
    // 상황 문장이 원문과 똑같으면 같은 검색을 두 번 할 이유가 없다.
    const situation =
      hints?.situation && hints.situation.trim() && hints.situation.trim() !== transcript.trim() ? hints.situation.trim() : null;
    trace.queries = { raw: transcript, situation, topics };

    const { data: entities, error: entitiesError } = await supabase
      .from('entities')
      .select('id, name')
      .eq('user_id', userId)
      .limit(300);

    if (entitiesError) {
      console.error('[memoryRetrieval] entities 조회 실패 (엔티티 매칭 없이 계속):', entitiesError.message);
      trace.errors.push(`entities: ${entitiesError.message}`);
    }

    const topicSet = new Set(topics);
    const matchedEntityIds = new Set<string>(
      (entities ?? [])
        .filter(
          (e: any) => e.name && typeof e.name === 'string' && (transcript.includes(e.name) || topicSet.has(e.name))
        )
        .map((e: any) => e.id)
    );

    // 의미 검색 2개(원문 / 상황 문장)를 keyword 풀 조회와 병렬로 돌린다.
    const [simRawById, simSituationById, baseRes, entityRes] = await Promise.all([
      semanticMatches(userId, transcript, trace, 'raw'),
      semanticMatches(userId, situation, trace, 'situation'),
      selectUnits((cols) =>
        supabase
          .from('memory_units')
          .select(cols)
          .eq('user_id', userId)
          .in('status', ['open', 'resolved'])
          .order('importance', { ascending: false })
          .limit(50)
      ),
      matchedEntityIds.size > 0
        ? selectUnits((cols) =>
            supabase
              .from('memory_units')
              .select(cols)
              .eq('user_id', userId)
              .in('status', ['open', 'resolved'])
              .in('subject_entity_id', Array.from(matchedEntityIds))
              .order('created_at', { ascending: false })
              .limit(20)
          )
        : Promise.resolve({ data: [] as any[], error: null as any }),
    ]);

    if (baseRes.error) {
      console.error('[memoryRetrieval] base pool 조회 실패:', baseRes.error.message);
      trace.errors.push(`base: ${baseRes.error.message}`);
    }
    if (entityRes.error) {
      console.error('[memoryRetrieval] entity pool 조회 실패:', entityRes.error.message);
      trace.errors.push(`entity: ${entityRes.error.message}`);
    }
    const basePool: any[] = baseRes.data ?? [];
    const entityPool: any[] = entityRes.data ?? [];

    const semanticIds = Array.from(new Set([...Array.from(simRawById.keys()), ...Array.from(simSituationById.keys())]));
    let semanticPool: any[] = [];
    if (semanticIds.length > 0) {
      const { data: rows, error: rowsError } = await selectUnits((cols) =>
        supabase
          .from('memory_units')
          .select(cols)
          .eq('user_id', userId)
          .in('status', ['open', 'resolved'])
          .in('id', semanticIds)
      );
      if (rowsError) {
        console.error('[memoryRetrieval] semantic candidate 상세 조회 실패 (keyword retrieval만으로 계속):', rowsError.message);
        trace.errors.push(`semantic_rows: ${rowsError.message}`);
      } else {
        semanticPool = rows ?? [];
      }
    }

    const merged = new Map<number, any>();
    for (const m of [...basePool, ...entityPool, ...semanticPool]) merged.set(m.id, m);
    trace.pool_sizes = {
      base: basePool.length,
      entity: entityPool.length,
      semantic_raw: simRawById.size,
      semantic_situation: simSituationById.size,
      merged: merged.size,
      eligible: 0,
    };
    if (merged.size === 0) return { units: [], trace };

    const eligibleUnits = await filterConfirmedCommitments(userId, Array.from(merged.values()));
    trace.pool_sizes.eligible = eligibleUnits.length;
    if (eligibleUnits.length === 0) return { units: [], trace };

    const { ranked, droppedNoSignal } = rankMemoryCandidates(eligibleUnits, {
      retrievalTokens: buildRetrievalTokens(transcript, topics),
      matchedEntityIds,
      simRawById,
      simSituationById,
      limit,
    });
    trace.dropped_no_signal = droppedNoSignal;
    trace.candidates = ranked.map(({ m, score, reason, simRaw, simSituation }) => ({
      id: m.id,
      score: Number(score.toFixed(3)),
      sim_raw: Number(simRaw.toFixed(3)),
      sim_situation: Number(simSituation.toFixed(3)),
      reason,
    }));

    const units: RelevantMemoryUnit[] = ranked.map(({ m, score, reason }) => ({
      id: m.id,
      memory_type: m.memory_type,
      subject: m.entities?.name ?? null,
      content: m.content,
      emotion: m.emotion,
      temporal_context: m.temporal_context,
      importance: m.importance,
      status: m.status,
      stance: m.stance ?? null,
      raw_quote: m.raw_quote ?? null,
      created_at: m.created_at,
      last_referenced_at: m.last_referenced_at,
      relevanceScore: score,
      relevanceReason: reason,
    }));
    return { units, trace };
  } catch (err: any) {
    console.error('[memoryRetrieval] retrieveRelevantMemoriesWithTrace 전체 실패 (빈 배열 반환):', err?.message);
    trace.errors.push(`fatal: ${err?.message ?? 'error'}`);
    return { units: [], trace };
  }
}

// 기존 호출부 호환용 — 원문만으로 검색하고 units만 돌려준다.
export async function retrieveRelevantMemories(
  userId: string,
  transcript: string,
  limit = 5
): Promise<RelevantMemoryUnit[]> {
  const { units } = await retrieveRelevantMemoriesWithTrace(userId, transcript, undefined, limit);
  return units;
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
