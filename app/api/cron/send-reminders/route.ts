// app/api/cron/send-reminders/route.ts
import { NextResponse } from 'next/server';
import { processDueReminders } from '@/lib/reminders/deliver';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ============================================================================
// 알람 발송 — 1분마다 호출된다(Supabase pg_cron + pg_net, docs/sql/2026-10-12_reminder_cron.sql).
// Vercel Cron은 Hobby 요금제에서 하루 1번까지라(지금 vercel.json 크론도 전부 하루 1번) 분 단위 알람에는 못 쓴다.
// 다른 크론과 같은 방식으로 Authorization: Bearer CRON_SECRET 을 확인한다.
//   GET ?dryRun=true → 보낼 대상만 보고 아무것도 바꾸지 않는다.
// ============================================================================
async function handle(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get('dryRun') === 'true';
  try {
    const { recovered, results } = await processDueReminders(new Date(), { dryRun });
    return NextResponse.json({ success: true, dryRun, recovered, count: results.length, results });
  } catch (err: any) {
    console.error('[cron/send-reminders] 실패:', err?.message);
    return NextResponse.json({ success: false, error: err?.message ?? 'failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
