import { NextResponse } from 'next/server';
import {
  generateMonthlyReflectionsForAllUsers,
  getPreviousMonthBoundsKST,
  MonthlyReflectionResult,
} from '@/lib/monthlyReflectionEngine';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  const bounds = getPreviousMonthBoundsKST();
  const results = await generateMonthlyReflectionsForAllUsers(dryRun, bounds);

  const flat: MonthlyReflectionResult[] = Object.values(results);
  const generated = flat.filter((r) => r.action === 'generated').length;
  const insufficientData = flat.filter((r) => r.action === 'insufficient_data').length;
  const skipped = flat.filter((r) => r.action === 'skipped_already_generated').length;

  return NextResponse.json({
    success: true,
    dryRun,
    period: { start: bounds.periodStartLabel, end: bounds.periodEndLabel },
    userCount: Object.keys(results).length,
    generated,
    insufficientData,
    skipped,
    results,
  });
}
