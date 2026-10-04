
//
// P0 검증 스크립트 — "과거 생각 하나를 현재 상황과 정확히 연결해서 꺼내기" (2026-10-04)
// DB 읽기/쓰기 없음. 테스트용 기억은 이 파일 안의 고정 목록(FIXTURE)이고, 임베딩도 메모리 안에서만 만든다.
//
// 실행 (PowerShell, 프로젝트 폴더에서) — OPENAI_API_KEY는 .env.local에서 자동으로 읽는다:
//   npx.cmd tsx scripts/eval-memory-connection.ts            (케이스당 3회)
//   npx.cmd tsx scripts/eval-memory-connection.ts 1          (케이스당 1회, 빠른 확인)
//
// 각 회차마다:
//   1) analyzeTranscriptOnly() — 운영과 같은 분석 프롬프트 (retrieval_situation / retrieval_topics 포함)
//   2) 검색 — BEFORE(원문 검색어만 + 불용어 없음, 예전 점수 로직) / AFTER(원문+상황 문장, 주제어, 불용어, rankMemoryCandidates)
//      운영 RPC(match_memory_units, threshold 0, 상위 15개)를 같은 방식으로 흉내 낸다(코사인 유사도 상위 15개).
//   3) generateResponseCore() — AFTER 후보로 운영과 같은 응답 생성 → 검증 → 재생성/수정 → fallback
// 결과: eval-memory-connection-<timestamp>.json + 콘솔 요약 표
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { buildMemoryEmbeddingText, generateMemoryEmbedding } from '../lib/memoryEmbedding';
import { buildRetrievalTokens, rankMemoryCandidates, tokenize } from '../lib/memoryRetrieval';
import type { RelevantMemoryUnit } from '../lib/memoryRetrieval';

// .env.local에 있는 값 중 아직 환경변수로 안 잡힌 것만 채운다 (키 값은 출력하지 않는다).
function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvLocal();

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();
const SEMANTIC_TOP_K = 15; // 운영 SEMANTIC_CANDIDATE_LIMIT과 동일
const LIMIT = 5;

interface FixtureMemory {
  id: number;
  memory_type: string;
  subject: string | null;
  content: string;
  raw_quote: string | null;
  temporal_context: string | null;
  emotion: string | null;
  importance: number;
  retention: 'permanent' | 'temporary' | 'contextual';
  status: 'open' | 'resolved';
  stance: 'positive' | 'negative' | 'neutral' | 'uncertain' | null;
  created_at: string;
}

function mem(
  id: number,
  memory_type: string,
  subject: string | null,
  content: string,
  days: number,
  extra: Partial<FixtureMemory> = {}
): FixtureMemory {
  return {
    id,
    memory_type,
    subject,
    content,
    raw_quote: null,
    temporal_context: null,
    emotion: null,
    importance: 0.6,
    retention: 'temporary',
    status: 'open',
    stance: null,
    created_at: daysAgo(days),
    ...extra,
  };
}

// ---- 방해 기억 (모든 케이스에 공통으로 들어간다) ----
const DISTRACTORS: FixtureMemory[] = [
  mem(1, 'preference', '라면', '크림라면을 좋아한다고 했다', 25, { retention: 'permanent' }),
  mem(2, 'event', '고양이', '고양이가 소파를 다 긁어놨다', 6),
  mem(3, 'concern', '잠', '요즘 잠을 잘 못 잔다고 했다', 9),
  mem(4, 'event', '친구', '친구 생일 선물로 향수를 샀다', 15),
  mem(5, 'thought', '넷플릭스', '넷플릭스 드라마를 정주행하고 싶다고 했다', 4),
  mem(6, 'event', '엄마', '엄마랑 통화하다가 말다툼을 했다', 18),
  mem(7, 'preference', '카페', '비 오는 날 카페 가는 걸 좋아한다고 했다', 27, { retention: 'permanent' }),
  mem(8, 'event', '지하철', '출근길 지하철이 너무 붐벼서 힘들었다', 3),
  mem(9, 'concern', '카드값', '카드값이 많이 나와서 걱정이라고 했다', 11),
  mem(10, 'event', '팀장님', '팀장님한테 보고서 지적을 받았다', 8),
  mem(11, 'interest', '일본어', '일본어 공부를 다시 해보고 싶다고 했다', 20),
  mem(12, 'event', '동생', '동생이 이사를 했다', 13),
  mem(13, 'preference', '아메리카노', '아메리카노를 하루에 두 잔 마신다고 했다', 22, { retention: 'permanent' }),
  mem(14, 'thought', '자전거', '주말에 한강에서 자전거 타고 싶다고 했다', 5),
];

