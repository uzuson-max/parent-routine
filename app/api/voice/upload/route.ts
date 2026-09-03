

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { analyzeAndSchedule } from '@/lib/analysis';
import { generateResponse } from '@/lib/responseEngine';
import { updateUserMemory } from '@/lib/memoryEngine';
import { sendRoutineCall } from '@/lib/twilio';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    const formData = await request.formData();
    const audio = formData.get('audio') as File;
    const phoneFromForm = (formData.get('phone') as string) || null; // 이제 선택값 — 없어도 녹음은 된다
    const persona = (formData.get('persona') as string) || 'coach';

    if (!audio) {
      return NextResponse.json({ success: false, error: '오디오가 필요합니다.' }, { status: 400 });
    }

    // 이 계정에 이미 저장된 닉네임/전화번호 조회 (없어도 정상 진행)
    const { data: userMemory } = await supabase
      .from('user_memory')
      .select('nickname, phone_number')
      .eq('user_id', userId)
      .maybeSingle();

    const effectivePhone = phoneFromForm || userMemory?.phone_number || null;

    // 폼으로 새 번호가 들어왔고, 저장된 값과 다르면 계정에 반영해둔다
    if (phoneFromForm && phoneFromForm !== userMemory?.phone_number) {
      await supabase.from('user_memory').upsert({
        user_id: userId,
        phone_number: phoneFromForm,
        updated_at: new Date().toISOString(),
      });
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
      .insert({ user_id: userId, user_phone: effectivePhone, audio_url: audioUrl, persona, call_state: 'pending' })
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
    let memoryCandidates: { memory_type: string; content: string }[] = [];

    try {
      const result = await analyzeAndSchedule(entry.id, transcript, userId, persona);
      analysisResult = result.analysis;
      commitmentUntil = result.commitmentUntil;
      memoryCandidates = result.memoryCandidates;
    } catch (analysisErr: any) {
      console.error('AI 분석 중 에러 (무시하고 진행):', analysisErr?.message);
    }

    if (analysisResult) {
      try {
        responseResult = await generateResponse(transcript, analysisResult, userId, memoryCandidates);
      } catch (respErr: any) {
        console.error('Response engine 에러 (무시하고 진행):', respErr?.message);
      }

      try {
        await updateUserMemory(userId, analysisResult.detected_pattern ?? undefined, analysisResult.excuse ?? undefined);
      } catch (memErr: any) {
        console.error('user_memory 업데이트 실패 (무시하고 진행):', memErr?.message);
      }
    }

    let currentCallState: string;

    if (!analysisResult) {
      currentCallState = 'saved_only';
    } else if (responseResult?.channel === 'call') {
      if (!effectivePhone) {
        // 전화가 필요한 순간인데 저장된 번호가 없음 — 여기서 발신 로직 자체는 건드리지 않고,
        // 프론트에서 번호를 받은 뒤 /api/user/phone이 같은 sendRoutineCall을 호출하게 넘긴다.
        currentCallState = 'awaiting_phone';
      } else {
        currentCallState = 'call_failed';
        try {
          const callResult = await sendRoutineCall({
            routineId: entry.id,
            phoneNumber: effectivePhone,
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
      }
    } else if (analysisResult.commitment) {
      // goal만 있고 commitment가 null인 경우(생각/고민/감정 발화)는 여기로 오면 안 됨.
      // ConfirmScreen은 "기억해달라고 할 만한 실제 commitment"가 있을 때만 노출한다.
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
