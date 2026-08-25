import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendRoutineCall } from "@/lib/twilio"; // 트윌로 발신 함수 import

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { data, error } = await supabase.from("voice_entries").select("*").eq("id", params.id).single();
  
  if (error || !data) {
    return NextResponse.json({ success: false, error: error?.message || '항목을 찾을 수 없습니다.' }, { status: 500 });
  }

  // 아직 전화를 걸지 않았고, AI 분석 메시지가 존재한다면 트윌로 전화 발신 트리거
  if (data.call_message && data.call_state !== 'calling_sent') {
    const callResult = await sendRoutineCall({
      routineId: data.id,
      phoneNumber: data.user_phone,
      message: data.call_message,
    });

    if (callResult.success) {
      // 발신 성공 시 DB 상태 업데이트
      await supabase
        .from('voice_entries')
        .update({ call_state: 'calling_sent' })
        .eq('id', data.id);
        
      data.call_state = 'calling_sent';
    }
  }

  return NextResponse.json(data);
}
