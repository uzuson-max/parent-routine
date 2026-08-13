import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendRoutineCall } from '@/lib/twilio';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data: dueEntries, error } = await supabase
    .from('voice_entries')
    .select('*')
    .eq('call_state', 'pending')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', now);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  if (!dueEntries?.length) return NextResponse.json({ message: 'no calls due' });

  const results = [];
  for (const entry of dueEntries) {
    const callResult = await sendRoutineCall({
      routineId: entry.id,
      phoneNumber: entry.user_phone,
      message: entry.call_message,
    });

    await supabase
      .from('voice_entries')
      .update({
        call_state: callResult.success ? 'awaiting_result' : 'call_failed',
      })
      .eq('id', entry.id);

    results.push({ id: entry.id, ...callResult });
  }

  return NextResponse.json({ success: true, processed: results });
}
