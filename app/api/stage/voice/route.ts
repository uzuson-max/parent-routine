import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { STAGE_ID } from '@/lib/stage';
import { signedVoice } from '@/lib/stageServer';

export const dynamic = 'force-dynamic';

// 강 — 그때 니가 했던 말, 그 목소리 그대로.
//   GET /api/stage/voice?day=3&part=1   → 강 N일차 대답
//   GET /api/stage/voice?entry=<id>     → 조개가 꺼낸 바다 자유 녹음(엔진 기억이 찾은 것)
// 어느 쪽이든 본인 녹음인지 확인한 뒤 10분짜리 재생 링크 + 받아쓰기를 준다(lib/stageServer.ts).
// 받아쓰기는 수달이 따라할 말 고르기 + 그 말이 나오는 3초 찾기용.
export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entryParam = searchParams.get('entry');

  let entryId: string | null | undefined = null;
  if (entryParam) {
    entryId = entryParam;
  } else {
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
    entryId = row?.entry_id;
  }

  const voice = await signedVoice(userId, entryId);
  if (!voice) return NextResponse.json({ success: false, error: '그 목소리를 못 찾았어' }, { status: 404 });
  return NextResponse.json({ success: true, data: { url: voice.url, transcript: voice.transcript } });
}
