import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    // 기존 voice_entries 테이블에서 본인 것만, 최신순으로. 새 테이블 없음.
    const { data, error } = await supabase
      .from('voice_entries')
      .select('id, transcript, response, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[api/user/entries] 조회 실패:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const entries = (data ?? [])
      // STT 실패했거나 빈 발화는 기록에서 제외
      .filter((row) => row.transcript && row.transcript !== '(음성 변환 실패)')
      .map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        transcript: row.transcript as string,
        // response jsonb에서 실제 화면에 보여줬던 참견이 대사만 추출
        responseText: (row.response as any)?.response ?? null,
      }));

    return NextResponse.json({ success: true, data: entries });
  } catch (err: any) {
    console.error('[api/user/entries] 서버 에러:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
