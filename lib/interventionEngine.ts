import { supabase } from '@/lib/supabase';
import { sendPenaltySms, sendRoutineCall } from '@/lib/twilio';
import { canCallNow, PERSONALITY_PROMPT } from '@/lib/responseEngine';

// intervention_stage 의미 (commitment_memory의 기존 컬럼을 그대로 사용, 새 컬럼 없음):
//   0 → 아직 개입 없음. 이번에 도래하면 1차 SMS를 보내고 1로 올린다.
//   1 → 1차 SMS 보낸 상태. 이번에 도래하면 2차 SMS를 보내고 2로 올린다.
//   2 → 2차 SMS 보낸 상태. 이번에 도래하면 3차 SMS를 보내고 3으로 올린다.
//   3 → 3차 SMS까지 보낸 상태. 이번에 도래하면 SMS가 아니라 "전화 승격"을 시도한다.
//   4 → 전화까지 갔거나(또는 더 이상 개입할 수단이 없어) 종료된 상태. next_intervention_at은 null로 만들어서
//       다시는 조회되지 않게 한다 (터미널 상태).

const INTERVENTION_INTERVAL_MS = 2 * 60 * 60 * 1000; // 단계 사이 2시간 간격. 필요시 조정 가능한 값일 뿐, 별도 설정 체계는 아직 안 만듦.

interface DueCommitment {
  id: string;
  user_id: string | null;
  user_phone: string | null;
  commitment: string;
  intervention_stage: number;
}

async function fetchDueInterventions(limit = 20): Promise<DueCommitment[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('commitment_memory')
    .select('id, user_id, user_phone, commitment, intervention_stage')
    .eq('fulfilled', false)
    .not('next_intervention_at', 'is', null)
    .lte('next_intervention_at', now)
    .lt('intervention_stage', 4) // 4(터미널)는 이미 끝난 것이라 애초에 조회 대상이 아님
    .order('next_intervention_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[interventionEngine] fetchDueInterventions failed:', error.message);
    return [];
  }
  return (data ?? []).filter((r: any) => r.commitment) as DueCommitment[];
}

async function resolvePhone(row: DueCommitment): Promise<string | null> {
  if (row.user_phone) return row.user_phone;
  if (!row.user_id) return null;
  const { data } = await supabase
    .from('user_memory')
    .select('phone_number')
    .eq('user_id', row.user_id)
    .maybeSingle();
  return data?.phone_number ?? null;
}

