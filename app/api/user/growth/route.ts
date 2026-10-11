// app/api/user/growth/route.ts
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { loadLineages } from '@/lib/lineages';
import { computeMetrics, markSeen, resolveGrowth, stageFor, type StoredGrowth } from '@/lib/seaGrowth';

export const dynamic = 'force-dynamic';

// ============================================================================
// 심해 성장 단계 — 규칙은 lib/seaGrowth.ts.
//   GET  → { stage, seen, persisted }   (stage > seen 이면 아직 심해에서 못 본 변화가 있다)
//   POST { seen } → 심해에서 참견이를 만났다고 기록
// user_memory.sea_stage / sea_stage_seen 두 칸에만 쓴다. 기록·기억 데이터는 읽기만 한다.
// 컬럼이 아직 없으면(SQL 실행 전) 계산만 해서 돌려주고 persisted:false — 화면은 기기에 기억한다.
// 이 API가 실패해도 녹음·대답·기억 회상과는 아무 상관이 없다.
// ============================================================================

function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42703' || /column .* does not exist/i.test(err.message ?? '') || /schema cache/i.test(err.message ?? '');
}

async function readStored(userId: string): Promise<{ stored: StoredGrowth; persisted: boolean }> {
  const { data, error } = await supabase
    .from('user_memory')
    .select('sea_stage, sea_stage_seen')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return { stored: { stage: null, seen: null }, persisted: false };
    throw new Error(error.message);
  }
  return {
    stored: { stage: (data as any)?.sea_stage ?? null, seen: (data as any)?.sea_stage_seen ?? null },
    persisted: true,
  };
}

async function writeStored(userId: string, s: StoredGrowth): Promise<boolean> {
  const { error } = await supabase
    .from('user_memory')
    .upsert({ user_id: userId, sea_stage: s.stage, sea_stage_seen: s.seen }, { onConflict: 'user_id' });
  if (error) {
    console.error('[growth] 저장 실패:', error.message);
    return false;
  }
  return true;
}

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });

    const [{ lineages }, storedRes] = await Promise.all([loadLineages(userId), readStored(userId)]);
    const metrics = computeMetrics(lineages);
    const computed = stageFor(metrics);

    if (!storedRes.persisted) {
      return NextResponse.json({ success: true, data: { stage: computed, seen: null, persisted: false, metrics } });
    }
    const r = resolveGrowth(computed, storedRes.stored);
    let persisted = true;
    if (r.write) persisted = await writeStored(userId, { stage: r.stage, seen: r.seen });
    return NextResponse.json({ success: true, data: { stage: r.stage, seen: r.seen, persisted, metrics } });
  } catch (e: any) {
    console.error('[growth] GET 실패:', e?.message);
    return NextResponse.json({ success: false, error: '성장 상태를 못 읽었어.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const want = Number(body?.seen);
    if (!Number.isFinite(want)) return NextResponse.json({ success: false, error: 'seen 값이 필요해.' }, { status: 400 });

    const { stored, persisted } = await readStored(userId);
    if (!persisted || stored.stage === null) {
      return NextResponse.json({ success: true, data: { persisted: false } });
    }
    const next = markSeen(stored, want);
    if (next.seen !== stored.seen) await writeStored(userId, next);
    return NextResponse.json({ success: true, data: { stage: next.stage, seen: next.seen, persisted: true } });
  } catch (e: any) {
    console.error('[growth] POST 실패:', e?.message);
    return NextResponse.json({ success: false, error: '기록 못 했어.' }, { status: 500 });
  }
}
