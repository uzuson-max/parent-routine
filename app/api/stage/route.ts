// app/api/stage/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { STAGE_ID, STAGE_LENGTH, kstDate, type ReturnSegment } from '@/lib/stage';

export const dynamic = 'force-dynamic';

// 강 탭 — 지금 어디까지 건넜는지.
//   days[]: 건넌 돌들(대답 글, 돌아왔던 순간)
//   nextDay: 다음에 밟을 돌 / unlocked: 오늘 밟을 수 있는지(하루 하나, 한국 시간 기준)
// 테이블: stage_answers (docs/sql/2026-10-15_stage_answers.sql)
export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다' }, { status: 401 });

  const { data, error } = await supabase
    .from('stage_answers')
    .select('day, part, transcript, return_line, created_at')
    .eq('user_id', userId)
    .eq('stage', STAGE_ID)
    .order('day', { ascending: true })
    .order('part', { ascending: true });

  if (error) {
    console.error('[api/stage] 조회 실패:', error.message);
    return NextResponse.json({ success: false, error: '강을 못 불러왔어' }, { status: 500 });
  }

  type DayRow = { day: number; answers: string[]; answeredAt: string; returnSegments: ReturnSegment[] | null };
  const byDay = new Map<number, DayRow>();
  for (const r of data ?? []) {
    const cur: DayRow = byDay.get(r.day) ?? { day: r.day, answers: [], answeredAt: r.created_at, returnSegments: null };
    cur.answers.push(r.transcript ?? '');
    cur.answeredAt = r.created_at;
    if (r.return_line) {
      try {
        cur.returnSegments = JSON.parse(r.return_line);
      } catch {
        /* 옛 형식이면 무시 */
      }
    }
    byDay.set(r.day, cur);
  }

  const days = Array.from(byDay.values()).sort((a, b) => a.day - b.day);
  const last = days[days.length - 1];
  const nextDay = last ? last.day + 1 : 1;
  const finished = nextDay > STAGE_LENGTH;
  // 오늘 이미 돌 하나를 건넜으면 다음 돌은 내일. (6일차 두 번째 질문은 같은 돌이라 상관없음)
  const unlocked = !finished && (!last || kstDate(last.answeredAt) < kstDate(new Date()));

  return NextResponse.json({ success: true, data: { days, nextDay, unlocked, finished, length: STAGE_LENGTH } });
}
