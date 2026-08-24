import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { transcribeAudioBuffer } from '@/lib/openai';
import { analyzeAndSchedule } from '@/lib/analysis';

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

    // 2. 초기 DB 레코드 생성
    const { data: entry, error } = await supabase
      .from('voice_entries')
      .insert({
        user_phone: phone,
        audio_url: audioUrl,
        target_goal: targetGoal,
        persona,
        penalty_phone: penaltyPhone || null,
        deadline_at: deadlineAt,
        call_state: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('DB 생성 실패:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 3. STT 및 AI 분석 실행 (메모리 버퍼 직접 전달)
    try {
      console.log('Whisper STT 변환 시작...');
      const transcript = await transcribeAudioBuffer(buffer);
      console.log('STT 변환 완료:', transcript);

      // DB에 transcript 업데이트
      await supabase.from('voice_entries').update({ transcript }).eq('id', entry.id);

      // AI 분석 및 스케줄링 실행
      await analyzeAndSchedule(entry.id, transcript, phone, targetGoal, persona);
      console.log('AI 분석 및 스케줄링 완료');

    } catch (err: any) {
      console.error('STT/AI 분석 중 에러 발생:', err);
      await supabase.from('voice_entries').update({ call_state: 'analysis_failed' }).eq('id', entry.id);
      
      return NextResponse.json({ 
        success: false, 
        error: `업로드는 되었으나 AI 분석 중 오류 발생: ${err.message}` 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: entry });
  } catch (globalErr: any) {
    console.error('서버 에러:', globalErr);
    return NextResponse.json({ success: false, error: globalErr.message }, { status: 500 });
  }
}
