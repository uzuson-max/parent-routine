import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendRoutineCall } from '@/lib/twilio';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const { data: routine, error } = await supabase
    .from('routines')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !routine) {
    return NextResponse.json({ success: false, error: '루틴을 찾을 수 없습니다.' }, { status: 404 });
  }

  const result = await sendRoutineCall({
    routineId: routine.id,
    phoneNumber: routine.phone_number,
    message: routine.call_message,
  });

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  await supabase
    .from('routines')
    .update({ call_state: 'awaiting_result', last_call_sid: result.sid })
    .eq('id', routine.id);

  return NextResponse.json({ success: true, sid: result.sid });
}
