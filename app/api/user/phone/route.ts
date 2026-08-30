
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { sendRoutineCall } from '@/lib/twilio';

function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  }

  const { phone_number, entryId } = await request.json();
  const normalized = typeof phone_number === 'string' ? normalizePhone(phone_number) : '';
  if (!normalized) {
    return NextResponse.json({ success: false, error: 'phone_number가 필요합니다.' }, { status: 400 });
  }

  const { error: upsertError } = await supabase.from('user_memory').upsert({
    user_id: userId,
    phone_number: normalized,
    updated_at: new Date().toISOString(),
  });
  if (upsertError) {
    console.error('[user/phone] upsert failed:', upsertError.message);
    return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 });
  }

  // entryId가 같이 오면, 그 발화가 전화를 기다리고 있었는지 확인하고 지금 보낸다.
  // 전화 발신 로직 자체(sendRoutineCall/twilio.ts)는 건드리지 않고 그대로 호출만 한다.
  if (entryId) {
    const { data: entry, error: fetchError } = await supabase
      .from('voice_entries')
      .select('*')
      .eq('id', entryId)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json({ success: true, phone_number: normalized });
    }
    if (entry.user_id !== userId) {
      return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 });
    }

    await supabase.from('voice_entries').update({ user_phone: normalized }).eq('id', entryId);

    if (entry.call_state === 'awaiting_phone' && entry.call_message) {
      let newState = 'call_failed';
      try {
        const callResult = await sendRoutineCall({
          routineId: entry.id,
          phoneNumber: normalized,
          message: entry.call_message,
        });
        if (callResult.success) newState = 'calling_sent';
      } catch (callErr: any) {
        console.error('[user/phone] 전화 발신 실패:', callErr?.message);
      }

      const { data: updated } = await supabase
        .from('voice_entries')
        .update({ call_state: newState, user_phone: normalized })
        .eq('id', entryId)
        .select()
        .single();

      return NextResponse.json({ success: true, phone_number: normalized, entry: updated });
    }

    return NextResponse.json({ success: true, phone_number: normalized, entry: { ...entry, user_phone: normalized } });
  }

  return NextResponse.json({ success: true, phone_number: normalized });
}
