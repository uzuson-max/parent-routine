import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendPenaltySms } from '@/lib/twilio';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  // 데드라인이 지났는데, 아직 통화 성공(success)이 아니고, 페널티를 아직 안 보낸 항목
  const { data: overdue, error } = await supabase
    .from('voice_entries')
    .select('*')
    .not('penalty_phone', 'is', null)
    .eq('penalty_sent', false)
    .lte('deadline_at', now)
    .neq('call_status', 'success');

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  if (!overdue?.length) return NextResponse.json({ message: 'no penalties due' });

  const results = [];
  for (const entry of overdue) {
    try {
      await sendPenaltySms(entry.penalty_phone, entry.user_phone);
      await supabase.from('voice_entries').update({ penalty_sent: true }).eq('id', entry.id);
      results.push({ id: entry.id, sent: true });
    } catch (err: any) {
      results.push({ id: entry.id, sent: false, error: err.message });
    }
  }

  return NextResponse.json({ success: true, processed: results });
}
