
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { saveNickname } from '@/lib/memoryEngine';

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    const body = await request.json();
    const nickname = (body?.nickname ?? '').toString().trim().slice(0, 20);
    if (!nickname) {
      return NextResponse.json({ success: false, error: '닉네임이 필요합니다.' }, { status: 400 });
    }

    const result = await saveNickname(userId, nickname);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, nickname });
  } catch (err: any) {
    console.error('[api/user/nickname] 서버 에러:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
