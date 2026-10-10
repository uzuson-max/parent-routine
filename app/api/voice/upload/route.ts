// app/api/voice/upload/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { analyzeAndSchedule } from '@/lib/analysis';
import { generateResponse } from '@/lib/responseEngine';
import { updateUserMemory } from '@/lib/memoryEngine';
import { runMemoryPipeline } from '@/lib/memoryPipeline';
import { retrieveRelevantMemoriesWithTrace, markMemoriesReferenced, RetrievalTrace } from '@/lib/memoryRetrieval';
import { retrieveRelevantInsights, markInsightsSurfaced } from '@/lib/insightEngine';
import { sendRoutineCall } from '@/lib/twilio';
import { loadRecall, type Recall } from '@/lib/recall';
import { prefetchEmbedding } from '@/lib/memoryEmbedding';
import { waitUntil } from '@vercel/functions';
import OpenAI from 'openai';
import { looksLikeNoSpeech } from '@/lib/noSpeech';
import { loadUserPrefs, allowsCalls } from '@/lib/userPrefs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 대답을 기다리는 시간이 길다는 문제 — 단계마다 몇 ms 걸렸는지 한 줄로 남긴다(Vercel 로그에서 [upload-timing] 검색).
function makeTimer() {
  const t0 = Date.now();
  let last = t0;
  const marks: string[] = [];
  return {
    mark(label: string) {
      const now = Date.now();
      marks.push(`${label}=${now - last}`);
      last = now;
    },
    log(extra = '') {
      console.log(`[upload-timing] total=${Date.now() - t0}ms ${marks.join(' ')} ${extra}`.trim());
    },
  };
}

// 대답에 필요 없는 기록 작업은 대답을 돌려준 뒤 뒤에서 마저 한다(Vercel waitUntil — 함수가 끝까지 살아 있게 해준다).
// 로컬 개발 서버에서는 그냥 백그라운드 promise로 돈다.
function later(label: string, work: () => Promise<unknown>) {
  const p = work().catch((e: any) => console.error(`[upload] 뒤에서 하던 일 실패 (${label}):`, e?.message ?? e));
  try {
    waitUntil(p);
  } catch {
    /* Vercel 밖 — promise는 이미 돌고 있다 */
  }
}

