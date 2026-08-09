import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('routines')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { parent_name, phone_number, routine_text, call_message, call_time } = body;

  if (!parent_name || !phone_number || !call_time) {
    return NextResponse.json(
      { success: false, error: '성함, 전화번호, 시간은 필수입니다.' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('routines')
    .insert({
      parent_name,
      phone_number,
      routine_text: routine_text || '루틴 확인',
      call_message: call_message || '오늘 루틴을 확인할 시간이에요.',
      call_time: `${call_time}:00`,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}
