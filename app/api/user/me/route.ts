
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('user_memory')
    .select('nickname, phone_number, entry_count')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[user/me] fetch failed:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    nickname: data?.nickname ?? null,
    phone_number: data?.phone_number ?? null,
    entry_count: data?.entry_count ?? 0,
  });
}