export async function POST(request: Request) {
  const timer = makeTimer();
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
    // 홈에서 참견이가 먼저 던진 proactive callback(app/api/user/proactive-line)에 "대답하기"로
    // 들어왔을 때만 채워진다 (app/page.tsx doUpload가 selectedTopic이 있을 때만 append).
    // 지금까지는 이 값을 읽지 않아서 RecordingScreen 상단 뱃지에만 보이고 실제 GPT 응답 생성에는
    // 전혀 반영되지 않았다 — 아래에서 읽어서 generateResponse에 그대로 넘긴다.
    const topicFromForm = (formData.get('topic') as string | null)?.trim() || undefined;
    // 사용자가 "이렇게 말한 거 맞아?"에 [맞아]를 눌러 다시 보낸 녹음 — 무음/환각 의심 검사를 건너뛴다.
    const speechConfirmed = formData.get('speech_confirmed') === '1';
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

    // 녹음 파일 저장은 받아쓰기와 동시에 돌린다(예전엔 저장이 끝나야 받아쓰기를 시작했다).
    let storagePromise: Promise<{ error: { message: string } | null }> | null = null;
    if (audio) {
      fileName = `${Date.now()}-${crypto.randomUUID()}.webm`;
      buffer = Buffer.from(await audio.arrayBuffer());
      storagePromise = supabase.storage
        .from('voice-recordings')
        .upload(fileName, buffer, { contentType: 'audio/webm' })
        .then((r) => ({ error: r.error ? { message: r.error.message } : null }));
      audioUrl = supabase.storage.from('voice-recordings').getPublicUrl(fileName).data.publicUrl;
    }
    // 저장된 녹음을 지워야 할 때(말소리 없음/환각 의심) — 저장이 끝난 뒤에 지운다.
    const removeStored = () => {
      if (!fileName || !storagePromise) return;
      const name = fileName;
      later('remove-audio', () => storagePromise!.then(() => supabase.storage.from('voice-recordings').remove([name])));
    };
    // 텍스트 입력이면 오디오 저장 자체가 없으므로 audio_url은 null로 남는다 (컬럼이 nullable이라 스키마 변경 불필요).

       // STT는 기록(voice_entries)을 만들기 전에 먼저 한다 — 말소리가 없는 녹음이면 아예 기록을 만들지 않기 위해.
    let transcript = '';
    if (textInput) {
      // 텍스트 입력은 STT를 거칠 필요 없이 그대로 transcript로 사용 — 이후 분석 파이프라인은 음성 입력과 완전히 동일하다.
      transcript = textInput;
    } else if (audio && buffer) {
      try {
        const fileObj = new File([new Uint8Array(buffer)], fileName!, { type: 'audio/webm' });
        const transcription: any = await openai.audio.transcriptions.create({
          file: fileObj,
          model: 'whisper-1',
          language: 'ko',
          response_format: 'verbose_json',
        });
                const text: string = transcription?.text || '';
        // 받아쓴 글자가 아예 없으면 확인할 것도 없다 — 저장하지 않는다.
        if (!text.trim()) {
          console.log('[upload] 받아쓴 내용 없음 — 저장하지 않음');
          removeStored();
          return NextResponse.json({ success: true, data: { no_speech: true } });
        }
        // Whisper 환각("시청해주셔서 감사합니다" 등)으로 의심되면 바로 버리지 않고 사용자에게 확인한다.
        // 진짜로 그렇게 말한 사람도 있을 수 있어서 — 화면에 "이렇게 말한 거 맞아?"를 띄우고,
        // [맞아]를 누르면 같은 녹음을 speech_confirmed=1로 다시 보낸다. 지금은 아무것도 저장하지 않는다.
        if (!speechConfirmed && looksLikeNoSpeech(text, transcription?.segments)) {
          console.log('[upload] 무음 환각 의심 — 사용자 확인 요청:', JSON.stringify(text).slice(0, 80));
          removeStored();
          return NextResponse.json({ success: true, data: { needs_confirm: true, transcript: text } });
        }
        transcript = text;
      } catch (sttErr: any) {
        console.error('STT 변환 중 에러 (무시하고 진행):', sttErr?.message);
        transcript = '(음성 변환 실패)';
      }
    }

    timer.mark('stt');

    // 받아쓰기와 같이 돌던 녹음 파일 저장이 실패했으면 예전처럼 여기서 멈춘다.
    if (storagePromise) {
      const { error: uploadError } = await storagePromise;
      if (uploadError) {
        console.error('Supabase 업로드 실패:', uploadError.message);
        return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
      }
    }

    const { data: entry, error: insertError } = await supabase
      .from('voice_entries')
      .insert({ user_id: userId, user_phone: effectivePhone, audio_url: audioUrl, persona, call_state: 'pending' })
      .select()
      .single();

    if (insertError || !entry) {
      console.error('DB 생성 실패:', insertError?.message);
      return NextResponse.json({ success: false, error: insertError?.message }, { status: 500 });
    }

    // 전화 여부 판단에만 쓰는 설정 — 미리 읽기 시작해두고 마지막에 받는다.
    // 기억 검색에 쓸 원문 임베딩을 분석 GPT가 도는 동안 미리 만들어둔다(검색 단계에서 그대로 재사용).
    prefetchEmbedding(transcript);
    const prefsPromise = loadUserPrefs(userId);
    prefsPromise.catch(() => {}); // 먼저 실패해도 경고 안 나게 — 실제 실패 처리는 아래 await에서
    timer.mark('save');

    let analysisResult: any = null;
    let commitmentUntil: string | null = null;
    let responseResult: any = null;
    // P0 — 이번 발화에서 과거 기억 검색이 실제로 무엇을 했는지. voice_entries.response.retrieval_trace로 함께 저장된다.
    let retrievalTrace: RetrievalTrace | null = null;
    // 대답이 실제로 쓴 과거 기억(원문+시각) — 홈이 "기억 소환" 순간을 크게 보여준다. 없으면 null.
    let recalled: Recall | null = null;
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

    timer.mark('analysis');

    if (analysisResult) {
      // memory_units에서 오늘 발화와 관련될 수도 있는 과거 기억을 retrieval — 실패해도 빈 배열로 계속 진행.
      // P0 — 원문 + 분석이 뽑은 상황 문장/핵심 주제어로 검색하고, 무엇을 찾았는지 기록(trace)을 함께 받는다.
      // 과거 기억 검색과 인사이트 검색은 서로 상관없으니 동시에 한다(예전엔 하나씩 차례로).
      let relevantMemoryUnits: Awaited<ReturnType<typeof retrieveRelevantMemoriesWithTrace>>['units'] = [];
      let relevantInsights: Awaited<ReturnType<typeof retrieveRelevantInsights>> = [];
      const [memRes, insightRes] = await Promise.allSettled([
        retrieveRelevantMemoriesWithTrace(userId, transcript, {
          situation: analysisResult.retrieval_situation ?? null,
          topics: Array.isArray(analysisResult.retrieval_topics) ? analysisResult.retrieval_topics : [],
        }),
        retrieveRelevantInsights(userId, transcript),
      ]);
      if (memRes.status === 'fulfilled') {
        relevantMemoryUnits = memRes.value.units;
        retrievalTrace = memRes.value.trace;
      } else {
        console.error('memory retrieval 실패 (무시하고 진행):', (memRes.reason as any)?.message);
      }
      if (insightRes.status === 'fulfilled') {
        relevantInsights = insightRes.value;
      } else {
        console.error('insight retrieval 실패 (무시하고 진행):', (insightRes.reason as any)?.message);
      }
      timer.mark('retrieval');

      try {
        responseResult = await generateResponse(
          transcript,
          analysisResult,
          userId,
          entry.id,
          memoryCandidates,
          existingCommitments,
          relevantMemoryUnits,
          relevantInsights,
          topicFromForm
        );
      } catch (respErr: any) {
        console.error('Response engine 에러 (무시하고 진행):', respErr?.message);
      }

      timer.mark('response');

      // 대답이 실제로 쓴 과거 기억의 원문/시각 — 홈의 기억 소환 연출에 필요해서 이것만 기다린다.
      if (responseResult?.memory_unit_id_used) {
        recalled = await loadRecall(responseResult.memory_unit_id_used);
      }

      // 아래 기록들은 대답에 필요 없으니 대답을 돌려준 뒤 뒤에서 한다.
      const usedMemoryId = responseResult?.memory_unit_id_used ?? null;
      const usedInsightId = responseResult?.insight_id_used ?? null;
      const detectedPattern = analysisResult.detected_pattern ?? undefined;
      const excuse = analysisResult.excuse ?? undefined;
      // responseEngine이 실제로 특정 memory_unit을 답변에 썼다면 last_referenced_at/reference_count 갱신.
      if (usedMemoryId) later('mark-memory', () => markMemoriesReferenced([usedMemoryId]));
      // responseEngine이 실제로 특정 insight를 답변에 썼다면 last_surfaced_at/surfaced_count 갱신.
      if (usedInsightId) later('mark-insight', () => markInsightsSurfaced([usedInsightId]));
      later('user-memory', () => updateUserMemory(userId, detectedPattern, excuse));
    }

    // Phase 2 (WRITE ONLY) — 기존 analysis/response/memory 흐름과 완전히 별개인 병렬 경로.
    // analysisResult 성패와 무관하게, transcript가 실제로 있으면 항상 시도한다.
    // runMemoryPipeline은 내부에서 모든 실패를 흡수하므로 여기서 실패해도 위/아래 로직에 영향이 없다.
    // 대답에는 안 쓰이는 "다음을 위한 저장"이라 대답을 돌려준 뒤 뒤에서 한다 — 예전엔 이게 끝날 때까지
    // (GPT 추출 + 기억마다 저장/연결/임베딩) 사용자가 기다렸다. 홈 바다는 잠시 뒤 다시 불러와 새 물고기를 반영한다.
    {
      const sourceChannel: 'voice' | 'text' = audio ? 'voice' : 'text';
      const entryId = entry.id;
      later('memory-pipeline', () => runMemoryPipeline(entryId, userId, transcript, sourceChannel));
    }

    let currentCallState: string;

    // MY > 참견 받는 방법: 문자·전화를 껐거나 '살짝'이면 전화하지 않는다(대답은 화면에 그대로 뜬다).
    // 설정을 못 읽으면 전화하지 않는 쪽으로 — 사용자가 꺼둔 전화가 울리는 것보다 안전하다.
    let callsAllowed = false;
    try {
      callsAllowed = allowsCalls((await prefsPromise).prefs);
    } catch (prefErr: any) {
      console.error('사용자 설정 조회 실패 — 이번엔 전화하지 않음:', prefErr?.message);
    }

    if (!analysisResult) {
      currentCallState = 'saved_only';
    } else if (responseResult?.channel === 'call' && callsAllowed) {
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
      // P0 — response jsonb에 retrieval_trace를 함께 남긴다(스키마 변경 없음). responseResult가 없으면 기존처럼 null.
         // reply_to — 참견이의 말(proactive callback / 홈에서 방금 받은 대답)에 대답한 녹음이면 그 말.
      // 홈 어항은 이런 "대화"를 생각(금붕어)으로 세지 않는다(api/user/entries → isReply). 스키마 변경 없음.
      response: responseResult
              ? {
            ...responseResult,
            retrieval_trace: retrievalTrace,
            // 꺼낸 기억 — 홈 기억 소환 연출 + 나중에 물고기 대화 기록에서도 쓴다(스키마 변경 없음, response jsonb 안).
            ...(recalled ? { recalled } : {}),
            reply_to: topicFromForm ?? null,
            // 환각 의심이었지만 사용자가 "맞아"라고 확인한 녹음 — 목록에서 걸러지지 않게 표시한다.
            ...(speechConfirmed ? { speech_confirmed: true } : {}),
          }
        : null,
      call_message: responseResult?.response || null,
      commitment_until: commitmentUntil,
      call_state: currentCallState,
    };

    const { error: updateError } = await supabase.from('voice_entries').update(updateData).eq('id', entry.id);
    if (updateError) console.error('DB 업데이트 실패:', updateError.message);

    timer.mark('finish');
    timer.log(`entry=${entry.id} regen=${responseResult?.regeneration_count ?? '-'}`);
    return NextResponse.json({ success: true, data: { ...entry, ...updateData } });
  } catch (globalErr: any) {
    console.error('서버 에러:', globalErr);
    return NextResponse.json({ success: false, error: globalErr.message }, { status: 500 });
  }
}
