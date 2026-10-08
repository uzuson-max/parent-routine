// app/api/user/tank/route.ts
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { loadLineages } from '@/lib/lineages';

export const dynamic = 'force-dynamic';

// ============================================================================
// 홈 어항 — 지금 살아 있는 "생각의 계보"들. 묶는 방법은 lib/lineages.ts.
//
// 크기(stage): 최근 30일 언급을 크게, 그 이전 언급은 조금만 쳐서 1(치어)~3(큰 금붕어).
// 위치(state): 마지막 언급이 14일 이내면 헤엄(swim), 45일 이내면 바닥 근처(deep),
//              그보다 오래되면 수초 뒤에 숨음(hidden). 죽거나 사라지지 않는다.
// 귀환(returned): 3주 넘게 조용하다가 최근 3일 안에 다시 언급된 계보.
// 화면이 복잡해지지 않게 헤엄/바닥 계보는 최대 8개, 숨은 계보는 최대 3개만 내려준다.
// ============================================================================

const DAY = 24 * 60 * 60 * 1000;
const MAX_VISIBLE = 8;
const MAX_HIDDEN = 3;

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    const { lineages: raw } = await loadLineages(userId);
    const now = Date.now();

    const lineages = raw.map((l) => {
      const times = l.mentions.map((m) => m.at);
      const last = times[0];
      const recent = times.filter((t) => now - t <= 30 * DAY).length;
      const score = recent + (times.length - recent) * 0.3;
      const stage = score >= 5 ? 3 : score >= 2 ? 2 : 1;
      const daysSince = (now - last) / DAY;
      const state = daysSince <= 14 ? 'swim' : daysSince <= 45 ? 'deep' : 'hidden';
      const returned = times.length >= 2 && now - times[0] <= 3 * DAY && times[0] - times[1] >= 21 * DAY;
      return {
        id: l.id,
        stage,
        state,
        score,
        label: l.label,
        lastAt: new Date(last).toISOString(),
        returned,
        unitIds: l.unitIds,
        entryIds: l.mentions.map((m) => m.entryId),
        quotes: l.mentions.slice(0, 5).map((m) => ({ text: m.quote, at: new Date(m.at).toISOString() })),
      };
    });

    // 방금(48시간 안) 말한 계보는 점수가 낮아도 먼저 자리를 준다 — 말했는데 어항이 그대로면 흐름이 끊긴다.
    const fresh = (l: (typeof lineages)[number]) => now - new Date(l.lastAt).getTime() <= 2 * DAY;
    const visible = lineages
      .filter((l) => l.state !== 'hidden')
      .sort((a, b) => Number(fresh(b)) - Number(fresh(a)) || b.score - a.score)
      .slice(0, MAX_VISIBLE);
    const hidden = lineages
      .filter((l) => l.state === 'hidden')
      .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
      .slice(0, MAX_HIDDEN);

    return NextResponse.json({
      success: true,
      data: [...visible, ...hidden].map(({ score, ...rest }) => rest),
    });
  } catch (err: any) {
    console.error('[api/user/tank] 서버 에러:', err?.message ?? err);
    return NextResponse.json({ success: false, error: '어항을 불러오지 못했어.' }, { status: 500 });
  }
}
