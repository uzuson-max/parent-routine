
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  }

  const { nickname } = await request.json();
  const trimmed = typeof nickname === 'string' ? nickname.trim().slice(0, 20) : '';
  if (!trimmed) {
    return NextResponse.json({ success: false, error: 'nickname이 필요합니다.' }, { status: 400 });
  }

  const { error } = await supabase.from('user_memory').upsert({
    user_id: userId,
    nickname: trimmed,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[user/nickname] upsert failed:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, nickname: trimmed });
}
