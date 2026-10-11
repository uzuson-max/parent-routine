// lib/seaGrowth.ts
// ============================================================================
// 심해 성장 — "니 생각의 바다가 풍부해질수록 심해의 참견이(수달) 집도 달라진다."
// ----------------------------------------------------------------------------
// 새 AI 호출 없음. 이미 묶여 있는 "생각의 계보"(lib/lineages.ts)만 읽어서 숫자 두 개를 센다.
//   days    — 기록한 날: 의미 있는 기억이 하나라도 나온 날(한국 날짜) 수.
//             같은 날 여러 번 녹음해도 하루. 무음/환각·감정 한 줄·참견이에게 한 대답은 계보에 애초에 안 들어온다.
//   settled — 자리 잡은 생각: 서로 다른 날에 두 번 이상 다시 꺼낸 계보 수.
//             같은 날 같은 말을 여러 번(테스트·중복 녹음) 해도 안 늘어난다.
//   topics  — 계보(물고기) 수. 첫 단계에서만 쓴다.
//
// 단계는 이 숫자만으로 정해지고(같은 데이터 → 같은 단계), 서버는 "도달한 최고 단계"를 저장해서
// 데이터 조회 범위가 밀려도 절대 내려가지 않는다. 기억 회상·개입 판단은 이 파일을 읽지도 않는다.
// ============================================================================

export interface GrowthMention {
  at: number; // epoch ms
}
export interface GrowthLineage {
  mentions: GrowthMention[];
}

export interface GrowthMetrics {
  days: number;
  settled: number;
  topics: number;
}

export interface StageDef {
  stage: number;
  name: string; // 화면에 나오는 이름이 아니라 개발용 이름
  need: { days: number; settled: number; topics: number };
}

// 단계는 한 번 정하면 바꾸지 않는다(이미 도달한 사용자의 단계가 바뀌면 안 되니까). 추가만 가능.
export const STAGES: StageDef[] = [
  { stage: 0, name: '새로 이사 옴', need: { days: 0, settled: 0, topics: 0 } },
  { stage: 1, name: '다시마 싹', need: { days: 2, settled: 0, topics: 2 } },
  { stage: 2, name: '조약돌 줍기', need: { days: 5, settled: 1, topics: 0 } },
  { stage: 3, name: '다시마 숲', need: { days: 12, settled: 4, topics: 0 } },
  { stage: 4, name: '조개 정원', need: { days: 25, settled: 10, topics: 0 } },
  { stage: 5, name: '보물 굴', need: { days: 45, settled: 18, topics: 0 } },
];
export const MAX_STAGE = STAGES[STAGES.length - 1].stage;

const KST_OFFSET = 9 * 60 * 60 * 1000;
export function kstDay(at: number): string {
  return new Date(at + KST_OFFSET).toISOString().slice(0, 10);
}

export function computeMetrics(lineages: GrowthLineage[]): GrowthMetrics {
  const allDays = new Set<string>();
  let settled = 0;
  let topics = 0;
  for (const l of lineages) {
    if (!l.mentions.length) continue;
    topics++;
    const days = new Set<string>();
    for (const m of l.mentions) {
      if (!Number.isFinite(m.at)) continue;
      const d = kstDay(m.at);
      days.add(d);
      allDays.add(d);
    }
    if (days.size >= 2) settled++;
  }
  return { days: allDays.size, settled, topics };
}

/** 숫자만으로 정해지는 단계. 조건을 다 채운 가장 높은 단계(앞 단계도 채워야 함). */
export function stageFor(m: GrowthMetrics): number {
  let s = 0;
  for (const def of STAGES) {
    const n = def.need;
    if (m.days >= n.days && m.settled >= n.settled && m.topics >= n.topics) s = def.stage;
    else break;
  }
  return s;
}

export interface StoredGrowth {
  stage: number | null; // 도달한 최고 단계 (null = 아직 저장 안 됨)
  seen: number | null; // 사용자가 심해에서 확인한 단계
}

export interface ResolvedGrowth {
  stage: number;
  seen: number;
  write: boolean; // 저장값을 바꿔야 하는지
}

function clampStage(n: unknown): number | null {
  const v = Number(n);
  if (n === null || n === undefined || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(MAX_STAGE, Math.floor(v)));
}

/**
 * 계산한 단계 + 저장된 값 → 이번에 보여줄 값.
 *  - 처음(저장값 없음): 지금 단계를 "이미 본 것"으로 저장 — 기존 사용자에게 가짜 성장 연출을 하지 않는다.
 *  - 그다음부터: 단계는 올라가기만 한다. seen은 단계를 넘지 않는다.
 *  - 같은 입력으로 몇 번을 불러도 결과가 같다(멱등).
 */
export function resolveGrowth(computed: number, stored: StoredGrowth): ResolvedGrowth {
  const c = clampStage(computed) ?? 0;
  const st = clampStage(stored.stage);
  if (st === null) return { stage: c, seen: c, write: true };
  const stage = Math.max(st, c);
  const seenRaw = clampStage(stored.seen);
  const seen = Math.min(seenRaw ?? stage, stage);
  return { stage, seen, write: stage !== st || seenRaw === null };
}

/** 심해에서 참견이를 만났을 때 — seen을 올린다. 아직 도달하지 않은 단계로는 못 올린다. */
export function markSeen(stored: StoredGrowth, seenStage: number): StoredGrowth {
  const st = clampStage(stored.stage) ?? 0;
  const want = Math.min(clampStage(seenStage) ?? 0, st);
  const cur = clampStage(stored.seen) ?? 0;
  return { stage: st, seen: Math.max(cur, want) };
}
