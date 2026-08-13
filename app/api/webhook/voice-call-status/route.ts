import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get('routineId'); // sendRoutineCall이 이 파라미터명 그대로 사용
  const formData = await request.formData();
  const callStatus = formData.get('CallStatus') as string;

  if (!entryId) {
    return NextResponse.json({ success: false, error: 'entryId 없음' }, { status: 400 });
  }

  const finalStatus = callStatus === 'completed' ? 'success'
    : callStatus === 'no-answer' ? 'no_answer'
    : 'failed';

  await supabase
    .from('voice_entries')
    .update({ call_state: 'done', call_status: finalStatus })
    .eq('id', entryId);

  return NextResponse.json({ success: true, entryId, finalStatus });
}
