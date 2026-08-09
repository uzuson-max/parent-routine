import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendRoutineCall } from '@/lib/twilio';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const currentTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul' }).slice(0, 5);
  const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);

  const { data: dueRoutines, error } = await supabase
    .from('routines')
    .select('*')
    .like('call_time', `${currentTime}%`)
    .neq('call_state', 'awaiting_result')
    .or(`last_run_date.is.null,last_run_date.neq.${currentDate}`);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  if (!dueRoutines?.length) return NextResponse.json({ message: 'no routines due', time: currentTime });

  const results = [];
  for (const routine of dueRoutines) {
    const callResult = await sendRoutineCall({
      routineId: routine.id,
      phoneNumber: routine.phone_number,
      message: routine.call_message,
    });

    await supabase
      .from('routines')
      .update({
        call_state: callResult.success ? 'awaiting_result' : 'idle',
        last_status: callResult.success ? 'pending' : 'failed',
        last_call_sid: callResult.sid,
        last_run_date: currentDate,
      })
      .eq('id', routine.id);

    results.push({ id: routine.id, ...callResult });
  }

  return NextResponse.json({ success: true, processed: results });
}
