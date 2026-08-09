import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const routineId = searchParams.get('routineId');

  const formData = await request.formData();
  const callStatus = formData.get('CallStatus') as string;

  if (!routineId) {
    return NextResponse.json({ success: false, error: 'routineId가 없습니다.' }, { status: 400 });
  }

  const finalStatus = callStatus === 'completed' ? 'success' : 'failed';

  const { error } = await supabase
    .from('routines')
    .update({
      last_status: finalStatus,
      call_state: 'idle',
      last_run_date: new Date().toISOString().slice(0, 10),
    })
    .eq('id', routineId);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, routineId, finalStatus });
}