// ---- 케이스별 기억 ----
const M_JEJU = mem(101, 'interest', '제주도', '회사를 그만두면 제주도에서 한 달 살아보고 싶다고 했다', 21, {
  raw_quote: '회사 그만두면 제주도 한 달 살아보고 싶다',
  importance: 0.7,
});
const M_WORKOUT = mem(102, 'thought', '운동', '운동을 다시 시작해야겠다고 했다', 14, { raw_quote: '운동 다시 시작해야겠다' });
const M_PLANT_FUN = mem(103, 'interest', '식물', '요즘 식물 키우는 게 재밌다고 했다', 10, { raw_quote: '요즘 식물 키우는 게 재밌다' });
const M_PLANT_WANT = mem(104, 'interest', '식물', '식물을 제대로 키워보고 싶다고 했다', 30, { raw_quote: '식물 좀 제대로 키워보고 싶다' });
const M_JEJU_NEG = mem(105, 'preference', '제주도', '제주도는 가기 싫다고 했다', 12, {
  stance: 'negative',
  raw_quote: '제주도는 가기 싫어',
});
const M_INTERVIEW = mem(106, 'event', '이직 면접', '이직 면접을 봤다', 21, { temporal_context: '오늘', raw_quote: '오늘 이직 면접 봤어' });

type CaseKind = 'PASS' | 'FAIL' | 'SAME_TOPIC' | 'NEGATIVE' | 'TIME' | 'CONTINUATION';

interface EvalCase {
  no: number;
  kind: CaseKind;
  label: string;
  transcript: string;
  memories: FixtureMemory[];
  target?: number; // 후보에 들어와야 하는 기억
  forbiddenCandidate?: number; // 후보에 들어오면 안 되는 기억
  forbiddenUse?: number[]; // 응답에 쓰이면 안 되는 기억
  mustRankBelowTarget?: number; // target보다 순위가 낮아야(또는 없어야) 하는 기억
  violation?: RegExp; // 응답에 나오면 안 되는 문장 패턴
}

const CASES: EvalCase[] = [
  { no: 1, kind: 'PASS', label: '퇴사 ↔ 제주도 한 달 살기', transcript: '나 진짜 회사 그만두고 싶다.', memories: [M_JEJU], target: 101 },
  { no: 2, kind: 'PASS', label: '표현 다름: 출근하기 싫다', transcript: '출근하기 싫어 죽겠다.', memories: [M_JEJU], target: 101 },
  { no: 3, kind: 'PASS', label: '몸 굳음 ↔ 운동 재시작', transcript: '요즘 몸이 너무 굳은 것 같다.', memories: [M_WORKOUT], target: 102 },
  { no: 4, kind: 'FAIL', label: '점심 메뉴 ↔ 제주도', transcript: '오늘 점심 뭐 먹지?', memories: [M_JEJU], forbiddenCandidate: 101, forbiddenUse: [101] },
  { no: 5, kind: 'FAIL', label: '회의 ↔ 식물', transcript: '회사에서 회의했다.', memories: [M_PLANT_FUN], forbiddenCandidate: 103, forbiddenUse: [103] },
  {
    no: 6,
    kind: 'FAIL',
    label: '흔한 단어("싶다") 잡음',
    transcript: '아 회사 그만두고 싶다.',
    memories: [M_JEJU, M_PLANT_WANT],
    target: 101,
    forbiddenUse: [104, 11, 14, 5],
    mustRankBelowTarget: 104,
  },
  { no: 7, kind: 'SAME_TOPIC', label: '식물 물 줌 ↔ 식물 재밌다', transcript: '오늘 식물 물 줬다.', memories: [M_PLANT_FUN] },
  {
    no: 8,
    kind: 'NEGATIVE',
    label: '휴가지 ↔ 제주도 싫다',
    transcript: '휴가 어디 가지?',
    memories: [M_JEJU_NEG],
    violation: /제주.{0,15}(가고\s*싶|가보고\s*싶|살아보고\s*싶|좋아했|끌린다|끌렸)/,
  },
  {
    no: 9,
    kind: 'TIME',
    label: '3주 전 "오늘 면접" ↔ 퇴사 고민',
    transcript: '회사 그만둘까 고민 중이야.',
    memories: [M_INTERVIEW],
    target: 106,
    violation: /오늘.{0,10}면접|면접.{0,10}오늘/,
  },
  { no: 10, kind: 'CONTINUATION', label: '식물 키워보고 싶다 → 140포트', transcript: '이제 식물 140포트 됐다.', memories: [M_PLANT_WANT], target: 104 },
];

