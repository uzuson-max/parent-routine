import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { markInsightsSurfaced } from '@/lib/insightEngine';

// 홈 화면에서 "참견이가 나를 찾아왔다"고 보여줄 수 있는, 아직 어디에도(문자/대화) 한 번도
// 안 꺼낸 발견(memory_insights) 하나를 골라주는 전용 읽기 엔드포인트.
//
// - insightEngine.ts / insightCallbackEngine.ts 파일 자체는 전혀 수정하지 않았다. 여기서는
//   그 두 파일이 이미 쓰고 있는 것과 같은 테이블(memory_insights)을 같은 조건으로 읽고,
//   insightEngine.ts가 이미 export해 둔 markInsightsSurfaced()를 그대로 재사용해서
//   "한 번 보여줬으면 다시 안 보여준다" 상태만 갱신한다 — insightCallbackEngine.ts가
//   문자 발송 성공 후 하는 것과 정확히 같은 처리다.
// - 이 라우트가 하나를 반환하면 그 즉시 surfaced 처리한다. 그래서 (1) 홈에서 한 번 보여준
//   발견을 새로고침해도 다시 보여주지 않고, (2) 이후 send-insight-callbacks cron이 같은
//   내용을 중복으로 문자 발송하지 않는다 — 이미 홈에서 "참견"으로 전달됐기 때문.
// - 후보가 없으면 data: null. 프론트는 이 경우 일반 시작 상태(담백한 인사 or 지난 반응)를 보여준다.
// - memoryCallbackEngine.ts가 만드는 단건 memory_unit 콜백은 문자로만 나가고 메시지 원문을
//   따로 저장하지 않기 때문에(설계상 의도적으로 건드리지 않음), 이 라우트에서는 다루지 않는다.
//   그건 오직 문자로만 전달되는 채널로 남겨둔다.
const CONFIDENCE_THRESHOLD = 0.6; // insightCallbackEngine.ts와 동일한 기준
const MAX_INSIGHT_AGE_DAYS = 14; // 오래된 발견을 "방금 찾아온 것"처럼 보여주지 않기 위한 안전장치

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - MAX_INSIGHT_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('memory_insights')
      .select('id, content, confidence, created_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('last_surfaced_at', null)
      .gte('confidence', CONFIDENCE_THRESHOLD)
      .gte('created_at', cutoff)
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[api/user/proactive-line] 조회 실패:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: true, data: null });
    }

    // 화면에 보여주는 순간 곧바로 "한 번 꺼낸 것"으로 처리한다. 이 처리가 실패해도 사용자에게는
    // 이미 응답이 나간 뒤이므로, 화면을 막지 않고 조용히 로그만 남긴다.
    try {
      await markInsightsSurfaced([data.id]);
    } catch (markErr: any) {
      console.error('[api/user/proactive-line] surfaced 처리 실패(무시):', markErr?.message);
    }

    return NextResponse.json({
      success: true,
      data: { id: data.id as number, content: data.content as string },
    });
  } catch (err: any) {
    console.error('[api/user/proactive-line] 서버 에러:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
