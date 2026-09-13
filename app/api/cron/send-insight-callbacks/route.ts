import { NextResponse } from 'next/server';
import { sendDueInsightCallbacks, InsightCallbackResult } from '@/lib/insightCallbackEngine';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  const results: InsightCallbackResult[] = await sendDueInsightCallbacks(dryRun);

  const sent = results.filter((r) => r.action === 'sent').length;
  const skippedNoPhone = results.filter((r) => r.action === 'skipped_no_phone').length;
  const failed = results.filter((r) => r.action === 'send_failed').length;

  return NextResponse.json({
    success: true,
    dryRun,
    count: results.length,
    sent,
    skippedNoPhone,
    failed,
    results,
  });
}