// ---- 임베딩 / 유사도 ----
const embeddingCache = new Map<string, number[]>();
async function embed(text: string): Promise<number[] | null> {
  const cached = embeddingCache.get(text);
  if (cached) return cached;
  const v = await generateMemoryEmbedding(text);
  if (v) embeddingCache.set(text, v);
  return v;
}
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
async function memoryEmbedding(m: FixtureMemory): Promise<number[] | null> {
  return embed(
    buildMemoryEmbeddingText({
      content: m.content,
      memory_type: m.memory_type,
      subject: m.subject,
      temporal_context: m.temporal_context,
      emotion: m.emotion,
    })
  );
}
// 운영 RPC(match_memory_units)와 같은 방식: 유사도 내림차순 상위 K개 (threshold 0).
async function semanticTopK(query: string | null, pool: FixtureMemory[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!query || !query.trim()) return out;
  const q = await embed(query);
  if (!q) return out;
  const sims: { id: number; sim: number }[] = [];
  for (const m of pool) {
    const e = await memoryEmbedding(m);
    if (e) sims.push({ id: m.id, sim: cosine(q, e) });
  }
  sims.sort((a, b) => b.sim - a.sim);
  for (const s of sims.slice(0, SEMANTIC_TOP_K)) out.set(s.id, s.sim);
  return out;
}

// ---- BEFORE: P0 이전 점수 로직 그대로 (원문 토큰, 불용어 없음, 의미 검색은 원문만) ----
function legacyRank(pool: FixtureMemory[], transcript: string, matchedEntityIds: Set<string>, simRaw: Map<number, number>) {
  const transcriptTokens = new Set(tokenize(transcript));
  const scored = pool.map((m) => {
    let score = 0;
    let hasSignal = false;
    if (m.subject && matchedEntityIds.has(m.subject)) {
      score += 5;
      hasSignal = true;
    }
    const contentTokens = tokenize(m.content);
    const exact = new Set(contentTokens.filter((t) => transcriptTokens.has(t)));
    if (exact.size > 0) {
      score += exact.size;
      hasSignal = true;
    }
    const partial = new Set<string>();
    for (const ct of contentTokens) {
      if (exact.has(ct)) continue;
      for (const tt of Array.from(transcriptTokens)) {
        if (tt.length >= 2 && ct.length >= 2 && (ct.includes(tt) || tt.includes(ct))) partial.add(`${ct}~${tt}`);
      }
    }
    if (partial.size > 0) {
      score += partial.size * 0.5;
      hasSignal = true;
    }
    score += m.importance;
    if (m.retention === 'permanent') score += 0.5;
    const sim = simRaw.get(m.id) ?? 0;
    if (sim > 0) {
      score += sim * 4;
      if (sim >= 0.35) hasSignal = true;
    }
    if (m.status === 'open') score += 0.3;
    const daysSince = (NOW - new Date(m.created_at).getTime()) / DAY;
    score += Math.max(0, 1 - daysSince / 30) * 0.5;
    return { id: m.id, score, hasSignal };
  });
  return scored
    .filter((s) => s.hasSignal)
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT)
    .map((s) => s.id);
}

function toRelevantUnit(m: FixtureMemory, score: number, reason: string): RelevantMemoryUnit {
  return {
    id: m.id,
    memory_type: m.memory_type,
    subject: m.subject,
    content: m.content,
    emotion: m.emotion,
    temporal_context: m.temporal_context,
    importance: m.importance,
    status: m.status,
    created_at: m.created_at,
    last_referenced_at: null,
    relevanceScore: score,
    relevanceReason: reason,
    stance: m.stance,
    raw_quote: m.raw_quote,
  };
}

interface RunRecord {
  case_no: number;
  run: number;
  transcript: string;
  situation: string | null;
  topics: string[];
  before_candidates: number[];
  after_candidates: { id: number; score: number; sim_raw: number; sim_situation: number; reason: string }[];
  dropped_no_signal: number;
  target_in_before: boolean | null;
  target_in_after: boolean | null;
  forbidden_in_after: boolean | null;
  rank_order_ok: boolean | null;
  memory_unit_id_used: number | null;
  relations: { memory_unit_id: number; relevance: string; relation?: string }[];
  forbidden_used: boolean;
  violation: boolean;
  response: string;
  validation_failure_reason: string | null;
  fallback_used: boolean;
}

