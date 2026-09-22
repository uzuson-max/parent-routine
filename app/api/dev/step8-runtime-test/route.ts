
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateResponse } from '@/lib/responseEngine';
import { STEP8_SCENARIOS } from './scenarios';

// 개발 전용 harness다. 프로덕션에 실수로 열려 있으면 안 되므로 명시적으로 막아둔다.
// 로컬에서 `npm run dev`로 돌릴 때만 동작한다.
function assertDevOnly() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('STEP 8 harness는 production에서 실행할 수 없습니다.');
  }
}

export async function GET() {
  assertDevOnly();
  return NextResponse.json({
    scenarios: STEP8_SCENARIOS.map((s) => ({ id: s.id, label: s.label, transcript: s.transcript })),
    usage: 'POST { "userId": "<실제 존재하는 테스트용 user_id>", "only": ["A","D"] (선택) }',
  });
}

export async function POST(request: Request) {
  assertDevOnly();

  const body = await request.json().catch(() => ({}));
  const userId: string | undefined = body.userId;
  const only: string[] | undefined = Array.isArray(body.only) ? body.only : undefined;

  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'userId가 필요합니다 (voice_entries.user_id로 쓸 수 있는 실제 테스트 계정 id).' },
      { status: 400 }
    );
  }

  const scenarios = only ? STEP8_SCENARIOS.filter((s) => only.includes(s.id)) : STEP8_SCENARIOS;
  const results: any[] = [];

  for (const scenario of scenarios) {
    console.log(`\n[STEP8] ==== 시나리오 ${scenario.id} — ${scenario.label} ====`);

    let seededEntryId: string | null = null;

    try {
      // D처럼 "직전 턴"이 실제로 DB에 있어야 하는 시나리오는, generateResponse()가 내부에서 조회하는
      // voice_entries에 그 턴을 먼저 심어둔다. 이 fixture row는 테스트가 끝나면 반드시 지운다.
      if (scenario.seedPreviousTurn) {
        const createdAt = new Date(Date.now() - scenario.seedPreviousTurn.minutesAgo * 60 * 1000).toISOString();
        const { data: seeded, error: seedError } = await supabase
          .from('voice_entries')
          .insert({
            user_id: userId,
            transcript: scenario.seedPreviousTurn.transcript,
            call_message: scenario.seedPreviousTurn.callMessage,
            response: {
              response_strategy: 'MEMORY_REFERENCE',
              memory_unit_id_used: scenario.seedPreviousTurn.memoryUnitIdUsed,
              insight_id_used: null,
            },
            call_state: 'no_action',
            created_at: createdAt,
          })
          .select('id')
          .single();

        if (seedError || !seeded) {
          throw new Error(
            `시나리오 ${scenario.id} fixture seed 실패 — voice_entries 테이블의 실제 컬럼/제약조건을 확인해야 할 수 있습니다: ${seedError?.message}`
          );
        }
        seededEntryId = seeded.id;
      }

      // 이 테스트 실행 자체를 위한 새 entry id. 실제 row를 만들 필요는 없다 —
      // fetchRecentTurns()는 .neq('id', excludeEntryId)로 제외만 하지, 그 id가 실제로 존재해야 하는 건 아니다.
      const testEntryId = crypto.randomUUID();

      const start = Date.now();
      const result = await generateResponse(
        scenario.transcript,
        scenario.analysis,
        userId,
        testEntryId,
        scenario.memoryCandidates,
        scenario.existingCommitments,
        scenario.relevantMemoryUnits,
        scenario.relevantInsights,
        scenario.initialTopic
      );
      const elapsedMs = Date.now() - start;

      const checks = scenario.check(result);
      const allPass = checks.every((c) => c.pass);

      console.log(`  transcript: ${scenario.transcript}`);
      console.log(`  response_strategy=${result.response_strategy} channel=${result.channel}`);
      console.log(`  response: ${result.response}`);
      console.log(`  memory_relevance=${JSON.stringify(result.memory_relevance)}`);
      console.log(`  conversation_opportunity=${JSON.stringify(result.conversation_opportunity)}`);
      console.log(`  memory_unit_id_used=${result.memory_unit_id_used} insight_id_used=${result.insight_id_used}`);
      console.log(
        `  validation_passed=${result.validation_passed} regeneration_count=${result.regeneration_count} fallback_used=${result.fallback_used} validation_failure_reason=${result.validation_failure_reason}`
      );
      console.log(`  closes_conversation=${result.closes_conversation} repeated_memory_detected=${result.repeated_memory_detected}`);
      checks.forEach((c) => console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.label} — ${c.detail}`));

      results.push({
        id: scenario.id,
        label: scenario.label,
        transcript: scenario.transcript,
        elapsedMs,
        result,
        structuralChecks: checks,
        structuralPass: allPass,
      });
    } catch (err: any) {
      console.error(`[STEP8] 시나리오 ${scenario.id} 실행 중 오류:`, err?.message);
      results.push({ id: scenario.id, label: scenario.label, error: err?.message ?? String(err) });
    } finally {
      if (seededEntryId) {
        await supabase.from('voice_entries').delete().eq('id', seededEntryId);
      }
    }
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    scenarioCount: results.length,
    results,
  });
}
