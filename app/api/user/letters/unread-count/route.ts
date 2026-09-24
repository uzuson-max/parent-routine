
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { countUnreadLetters } from '@/lib/letters';

// 사용자별 응답이라 항상 요청 시점에 실행한다(빌드 시 정적 수집 대상에서 제외).
export const dynamic = 'force-dynamic';

// Home 우측 상단 편지 아이콘의 badge용. 실제 DB의 unread 개수만 돌려준다(head count 쿼리라 가볍다).
export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    const count = await countUnreadLetters(userId);
    return NextResponse.json({ success: true, data: { count } });
  } catch (err: any) {
    console.error('[api/user/letters/unread-count] 서버 에러:', err?.message);
    return NextResponse.json({ success: false, error: '개수를 불러오지 못했습니다.' }, { status: 500 });
  }
}
