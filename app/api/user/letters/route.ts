
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { listLettersForUser } from '@/lib/letters';

// 사용자별 응답이라 항상 요청 시점에 실행한다(빌드 시 정적 수집 대상에서 제외).
export const dynamic = 'force-dynamic';

// 참견이의 편지 목록. 사용자에게 전달된(status=delivered) 내 편지만, 최신순으로.
// 응답에는 목록 표시용 필드(id/title/preview/createdAt/isUnread)만 담는다 — source_type/metadata 등 내부 값 없음.
export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    const letters = await listLettersForUser(userId);
    return NextResponse.json({ success: true, data: letters });
  } catch (err: any) {
    console.error('[api/user/letters] 서버 에러:', err?.message);
    return NextResponse.json({ success: false, error: '편지를 불러오지 못했습니다.' }, { status: 500 });
  }
}
