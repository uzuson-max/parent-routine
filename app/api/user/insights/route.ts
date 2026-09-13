
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';

// 참견이가 지금까지 찾아낸 "발견"(memory_insights — 반복 발견/연결 발견)을 훑어보는 화면용 목록.
// 기존 테이블만 읽는다. 이미 문자/대화로 나간 것(last_surfaced_at 있음)까지 전부 보여준다 —
// 이건 "새 알림함"이 아니라 "참견이가 나에 대해 뭘 알아챘는지" 훑어보는 아카이브라서.
export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('memory_insights')
      .select('id, content, confidence, created_at, last_surfaced_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('[api/user/insights] 조회 실패:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const insights = (data ?? []).map((row) => ({
      id: row.id,
      content: row.content as string,
      confidence: row.confidence as number,
      createdAt: row.created_at as string,
      isNew: !row.last_surfaced_at,
    }));

    return NextResponse.json({ success: true, data: insights });
  } catch (err: any) {
    console.error('[api/user/insights] 서버 에러:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
