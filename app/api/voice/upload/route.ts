import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { analyzeAndSchedule } from '@/lib/analysis';
import { generateResponse } from '@/lib/responseEngine';
import { updateUserMemory } from '@/lib/memoryEngine';
import { runMemoryPipeline } from '@/lib/memoryPipeline';
import { retrieveRelevantMemories, markMemoriesReferenced } from '@/lib/memoryRetrieval';
import { retrieveRelevantInsights, markInsightsSurfaced } from '@/lib/insightEngine';
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
    const audio = formData.get('audio') as File | null;
    const textInput = (formData.get('text') as string | null)?.trim() || null;
    const phoneFromForm = (formData.get('phone') as string) || null; // 이제 선택값 — 없어도 녹음은 된다
    const persona = (formData.get('persona') as string) || 'coach';
 
    if (!audio && !textInput) {
      return NextResponse.json({ success: false, error: '오디오 또는 텍스트가 필요합니다.' }, { status: 400 });
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
 
       let audioUrl: string | null = null;
    let buffer: Buffer | null = null;
    let fileName: string | null = null;
 
    if (audio) {
      fileName = `${Date.now()}-${crypto.randomUUID()}.webm`;
      buffer = Buffer.from(await audio.arrayBuffer());
 
      const { error: uploadError } = await supabase.storage
        .from('voice-recordings')
        .upload(fileName, buffer, { contentType: 'audio/webm' });
 
      if (uploadError) {
        console.error('Supabase 업로드 실패:', uploadError.message);
        return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
      }
 
      audioUrl = supabase.storage.from('voice-recordings').getPublicUrl(fileName).data.publicUrl;
    }
    // 텍스트 입력이면 오디오 저장 자체가 없으므로 audio_url은 null로 남는다 (컬럼이 nullable이라 스키마 변경 불필요).
 
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
    if (textInput) {
      // 텍스트 입력은 STT를 거칠 필요 없이 그대로 transcript로 사용 — 이후 분석 파이프라인은 음성 입력과 완전히 동일하다.
      transcript = textInput;
    } else if (audio && buffer) {
      try {
        const fileObj = new File([new Uint8Array(buffer)], fileName!, { type: 'audio/webm' });
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
    }
 
    let analysisResult: any = null;
    let commitmentUntil: string | null = null;
    let responseResult: any = null;
    let memoryCandidates: { memory_type: string; content: string }[] = [];
    let existingCommitments: { id: string; commitment: string }[] = [];
 
    try {
      const result = await analyzeAndSchedule(entry.id, transcript, userId, persona);
      analysisResult = result.analysis;
      commitmentUntil = result.commitmentUntil;
      memoryCandidates = result.memoryCandidates;
      existingCommitments = result.unfulfilledMemories;
    } catch (analysisErr: any) {
      console.error('AI 분석 중 에러 (무시하고 진행):', analysisErr?.message);
    }
 
    if (analysisResult) {
      // memory_units에서 오늘 발화와 관련될 수도 있는 과거 기억을 retrieval — 실패해도 빈 배열로 계속 진행.
      let relevantMemoryUnits: Awaited<ReturnType<typeof retrieveRelevantMemories>> = [];
      try {
        relevantMemoryUnits = await retrieveRelevantMemories(userId, transcript);
      } catch (retrievalErr: any) {
        console.error('memory retrieval 실패 (무시하고 진행):', retrievalErr?.message);
      }

      // memory_insights(여러 memory_unit을 묶어 미리 판단해둔 관찰)에서 오늘 발화와 관련될 수도 있는
      // 것을 retrieval — 실패해도 빈 배열로 계속 진행 (raw memory retrieval과 완전히 독립적인 별도 경로).
      let relevantInsights: Awaited<ReturnType<typeof retrieveRelevantInsights>> = [];
      try {
        relevantInsights = await retrieveRelevantInsights(userId, transcript);
      } catch (insightRetrievalErr: any) {
        console.error('insight retrieval 실패 (무시하고 진행):', insightRetrievalErr?.message);
      }

      try {
        responseResult = await generateResponse(
          transcript,
          analysisResult,
          userId,
          entry.id,
          memoryCandidates,
          existingCommitments,
          relevantMemoryUnits,
          relevantInsights
        );
      } catch (respErr: any) {
        console.error('Response engine 에러 (무시하고 진행):', respErr?.message);
      }

      // responseEngine이 실제로 특정 memory_unit을 답변에 썼다면 last_referenced_at/reference_count 갱신.
      if (responseResult?.memory_unit_id_used) {
        try {
          await markMemoriesReferenced([responseResult.memory_unit_id_used]);
        } catch (refErr: any) {
          console.error('memory_units 참조 기록 실패 (무시하고 진행):', refErr?.message);
        }
      }

      // responseEngine이 실제로 특정 insight를 답변에 썼다면 last_surfaced_at/surfaced_count 갱신.
      if (responseResult?.insight_id_used) {
        try {
          await markInsightsSurfaced([responseResult.insight_id_used]);
        } catch (insightRefErr: any) {
          console.error('memory_insights 참조 기록 실패 (무시하고 진행):', insightRefErr?.message);
        }
      }

      try {
        await updateUserMemory(userId, analysisResult.detected_pattern ?? undefined, analysisResult.excuse ?? undefined);
      } catch (memErr: any) {
        console.error('user_memory 업데이트 실패 (무시하고 진행):', memErr?.message);
      }
    }
 
    // Phase 2 (WRITE ONLY) — 기존 analysis/response/memory 흐름과 완전히 별개인 병렬 경로.
    // analysisResult 성패와 무관하게, transcript가 실제로 있으면 항상 시도한다.
    // runMemoryPipeline은 내부에서 모든 실패를 흡수하므로 여기서 실패해도 위/아래 로직에 영향이 없다.
    try {
      const sourceChannel: 'voice' | 'text' = audio ? 'voice' : 'text';
      await runMemoryPipeline(entry.id, userId, transcript, sourceChannel);
    } catch (memPipelineErr: any) {
      console.error('memory pipeline 실패 (무시하고 진행):', memPipelineErr?.message);
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
            // code/moreInfo까지 같이 남겨야 Vercel 로그만 보고도 Twilio 에러 코드/문서 링크를 바로 확인할 수 있다.
            console.error('트윌로 전화 발신 실패:', callResult.error, {
              code: (callResult as any).code,
              moreInfo: (callResult as any).moreInfo,
            });
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