async function runCase(c: EvalCase, run: number, analyzeTranscriptOnly: any, generateResponseCore: any): Promise<RunRecord> {
  const pool = [...DISTRACTORS, ...c.memories];
  const analysis = await analyzeTranscriptOnly(c.transcript);
  const situation: string | null = analysis?.retrieval_situation ?? null;
  const topics: string[] = Array.isArray(analysis?.retrieval_topics) ? analysis.retrieval_topics : [];

  // 엔티티 = 기억의 subject 문자열 (운영의 entities.name과 같은 역할)
  const subjects = Array.from(new Set(pool.map((m) => m.subject).filter((s): s is string => !!s)));
  const legacyEntities = new Set(subjects.filter((s) => c.transcript.includes(s)));
  const topicSet = new Set(topics);
  const afterEntities = new Set(subjects.filter((s) => c.transcript.includes(s) || topicSet.has(s)));

  const simRaw = await semanticTopK(c.transcript, pool);
  const simSituation = await semanticTopK(situation && situation.trim() !== c.transcript.trim() ? situation : null, pool);

  const before = legacyRank(pool, c.transcript, legacyEntities, simRaw);

  // AFTER — 운영과 같은 순수 함수. subject_entity_id 자리에 subject 문자열을 넣는다.
  const rankable = pool.map((m) => ({ ...m, subject_entity_id: m.subject, reference_count: 0, last_referenced_at: null }));
  const { ranked, droppedNoSignal } = rankMemoryCandidates(rankable, {
    retrievalTokens: buildRetrievalTokens(c.transcript, topics),
    matchedEntityIds: afterEntities,
    simRawById: simRaw,
    simSituationById: simSituation,
    limit: LIMIT,
    now: NOW,
  });
  const afterIds = ranked.map((r) => r.m.id);
  const relevantMemoryUnits = ranked.map((r) => toRelevantUnit(r.m, r.score, r.reason));

  const result = await generateResponseCore({
    transcript: c.transcript,
    analysis,
    memoryCandidates: [],
    existingCommitments: [],
    relevantMemoryUnits,
    relevantInsights: [],
    relationshipLevel: 3,
    nickname: null,
    callAllowed: false,
    recentTurns: [],
  });

  const used: number | null = result.memory_unit_id_used ?? null;
  const targetIdx = c.target != null ? afterIds.indexOf(c.target) : -1;
  const belowIdx = c.mustRankBelowTarget != null ? afterIds.indexOf(c.mustRankBelowTarget) : -1;

  return {
    case_no: c.no,
    run,
    transcript: c.transcript,
    situation,
    topics,
    before_candidates: before,
    after_candidates: ranked.map((r) => ({
      id: r.m.id,
      score: Number(r.score.toFixed(3)),
      sim_raw: Number(r.simRaw.toFixed(3)),
      sim_situation: Number(r.simSituation.toFixed(3)),
      reason: r.reason,
    })),
    dropped_no_signal: droppedNoSignal,
    target_in_before: c.target != null ? before.includes(c.target) : null,
    target_in_after: c.target != null ? afterIds.includes(c.target) : null,
    forbidden_in_after: c.forbiddenCandidate != null ? afterIds.includes(c.forbiddenCandidate) : null,
    rank_order_ok: c.mustRankBelowTarget != null ? targetIdx >= 0 && (belowIdx === -1 || belowIdx > targetIdx) : null,
    memory_unit_id_used: used,
    relations: (result.memory_relevance ?? []).map((r: any) => ({
      memory_unit_id: r.memory_unit_id,
      relevance: r.relevance,
      relation: r.relation,
    })),
    forbidden_used: used != null && (c.forbiddenUse ?? []).includes(used),
    violation: c.violation ? c.violation.test(result.response ?? '') : false,
    response: result.response,
    validation_failure_reason: result.validation_failure_reason ?? null,
    fallback_used: !!result.fallback_used,
  };
}

