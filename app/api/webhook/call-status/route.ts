import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const routineId = searchParams.get('routineId');
  const formData = await request.formData();
  const callStatus = formData.get('CallStatus') as string; // completed | no-answer | busy | failed

  if (!routineId) {
    return NextResponse.json({ success: false, error: 'routineId가 없습니다.' }, { status: 400 });
  }

  let finalStatus: string;
  if (callStatus === 'completed') finalStatus = 'success';
  else if (callStatus === 'no-answer') finalStatus = 'no_answer';
  else finalStatus = 'failed';

  const { data: routine } = await supabase
    .from('routines')
    .select('call_message, history')
    .eq('id', routineId)
    .single();

  const newHistory = [
    { status: finalStatus, time: new Date().toISOString(), message: routine?.call_message },
    ...(routine?.history || []),
  ].slice(0, 5);

  const { error } = await supabase
    .from('routines')
    .update({
      last_status: finalStatus,
      call_state: 'idle',
      last_run_date: new Date().toISOString().slice(0, 10),
      history: newHistory,
    })
    .eq('id', routineId);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, routineId, finalStatus });
}
