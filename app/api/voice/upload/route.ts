import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get('audio') as File;
    const phone = formData.get('phone') as string;
    const targetGoal = (formData.get('target_goal') as string) || '';
    const persona = (formData.get('persona') as string) || 'coach';
    const penaltyPhone = formData.get('penalty_phone') as string | null;
    const deadlineTime = formData.get('deadline_time') as string | null;

    if (!audio || !phone) {
      return NextResponse.json({ success: false, error: '오디오와 전화번호가 필요합니다.' }, { status: 400 });
    }

    const fileName = `${Date.now()}-${crypto.randomUUID()}.webm`;
    const buffer = Buffer.from(await audio.arrayBuffer());

    // 1. Supabase 스토리지에 오디오 업로드
    const { error: uploadError } = await supabase.storage
      .from('voice-recordings')
      .upload(fileName, buffer, { contentType: 'audio/webm' });

    if (uploadError) {
      console.error('Supabase 업로드 실패:', uploadError.message);
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const audioUrl = supabase.storage.from('voice-recordings').getPublicUrl(fileName).data.publicUrl;

    let deadlineAt: string | null = null;
    if (penaltyPhone && deadlineTime) {
      const today = new Date().toISOString().slice(0, 10);
      deadlineAt = new Date(`${today}T${deadlineTime}:00`).toISOString();
    }

    // 2. DB 레코드 생성 (녹음 저장이 최우선)
    const { data: entry, error } = await supabase
      .from('voice_entries')
      .insert({
        user_phone: phone,
        audio_url: audioUrl,
        target_goal: targetGoal,
        persona,
        penalty_phone: penaltyPhone || null,
        deadline_at: deadlineAt,
        call_state: 'saved_only', // 일단 안전하게 저장 완료 상태로 기록
      })
      .select()
      .single();

    if (error) {
      console.error('DB 생성 실패:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: entry });
  } catch (globalErr: any) {
    console.error('서버 에러:', globalErr);
    return NextResponse.json({ success: false, error: globalErr.message }, { status: 500 });
  }
}
