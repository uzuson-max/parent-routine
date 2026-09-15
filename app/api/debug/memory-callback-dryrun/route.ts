
//
// 임시 검증용 라우트 — sendDueMemoryCallbacks(true)를 실제 production Supabase/OpenAI로
// 돌려보기 위한 것. dryRun은 코드에서 true로 고정돼 있어서 이 라우트를 통해서는
// 절대 실제 SMS가 나가지 않는다. vercel.json에 등록하지 않았으므로 cron으로 자동 실행되지
// 않고, 이 주소를 직접 열 때만 실행된다. 확인 끝나면 이 파일을 삭제할 것.
import { NextResponse } from 'next/server';
import { sendDueMemoryCallbacks } from '@/lib/memoryCallbackEngine';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  const querySecret = url.searchParams.get('secret');
  const providedSecret = authHeader === `Bearer ${process.env.CRON_SECRET}` ? process.env.CRON_SECRET : querySecret;

  if (providedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // dryRun은 여기서 true로 고정 — 쿼리로도 바꿀 수 없게 해서 이 라우트로는 절대 실제 발송이 안 나가게 막는다.
  const results = await sendDueMemoryCallbacks(true);

  return NextResponse.json({ success: true, dryRun: true, count: results.length, results });
}
