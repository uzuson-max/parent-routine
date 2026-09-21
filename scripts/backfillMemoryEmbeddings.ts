
//
// Conversation Engine v2, STEP 2-5 — 기존 memory_units 중 embedding이 NULL인 행을 채우는
// 일회성(one-off) 작업. 서비스 runtime 코드(app/api/**)와 완전히 분리되어 있고, 일반 사용자
// 요청 경로에서는 절대 호출되지 않는다.
//
// 실행 방법 (레포 루트에서):
//   OPENAI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfillMemoryEmbeddings.ts
//
// 여러 번 실행해도 안전하다(idempotent) — 이미 embedding이 채워진 행은 매번 자동으로 건너뛴다.

import { supabase } from '../lib/supabase';
import { buildMemoryEmbeddingText, generateMemoryEmbedding } from '../lib/memoryEmbedding';

const FETCH_BATCH_SIZE = 50;
const DELAY_BETWEEN_CALLS_MS = 150;

interface BackfillTargetRow {
  id: number;
  content: string;
  memory_type: string;
  temporal_context: string | null;
  emotion: string | null;
  entities: { name: string | null } | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNextBatch(): Promise<BackfillTargetRow[]> {
  const { data, error } = await supabase
    .from('memory_units')
    .select('id, content, memory_type, temporal_context, emotion, entities(name)')
    .is('embedding', null)
    .order('id', { ascending: true })
    .limit(FETCH_BATCH_SIZE);

  if (error) {
    throw new Error(`memory_units 조회 실패: ${error.message}`);
  }
  return (data ?? []) as unknown as BackfillTargetRow[];
}

async function run() {
  console.log('[backfill] 시작 — embedding이 NULL인 memory_units를 배치로 처리합니다.');

  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  const failedIds: number[] = [];
  const attemptedIds = new Set<number>();

  while (true) {
    const batch = await fetchNextBatch();
    const remaining = batch.filter((row) => !attemptedIds.has(row.id));
    if (remaining.length === 0) break;

    for (const row of remaining) {
      attemptedIds.add(row.id);
      totalProcessed++;

      const embeddingText = buildMemoryEmbeddingText({
        content: row.content,
        memory_type: row.memory_type,
        subject: row.entities?.name ?? null,
        temporal_context: row.temporal_context,
        emotion: row.emotion,
      });

      const embedding = await generateMemoryEmbedding(embeddingText);

      if (!embedding) {
        console.error(`[backfill] memory_unit ${row.id}: embedding 생성 실패 — 건너뜀 (다음 실행에서 재시도 가능)`);
        totalFailed++;
        failedIds.push(row.id);
        await sleep(DELAY_BETWEEN_CALLS_MS);
        continue;
      }

      const { error: updateError } = await supabase
        .from('memory_units')
        .update({ embedding })
        .eq('id', row.id);

      if (updateError) {
        console.error(`[backfill] memory_unit ${row.id}: embedding 저장 실패 — ${updateError.message}`);
        totalFailed++;
        failedIds.push(row.id);
      } else {
        totalSucceeded++;
        console.log(`[backfill] memory_unit ${row.id}: embedding 저장 완료`);
      }

      await sleep(DELAY_BETWEEN_CALLS_MS);
    }
  }

  console.log('----------------------------------------');
  console.log(`[backfill] 완료 — 처리 시도 ${totalProcessed}건 / 성공 ${totalSucceeded}건 / 실패 ${totalFailed}건`);
  if (failedIds.length > 0) {
    console.log(`[backfill] 실패한 memory_unit id 목록 (embedding 계속 NULL, 다음 실행에서 재시도됨): ${failedIds.join(', ')}`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill] 전체 실행 실패:', err?.message ?? err);
    process.exit(1);
  });
