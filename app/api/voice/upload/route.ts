import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { analyzeAndSchedule } from '@/lib/analysis';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    // 2. 먼저 기본 DB 레코드 생성 (오디오 URL 확보)
    const { data: entry, error: insertError } = await supabase
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

    if (insertError || !entry) {
      console.error('DB 생성 실패:', insertError?.message);
      return NextResponse.json({ success: false, error: insertError?.message }, { status: 500 });
    }

    // 3. Whisper STT 변환 시도 (실패해도 녹음은 유지되도록 try-catch 처리)
    let transcript = '';
    try {
      const fileObj = new File([buffer], fileName, { type: 'audio/webm' });
      const transcription = await openai.audio.transcriptions.create({
        file: fileObj,
        model: 'whisper-1',
        language: 'ko',
      });
      transcript = transcription.text || '';
    } catch (sttErr: any) {
      console.error('STT 변환 중 에러 (무시하고 진행):', sttErr?.message);
      transcript = '(음성 변환 실패)';
    }

    // 4. AI 분석 및 스케줄링 실행 (실패해도 녹음과 텍스트는 유지)
    let analysisResult: any = null;
    let scheduledAt: string | null = null;
    let commitmentUntil: string | null = null;

    try {
      const result = await analyzeAndSchedule(entry.id, transcript, phone, targetGoal, persona);
      analysisResult = result.analysis;
      scheduledAt = result.scheduledAt.toISOString();
      commitmentUntil = result.commitmentUntil;
    } catch (analysisErr: any) {
      console.error('AI 분석 중 에러 (무시하고 진행):', analysisErr?.message);
    }

    // 5. 최종 결과 업데이트 (transcript, analysis, call_message 등 반영)
    const updateData: any = {
      transcript,
      analysis: analysisResult,
      call_message: analysisResult?.call_line || null,
      scheduled_at: scheduledAt,
      commitment_until: commitmentUntil,
      call_state: analysisResult ? 'fallback_ready' : 'saved_only',
    };

    const { error: updateError } = await supabase
      .from('voice_entries')
      .update(updateData)
      .eq('id', entry.id);

    if (updateError) {
      console.error('DB 업데이트 실패:', updateError.message);
    }

    return NextResponse.json({ success: true, data: { ...entry, ...updateData } });
  } catch (globalErr: any) {
    console.error('서버 에러:', globalErr);
    return NextResponse.json({ success: false, error: globalErr.message }, { status: 500 });
  }
}
