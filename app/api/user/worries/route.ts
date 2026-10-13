import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { answerWorry, createWorryBottle, loadWorries, type WorryResult } from '@/lib/worryBottles';
 
export const dynamic = 'force-dynamic';
 
// ============================================================================
// 홈 바다 수면 위의 걱정 병 (lib/worryBottles.ts).
//   GET  → { bottles: 떠 있는 병(확인할 때가 가까운 순), stats: 지금까지 답한 결과 }
//          SQL 실행 전이면 { bottles: [], stats: null, ready: false } — 바다에는 아무것도 안 뜬다.
//   POST { id, answer: 'hit' | 'half' | 'miss' | 'later' } → 답하고 바뀐 stats를 돌려준다.
//   POST { action: 'create', worry, days } → 걱정 병 탭에서 직접 던진 걱정을 병에 담는다.
// ============================================================================
 
const EMPTY = { bottles: [], stats: null, opened: [], ready: false };
 
export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  try {
    const data = await loadWorries(userId);
    return NextResponse.json({ success: true, data: data ? { ...data, ready: true } : EMPTY });
  } catch (err: any) {
    console.error('[api/user/worries] 불러오기 실패:', err?.message);
    return NextResponse.json({ success: false, error: '병을 못 건져왔어.' }, { status: 500 });
  }
}
 
const ANSWERS = new Set(['hit', 'half', 'miss', 'later']);
 
export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.action === 'create') {
      const worry = String(body?.worry ?? '');
      const days = [1, 5, 30].includes(Number(body?.days)) ? Number(body.days) : 1;
      if (worry.trim().length < 2) {
        return NextResponse.json({ success: false, error: '걱정 한 줄만 적어줘.' }, { status: 400 });
      }
      const r = await createWorryBottle(userId, worry, days);
      if (r === 'full') {
        return NextResponse.json({ success: false, error: '바다에 병이 너무 많아. 몇 개 열어보고 던져줘.' }, { status: 409 });
      }
      const data = await loadWorries(userId);
      return NextResponse.json({ success: true, data: data ? { ...data, ready: true } : EMPTY });
    }
    const id = Number(body?.id);
    const answer = String(body?.answer ?? '');
    if (!Number.isInteger(id) || !ANSWERS.has(answer)) {
      return NextResponse.json({ success: false, error: '어떤 병인지 모르겠어.' }, { status: 400 });
    }
    const ok = await answerWorry(userId, id, answer as WorryResult | 'later');
    if (!ok) return NextResponse.json({ success: false, error: '이미 열어본 병이야.' }, { status: 409 });
    const data = await loadWorries(userId);
    return NextResponse.json({ success: true, data: data ? { ...data, ready: true } : EMPTY });
  } catch (err: any) {
    console.error('[api/user/worries] 답 저장 실패:', err?.message);
    return NextResponse.json({ success: false, error: '지금은 저장이 안 됐어. 조금 있다 다시 해볼래?' }, { status: 500 });
  }
}
