// app/api/voice/upload/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { analyzeAndSchedule } from '@/lib/analysis';
import { generateResponse } from '@/lib/responseEngine';
import { sendRoutineCall } from '@/lib/twilio';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get('audio') as File;
    const phone = formData.get('phone') as string;
    const persona = (formData.get('persona') as string) || 'coach';

    if (!audio || !phone) {
      return NextResponse.json({ success: false, error: '오디오와 전화번호가 필요합니다.' }, { status: 400 });
    }

    const fileName = `${Date.now()}-${crypto.randomUUID()}.webm`;
    const buffer = Buffer.from(await audio.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('voice-recordings')
      .upload(fileName, buffer, { contentType: 'audio/webm' });

    if (uploadError) {
      console.error('Supabase 업로드 실패:', uploadError.message);
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const audioUrl = supabase.storage.from('voice-recordings').getPublicUrl(fileName).data.publicUrl;

    const { data: entry, error: insertError } = await supabase
      .from('voice_entries')
      .insert({ user_phone: phone, audio_url: audioUrl, persona, call_state: 'pending' })
      .select()
      .single();

    if (insertError || !entry) {
      console.error('DB 생성 실패:', insertError?.message);
      return NextResponse.json({ success: false, error: insertError?.message }, { status: 500 });
    }

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

    let analysisResult: any = null;
    let commitmentUntil: string | null = null;
    let responseResult: any = null;

    try {
      const result = await analyzeAndSchedule(entry.id, transcript, phone, persona);
      analysisResult = result.analysis;
      commitmentUntil = result.commitmentUntil;
    } catch (analysisErr: any) {
      console.error('AI 분석 중 에러 (무시하고 진행):', analysisErr?.message);
    }

    if (analysisResult) {
      try {
        responseResult = await generateResponse(transcript, analysisResult, phone);
      } catch (respErr: any) {
        console.error('Response engine 에러 (무시하고 진행):', respErr?.message);
      }
    }

    // channel 기준으로 최종 분기 (기존 intervention_needed 단독 판단을 responseResult.channel로 대체)
    let currentCallState: string;

    if (!analysisResult) {
      currentCallState = 'saved_only';
    } else if (responseResult?.channel === 'call') {
      currentCallState = 'call_failed';
      try {
        const callResult = await sendRoutineCall({
          routineId: entry.id,
          phoneNumber: phone,
          message: responseResult.response,
        });
        if (callResult.success) {
          currentCallState = 'calling_sent';
          console.log('트윌로 전화 발신 성공:', callResult.sid);
        } else {
          console.error('트윌로 전화 발신 실패:', callResult.error);
        }
      } catch (callErr: any) {
        console.error('전화 발신 중 예외 발생:', callErr?.message);
      }
    } else if (analysisResult.goal || analysisResult.commitment) {
      currentCallState = 'awaiting_confirmation';
    } else {
      currentCallState = 'no_action';
    }

    const updateData: any = {
      transcript,
      analysis: analysisResult,
      response: responseResult,
      call_message: responseResult?.response || null,
      commitment_until: commitmentUntil,
      call_state: currentCallState,
    };

    const { error: updateError } = await supabase.from('voice_entries').update(updateData).eq('id', entry.id);
    if (updateError) console.error('DB 업데이트 실패:', updateError.message);

    return NextResponse.json({ success: true, data: { ...entry, ...updateData } });
  } catch (globalErr: any) {
    console.error('서버 에러:', globalErr);
    return NextResponse.json({ success: false, error: globalErr.message }, { status: 500 });
  }
}
