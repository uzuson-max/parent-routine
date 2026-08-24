import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { transcribeAudioBuffer } from '@/lib/openai'; // 버퍼를 직접 받는 함수 권장 (또는 기존 함수 내부 로직 점검)
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
      console.error('Supabase 스토리지 업로드 실패:', uploadError.message);
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const audioUrl = supabase.storage.from('voice-recordings').getPublicUrl(fileName).data.publicUrl;

    // 페널티 데드라인 계산
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
      console.error('DB 레코드 생성 실패:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 3. STT 및 AI 분석 비동기 또는 동기 처리 (여기서 에러 발생 시 로그 추적)
    try {
      // URL 방식 대신 버퍼를 직접 전송하거나, lib/openai 내부 구현을 점검합니다.
      // 만약 transcribeAudio가 파일을 다운로드하는 방식이라면 버퍼 기반 처리로 변경하는 것이 안전합니다.
      const transcript = await transcribeAudio(audioUrl); 
      
      console.log('STT 변환 성공:', transcript);

      // DB에 transcript 업데이트
      await supabase.from('voice_entries').update({ transcript }).eq('id', entry.id);

      // AI 분석 및 스케줄링 실행
      await analyzeAndSchedule(entry.id, transcript, phone, targetGoal, persona);
      
      console.log('AI 분석 및 스케줄링 완료');
    } catch (err: any) {
      console.error('STT 또는 AI 분석 중 치명적 에러 발생:', err);
      await supabase.from('voice_entries').update({ call_state: 'analysis_failed' }).eq('id', entry.id);
      
      // 에러 내용을 클라이언트가 인지할 수 있도록 상세 반환 가능
      return NextResponse.json({ 
        success: false, 
        error: `오디오는 업로드되었으나 AI 분석 중 오류가 발생했습니다: ${err.message}` 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: entry });
  } catch (globalErr: any) {
    console.error('서버 업로드 처리 중 예외 발생:', globalErr);
    return NextResponse.json({ success: false, error: globalErr.message }, { status: 500 });
  }
}
