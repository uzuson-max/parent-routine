import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { generateOpening } from '@/lib/narrator';

// 앱을 켰을 때 참견이(내레이터)가 먼저 하는 해설 한 줄.
// 다짐 결말 / 중간 점검 / 며칠 전 말 회수 / 수집 기간 유도 / 다음 장 인사 중 하나.
// 화면(HeroScreen)이 몇 시간 단위로 캐시해서, 열 때마다 GPT를 부르지 않는다.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다' }, { status: 401 });
    const opening = await generateOpening(userId);
    return NextResponse.json({ success: true, data: opening });
  } catch (err: any) {
    console.error('[api/narrator/opening] 서버 에러:', err?.message);
    return NextResponse.json({ success: false, error: err?.message || 'error' }, { status: 500 });
  }
}