// SMS 1~3차 문구를 GPT로 생성한다. 이전에 보낸 문구를 그대로 저장해두는 컬럼이 없어서(새 컬럼 금지),
// "몇 번째 개입인지"를 단계별로 뚜렷이 다르게 지시해서 같은 문장이 반복되지 않게 만든다.
async function generateInterventionSms(commitment: string, stage: 1 | 2 | 3): Promise<string> {
  const stageInstruction =
    stage === 1
      ? '[1차 개입] 목적: 가볍게 상기시키고 부담 없이 행동을 유도한다. 참견이가 슬쩍 말을 거는 느낌. 아직 압박하지 않는다.'
      : stage === 2
      ? '[2차 개입] 목적: 사용자가 계속 미루고 있다는 걸 살짝 짚는다. "아직 안 했네?" 느낌으로, 1차보다 장난기와 집요함을 높여라. 재미있는 비유나 의인화를 써도 좋다(단, 실제로 확인 안 된 사실을 지어내면 안 됨).'
      : '[3차 개입] 목적: 실질적인 마지막 경고. 셋 중 가장 직접적이고 집요해야 한다. 가벼운 질문이나 확인형("~하는 거 맞지?")으로 끝내지 마라 — 행동을 촉구하는 문장이어야 하고, "지금 움직여야 한다"는 느낌이 분명해야 한다. 반드시 2차보다 행동 압박이 강해야 한다. 단, 모욕/비난/협박/과도한 공격성은 금지.';

  const systemPrompt = `${PERSONALITY_PROMPT}

지금 너는 화면 대화가 아니라, 사용자가 예전에 실제로 "기억해둬"를 눌러 확정한 약속에 대해 문자메시지로 먼저 찔러보는 상황이다.

확정된 약속: "${commitment}"

이 약속은 이미 확정된 것이므로 "~하기로 했잖아", "약속했잖아" 같은 표현을 써도 된다 (이건 event_memory/memory_candidate가 아니라 실제 commitment_memory에 있는 약속이라 근거가 있다).

${stageInstruction}

지켜야 할 것:
- commitment에 근거 없는 내용을 추가하지 마라. 존재하지 않는 과거 대화나 약속을 만들어내지 마라. 사용자가 하지 않은 말을 했다고 주장하지 마라. "전에 네가 ~라고 했잖아" 같은 새로운 과거 사실을 지어내지 마라.
- 지금 이 약속("${commitment}")의 의미를 그대로 유지해라 — 다른 주제로 새지 마라 (예: 운동 약속이면 운동 얘기여야지 다른 걸 언급하면 안 됨).
- commitment 문장을 매번 그대로 문장 첫머리에 복붙하지 마라. 1차/2차/3차가 서로 같은 문장 템플릿("~하기로 했잖아!"로 시작하는 식)처럼 느껴지면 안 된다 — 단계마다 시작하는 방식, 문장 구조, 접근 방식을 다르게 해라 (예: 질문으로 시작/상황 묘사로 시작/바로 지적하며 시작 등 다양하게).
- 단계가 올라갈수록 더 집요해져야 하고, 특히 3차는 1차·2차보다 확실히 더 강해야 한다 — 2차보다 약해지거나 단순 확인 질문으로 끝나면 안 된다.
- 재미있는 표현은 적극적으로 써라(사용자가 "아 또 참견이 시작했네ㅋㅋ" 싶은 느낌), 다만 억지 개그처럼 만들지는 마라.
- 친근한 참견 느낌을 유지해라. "운동하세요" 같은 딱딱한 알림 문구, 상담사 말투 금지.
- 모욕/비난/협박은 하지 마라.
- 1~3문장 이내로 짧게. SMS라 장문 설명은 금지.
- 날짜/횟수 등 데이터베이스 냄새나는 표현 금지.
- 이모지는 과하지 않게 최대 1개 정도.

반드시 아래 JSON 형식으로만 답해:
{ "message": "..." }`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.9,
      }),
    });
    if (!res.ok) throw new Error('개입 SMS 생성 실패: ' + (await res.text()));
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');
    const text: string | undefined = typeof parsed.message === 'string' ? parsed.message.trim() : undefined;
    return text && text.length > 0 ? text : `아직도 "${commitment}" 안 했지? 슬슬 좀 하자.`;
  } catch (err) {
    console.error('[interventionEngine] generateInterventionSms 실패:', err);
    // GPT 실패해도 개입 자체가 완전히 멈추지 않도록 최소한의 fallback 문구를 둔다.
    return `아직도 "${commitment}" 안 했지? 슬슬 좀 하자.`;
  }
}

interface ProcessResult {
  id: string;
  action: 'sms' | 'call' | 'skipped_no_phone' | 'skipped_call_not_allowed' | 'send_failed' | 'dry_run';
  stage: number;
  message?: string;
}

/**
 * 도래한 intervention을 전부 처리한다.
 * dryRun=true면 실제 Twilio 발송도, DB 갱신도 하지 않고 무엇을 보냈을지만 로그로 남긴다 (테스트용).
 */
