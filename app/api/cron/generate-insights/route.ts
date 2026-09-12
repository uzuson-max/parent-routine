import { NextResponse } from 'next/server';
import { generateInsightsForAllUsers, InsightGenResult } from '@/lib/insightEngine';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  const results = await generateInsightsForAllUsers(dryRun);

  const flat: InsightGenResult[] = Object.values(results).flat();
  const created = flat.filter((r) => r.action === 'created').length;
  const updated = flat.filter((r) => r.action === 'updated').length;

  return NextResponse.json({
    success: true,
    dryRun,
    userCount: Object.keys(results).length,
    created,
    updated,
    results,
  });
}
