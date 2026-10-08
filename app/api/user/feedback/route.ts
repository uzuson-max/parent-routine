// app/api/user/feedback/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// MY > 참견이에게 의견 보내기. feedback 테이블에 쌓아두고 Supabase에서 직접 읽는다.
// (테이블은 docs/sql/2026-10-08_my_settings.sql)
export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const message = String(body?.message ?? '').trim().slice(0, 2000);
    if (message.length < 2) {
      return NextResponse.json({ success: false, error: '한 마디만 적어줘.' }, { status: 400 });
    }
    const { error } = await supabase.from('feedback').insert({
      user_id: userId,
      message,
      user_agent: (request.headers.get('user-agent') ?? '').slice(0, 300),
    });
    if (error) {
      console.error('[api/user/feedback] 저장 실패:', error.message);
      return NextResponse.json({ success: false, error: '지금은 전달이 안 됐어. 조금 있다 다시 보내줄래?' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[api/user/feedback] 서버 에러:', err?.message);
    return NextResponse.json({ success: false, error: '지금은 전달이 안 됐어.' }, { status: 500 });
  }
}
