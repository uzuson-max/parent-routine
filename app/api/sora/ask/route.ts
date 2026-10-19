// app/api/sora/ask/route.ts
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { retrieveRelevantMemories } from '@/lib/memoryRetrieval';

export const dynamic = 'force-dynamic';

// 소라님 — 심해 바닥에서 줄 당기면, 니가 예전에 한 말로 대답한다.
//   POST /api/sora/ask  { question: "오늘 운동 가야 돼?" }
//   → { found: true, entryId, quote, at }  (목소리는 /api/stage/voice?entry=<entryId> 로 듣는다)
//   → { found: false }                    (꺼낼 말이 없으면 소라님은 시큰둥하게 넘긴다 — 정상 결과)
// 질문은 저장하지 않는다. 읽기만 한다. 기억 검색은 응답 엔진이 쓰는 것과 같은 lib/memoryRetrieval.ts.
export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다' }, { status: 401 });

  let question = '';
  try {
    const body = await request.json();
    question = String(body?.question ?? '').trim().slice(0, 200);
  } catch {
    /* 빈 질문으로 처리 */
  }
  if (!question) return NextResponse.json({ success: false, error: '질문이 비었어' }, { status: 400 });

  try {
    const units = await retrieveRelevantMemories(userId, question, 5);
    // 목소리가 남아 있는 기억을 먼저 — 소라님은 글보다 니 목소리로 대답하는 게 핵심이라서.
    const withVoice = units.find((u) => !!u.source_entry_id);
    const pick = withVoice ?? units[0];
    if (!pick) return NextResponse.json({ success: true, data: { found: false } });

    const quote = String(pick.raw_quote || pick.content || '').trim();
    if (!quote) return NextResponse.json({ success: true, data: { found: false } });

    return NextResponse.json({
      success: true,
      data: {
        found: true,
        entryId: pick.source_entry_id ?? null,
        quote,
        at: pick.created_at,
      },
    });
  } catch (err: any) {
    console.error('[sora/ask] 실패:', err?.message);
    return NextResponse.json({ success: true, data: { found: false } });
  }
}
