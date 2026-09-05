
import { NextResponse } from 'next/server';
import { processDueInterventions } from '@/lib/interventionEngine';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  const results = await processDueInterventions(dryRun);

  return NextResponse.json({ success: true, dryRun, count: results.length, results });
}
