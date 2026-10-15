// app/api/stage/voice/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { STAGE_ID } from '@/lib/stage';
import { signedVoiceUrl } from '@/lib/stageServer';

export const dynamic = 'force-dynamic';

// 강 — N일차에 니가 했던 말, 그 목소리 그대로. GET /api/stage/voice?day=3&part=1
export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const day = Number(searchParams.get('day'));
  const part = Number(searchParams.get('part') || '1');
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ success: false, error: 'day가 이상해' }, { status: 400 });
  }

  const { data: row } = await supabase
    .from('stage_answers')
    .select('entry_id')
    .eq('user_id', userId)
    .eq('stage', STAGE_ID)
    .eq('day', day)
    .eq('part', part)
    .maybeSingle();

  const url = await signedVoiceUrl(userId, row?.entry_id);
  if (!url) return NextResponse.json({ success: false, error: '그 목소리를 못 찾았어' }, { status: 404 });
  return NextResponse.json({ success: true, data: { url } });
}