function pct(n: number, d: number): string {
  return d === 0 ? '-' : `${n}/${d} (${Math.round((n / d) * 100)}%)`;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY가 없습니다. .env.local에 OPENAI_API_KEY=sk-... 줄이 있는지 확인하세요.');
    process.exit(1);
  }
  const repeat = Math.max(1, Number(process.argv[2] ?? 3) || 3);
  const { analyzeTranscriptOnly } = await import('../lib/analysis');
  const { generateResponseCore } = await import('../lib/responseEngine');

  const records: RunRecord[] = [];
  for (const c of CASES) {
    for (let run = 1; run <= repeat; run++) {
      process.stdout.write(`case ${c.no} run ${run}/${repeat} ... `);
      try {
        const r = await runCase(c, run, analyzeTranscriptOnly, generateResponseCore);
        records.push(r);
        console.log(
          `after=[${r.after_candidates.map((x) => x.id).join(',')}] used=${r.memory_unit_id_used ?? '-'} → ${r.response}`
        );
      } catch (err: any) {
        console.log(`ERROR ${err?.message ?? err}`);
      }
    }
  }

  // ---- 요약 ----
  console.log('\n===== 케이스별 요약 =====');
  console.log('no | 유형 | 케이스 | 후보 포함(BEFORE) | 후보 포함(AFTER) | 금지 후보 포함(AFTER) | 기억 사용 | 금지 사용 | 문장 위반');
  for (const c of CASES) {
    const rs = records.filter((r) => r.case_no === c.no);
    const n = rs.length;
    const tb = rs.filter((r) => r.target_in_before).length;
    const ta = rs.filter((r) => r.target_in_after).length;
    const fa = rs.filter((r) => r.forbidden_in_after).length;
    const usedAny = rs.filter((r) => r.memory_unit_id_used != null).length;
    const fu = rs.filter((r) => r.forbidden_used).length;
    const vi = rs.filter((r) => r.violation).length;
    console.log(
      `${c.no} | ${c.kind} | ${c.label} | ${c.target != null ? pct(tb, n) : '-'} | ${c.target != null ? pct(ta, n) : '-'} | ${
        c.forbiddenCandidate != null ? pct(fa, n) : '-'
      } | ${pct(usedAny, n)} | ${c.forbiddenUse ? pct(fu, n) : '-'} | ${c.violation ? pct(vi, n) : '-'}`
    );
  }

  // ---- 통과 기준 ----
  const byKind = (kinds: CaseKind[]) => records.filter((r) => kinds.includes(CASES.find((c) => c.no === r.case_no)!.kind));
  const passLike = records.filter((r) => r.target_in_after !== null && [1, 2, 3, 9, 10].includes(r.case_no));
  const passRecallAfter = passLike.filter((r) => r.target_in_after).length;
  const passRecallBefore = passLike.filter((r) => r.target_in_before).length;
  const failRuns = records.filter((r) => [4, 5].includes(r.case_no));
  const failCand = failRuns.filter((r) => r.forbidden_in_after).length;
  const failUse = records.filter((r) => [4, 5, 6].includes(r.case_no) && r.forbidden_used).length;
  const case6Order = records.filter((r) => r.case_no === 6);
  const case6OrderOk = case6Order.filter((r) => r.rank_order_ok).length;
  const sameTopic = records.filter((r) => r.case_no === 7);
  const sameTopicUsed = sameTopic.filter((r) => r.memory_unit_id_used != null).length;
  const violations = byKind(['NEGATIVE', 'TIME']).filter((r) => r.violation).length;
  const case1 = records.filter((r) => r.case_no === 1);
  const case1Used = case1.filter((r) => r.memory_unit_id_used === 101).length;

  const criteria = [
    { name: 'PASS 케이스 후보 포함률 ≥ 90% (AFTER)', value: pct(passRecallAfter, passLike.length), ok: passLike.length > 0 && passRecallAfter / passLike.length >= 0.9 },
    { name: '  (참고) 같은 케이스 BEFORE', value: pct(passRecallBefore, passLike.length), ok: null },
    { name: 'FAIL 케이스 금지 후보 포함률 ≤ 10% (AFTER)', value: pct(failCand, failRuns.length), ok: failRuns.length > 0 && failCand / failRuns.length <= 0.1 },
    { name: 'FAIL 케이스 금지 기억 사용 = 0', value: String(failUse), ok: failUse === 0 },
    { name: '6번: 식물 기억이 제주도 기억보다 순위 낮음', value: pct(case6OrderOk, case6Order.length), ok: case6Order.length > 0 && case6OrderOk === case6Order.length },
    { name: '7번 SAME TOPIC 기억 사용 ≤ 1/3', value: pct(sameTopicUsed, sameTopic.length), ok: sameTopic.length > 0 && sameTopicUsed / sameTopic.length <= 1 / 3 },
    { name: '8·9번 문장 위반 = 0', value: String(violations), ok: violations === 0 },
    { name: '  (참고) 1번 실제로 제주도 기억을 꺼낸 비율', value: pct(case1Used, case1.length), ok: null },
  ];
  console.log('\n===== 통과 기준 =====');
  for (const c of criteria) console.log(`${c.ok === null ? '  ·' : c.ok ? 'PASS' : 'FAIL'} ${c.name}: ${c.value}`);

  const file = `eval-memory-connection-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify({ repeat, criteria, records }, null, 2), 'utf-8');
  console.log(`\n결과 저장: ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
