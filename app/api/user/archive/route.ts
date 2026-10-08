// app/api/user/archive/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { loadLineages } from '@/lib/lineages';
import { looksLikeNoSpeech } from '@/lib/noSpeech';

export const dynamic = 'force-dynamic';

// ============================================================================
// 지난 어항 — 달마다 찍어둔 어항 사진.
// ----------------------------------------------------------------------------
// 따로 스냅샷 테이블을 두지 않고, 계보(lib/lineages.ts)의 언급 시각으로 그 달의 어항을 다시 그린다.
// 그 달에 언급된 계보만 그 달 어항에 있고, 크기는 그 달에 몇 번 말했는지로 정한다
// (1번 = 치어, 2~3번 = 금붕어, 4번 이상 = 큰 금붕어).
// 달 경계는 KST 기준 (monthlyReflectionEngine과 같은 전제 — 사용자별 timezone 컬럼이 없다).
// 월말 정산(monthly_reflections, status='generated')이 있으면 그 달 사진 밑에 같이 붙인다.
// 그 달에 한 말 전부(대답 녹음 포함)도 원문 그대로 내려준다 — "내 말이 다 어디 있지?"에 대한 답.
// ============================================================================

const KST = 9 * 60 * 60 * 1000;
const MAX_FISH_PER_MONTH = 10;

function monthKeyKst(at: number): string {
  const d = new Date(at + KST);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    const [{ lineages }, entriesRes, reflRes] = await Promise.all([
      loadLineages(userId),
      supabase
        .from('voice_entries')
        .select('id, transcript, response, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(800),
      supabase
        .from('monthly_reflections')
        .select('period_start, content, status')
        .eq('user_id', userId)
        .eq('status', 'generated'),
    ]);

    if (entriesRes.error) throw new Error(`voice_entries 조회 실패: ${entriesRes.error.message}`);
    if (reflRes.error) console.error('[api/user/archive] monthly_reflections 조회 실패 (정산 없이 계속):', reflRes.error.message);

    type Month = {
      month: string;
      fish: { id: string; stage: 1 | 2 | 3; count: number; quotes: { text: string; at: string }[] }[];
      reflection: string | null;
      entries: { id: string; at: string; transcript: string; responseText: string | null }[];
    };
    const months = new Map<string, Month>();
    const getMonth = (key: string): Month => {
      if (!months.has(key)) months.set(key, { month: key, fish: [], reflection: null, entries: [] });
      return months.get(key)!;
    };

    // 그 달에 한 말 전부 (받아쓰기 실패/무음 환각만 뺀다)
    for (const row of entriesRes.data ?? []) {
      const t = row.transcript as string | null;
      if (!t || t === '(음성 변환 실패)') continue;
      const resp = row.response as any;
      if (resp?.speech_confirmed !== true && looksLikeNoSpeech(t, undefined)) continue;
      const at = new Date(row.created_at as string).getTime();
      getMonth(monthKeyKst(at)).entries.push({
        id: String(row.id),
        at: new Date(at).toISOString(),
        transcript: t,
        responseText: resp?.response ?? null,
      });
    }

    // 그 달의 물고기
    for (const l of lineages) {
      const byMonth = new Map<string, typeof l.mentions>();
      for (const m of l.mentions) {
        const key = monthKeyKst(m.at);
        if (!byMonth.has(key)) byMonth.set(key, []);
        byMonth.get(key)!.push(m);
      }
      byMonth.forEach((ms, key) => {
        const count = ms.length;
        const stage: 1 | 2 | 3 = count >= 4 ? 3 : count >= 2 ? 2 : 1;
        getMonth(key).fish.push({
          id: l.id,
          stage,
          count,
          quotes: ms.slice(0, 5).map((m) => ({ text: m.quote, at: new Date(m.at).toISOString() })),
        });
      });
    }

    for (const r of reflRes.data ?? []) {
      const key = String(r.period_start).slice(0, 7);
      if (r.content) getMonth(key).reflection = r.content as string;
    }

    const data = Array.from(months.values())
      .sort((a, b) => (a.month < b.month ? 1 : -1))
      .map((m) => ({
        ...m,
        // 그 달에 많이 말한 계보부터, 화면이 복잡해지지 않게 상한
        fish: m.fish
          .sort((a, b) => b.count - a.count)
          .slice(0, MAX_FISH_PER_MONTH)
          .map(({ count, ...rest }) => rest),
      }));

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('[api/user/archive] 서버 에러:', err?.message ?? err);
    return NextResponse.json({ success: false, error: '지난 어항을 불러오지 못했어.' }, { status: 500 });
  }
}