export async function processDueInterventions(dryRun: boolean = false): Promise<ProcessResult[]> {
  const dueRows = await fetchDueInterventions();
  const results: ProcessResult[] = [];

  for (const row of dueRows) {
    const phone = await resolvePhone(row);

    if (row.intervention_stage <= 2) {
      // 0,1,2 → 이번에 1차/2차/3차 SMS를 보낸다.
      const nextStage = (row.intervention_stage + 1) as 1 | 2 | 3;
      const message = await generateInterventionSms(row.commitment, nextStage);

      if (dryRun) {
        console.log(`[interventionEngine][dry-run] commitment_memory#${row.id} → SMS ${nextStage}차 (미발송):`, message);
        results.push({ id: row.id, action: 'dry_run', stage: nextStage, message });
        continue;
      }

      if (!phone) {
        console.error(`[interventionEngine] commitment_memory#${row.id}: 전화번호 없음, SMS 발송 스킵`);
        results.push({ id: row.id, action: 'skipped_no_phone', stage: row.intervention_stage });
        continue; // 성공 못 했으니 stage/next_intervention_at 그대로 둠 → 다음 스케줄에도 다시 걸림
      }

      try {
        await sendPenaltySms(phone, message);
        const { error } = await supabase
          .from('commitment_memory')
          .update({
            intervention_stage: nextStage,
            next_intervention_at: new Date(Date.now() + INTERVENTION_INTERVAL_MS).toISOString(),
          })
          .eq('id', row.id)
          .eq('fulfilled', false); // 그 사이 완료 처리됐으면 덮어쓰지 않는 안전장치
        if (error) console.error('[interventionEngine] commitment_memory 갱신 실패:', error.message);
        results.push({ id: row.id, action: 'sms', stage: nextStage, message });
      } catch (smsErr: any) {
        console.error(`[interventionEngine] commitment_memory#${row.id} SMS 발송 실패:`, smsErr?.message);
        results.push({ id: row.id, action: 'send_failed', stage: row.intervention_stage });
        // 발송 실패 → stage/next_intervention_at 그대로 둔다. 다음 스케줄 때 같은 단계로 재시도됨.
      }
    } else {
      // stage === 3 → SMS 3차까지 이미 보낸 상태. 전화 승격을 시도한다.
      if (dryRun) {
        console.log(`[interventionEngine][dry-run] commitment_memory#${row.id} → 전화 승격 검토 (미발신)`);
        results.push({ id: row.id, action: 'dry_run', stage: 4 });
        continue;
      }

      if (!phone || !row.user_id) {
        console.error(`[interventionEngine] commitment_memory#${row.id}: 전화번호/user_id 없음, 종료 처리`);
        await supabase
          .from('commitment_memory')
          .update({ intervention_stage: 4, next_intervention_at: null })
          .eq('id', row.id)
          .eq('fulfilled', false);
        results.push({ id: row.id, action: 'skipped_no_phone', stage: 4 });
        continue;
      }

      // 기존 전화 제한(24시간 내 1회 / 7일 내 2회)을 그대로 재사용 — 여기서 별도로 완화하지 않는다.
      const allowed = await canCallNow(row.user_id);
      if (!allowed) {
        // 지금은 전화 못 거니, 나중에 다시 시도할 수 있도록 next_intervention_at만 미룬다 (stage는 3 유지).
        await supabase
          .from('commitment_memory')
          .update({ next_intervention_at: new Date(Date.now() + INTERVENTION_INTERVAL_MS).toISOString() })
          .eq('id', row.id)
          .eq('fulfilled', false);
        results.push({ id: row.id, action: 'skipped_call_not_allowed', stage: 3 });
        continue;
      }

      const callMessage = await generateInterventionSms(row.commitment, 3); // 3차와 같은 급의 압박 톤을 통화 멘트로도 사용
      try {
        const callResult = await sendRoutineCall({
          routineId: row.id,
          phoneNumber: phone,
          message: callMessage,
        });
        if (callResult.success) {
          await supabase
            .from('commitment_memory')
            .update({ intervention_stage: 4, next_intervention_at: null })
            .eq('id', row.id)
            .eq('fulfilled', false);
          results.push({ id: row.id, action: 'call', stage: 4, message: callMessage });
        } else {
          console.error(`[interventionEngine] commitment_memory#${row.id} 전화 발신 실패:`, callResult.error);
          results.push({ id: row.id, action: 'send_failed', stage: 3 });
        }
      } catch (callErr: any) {
        console.error(`[interventionEngine] commitment_memory#${row.id} 전화 발신 예외:`, callErr?.message);
        results.push({ id: row.id, action: 'send_failed', stage: 3 });
      }
    }
  }

  return results;
}
