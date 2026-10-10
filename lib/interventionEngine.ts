
import { supabase } from '@/lib/supabase';
import { PERSONALITY_PROMPT } from '@/lib/responseEngine';
import { InterventionType } from '@/lib/intervention/interventionTypes';
import { checkPushGate } from '@/lib/intervention/pushGate';
import { canReach, deliverPush } from '@/lib/intervention/dispatch';
import { isEveBefore, scheduleEvent } from '@/lib/intervention/eventSchedule';
import { smsLengthRule } from '@/lib/intervention/smsFit';
import { kstHuman, kstIsoWithWeekday, relativeFromNow } from '@/lib/intervention/kstTime';
import {
  CommitmentKind,
  commitmentExpiry,
  commitmentReferencedAt,
} from '@/lib/intervention/commitmentSchedule';

// ============================================================================
// commitment_memory 기반 개입 엔진 — REMINDER, COMMITMENT_CHECK, 그리고 일정(kind='event')을 다룬다.
//
//   EVENT (kind='event')                  사용자가 말한 날짜 정해진 일정(면접, 치과…). 묻지 않고 자동 저장된다(lib/events.ts).
//                                         stage 0 → 그날 아침(이른 일정이면 전날 저녁) "오늘이지?" (EVENT_DAY)
//                                         stage 1 → 끝나고 3시간 뒤 "어땠어?" (COMMITMENT_CHECK) → 종료
//                                         다른 참견의 하루 상한/쿨다운에서 빠지지만 조용한 시간은 지킨다(pushGate eventBound).
//
//   REMINDER         (kind='reminder')   사용자가 "다시 알려줘"라고 한 일정. 지정 시각(1시간 전)에 한 번 보낸다.
//                                         일반 쿨다운 bypass, 발송 후엔 일반 쿨다운이 다시 시작된다.
//   COMMITMENT_CHECK (kind='commitment') 사용자가 스스로 말한 약속. 기한이 지난 "뒤"에 결과를 한 번 묻는다.
//                                         global push gate(12시간 쿨다운, 하루 1회, 조용한 시간 등) 적용.
//
// 예전 동작(모든 약속에 2시간 뒤 1차 → 2시간 간격 2·3차 SMS → 전화 승격)은 폐지했다.
// 그 사다리는 기한과 무관하게 돌아서 "토요일 9시 출발"을 목요일 밤에 재촉하는 버그를 만들었다.
//
// intervention_stage는 기존 컬럼을 그대로 쓰되 의미를 단순화한다:
//   0 → 아직 안 보냄   4 → 종료(발송했거나, 만료됐거나, 보낼 수 없음). 종료 시 next_intervention_at=null.
// ============================================================================

const TERMINAL_STAGE = 4;
const INTERVENTION_HEADER = '참견이 등장.';

interface DueRow {
  id: string;
  user_id: string | null;
  user_phone: string | null;
  voice_entry_id: string | null;
  commitment: string;
  kind: CommitmentKind | 'event' | null;
  target_date: string | null;
  created_at: string;
  intervention_stage: number;
}

export interface ProcessResult {
  id: string;
  type: InterventionType;
  action: 'sms' | 'held' | 'expired' | 'dropped' | 'skipped_no_phone' | 'send_failed' | 'dry_run';
  reason?: string;
  retryAt?: string | null;
  message?: string;
  error?: string;
}

async function fetchDueRows(now: Date, limit = 20): Promise<DueRow[]> {
  const { data, error } = await supabase
    .from('commitment_memory')
    .select('id, user_id, user_phone, voice_entry_id, commitment, kind, target_date, created_at, intervention_stage')
    .eq('fulfilled', false)
    .not('next_intervention_at', 'is', null)
    .lte('next_intervention_at', now.toISOString())
    .lt('intervention_stage', TERMINAL_STAGE)
    .order('next_intervention_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[interventionEngine] fetchDueRows failed:', error.message);
    return [];
  }
  return ((data ?? []) as DueRow[]).filter((r) => r.commitment);
}

async function resolvePhone(row: DueRow): Promise<string | null> {
  if (row.user_phone) return row.user_phone;
  if (!row.user_id) return null;
  const { data } = await supabase.from('user_memory').select('phone_number').eq('user_id', row.user_id).maybeSingle();
  return data?.phone_number ?? null;
}

async function finish(rowId: string) {
  const { error } = await supabase
    .from('commitment_memory')
    .update({ intervention_stage: TERMINAL_STAGE, next_intervention_at: null })
    .eq('id', rowId)
    .eq('fulfilled', false);
  if (error) console.error('[interventionEngine] 종료 처리 실패:', error.message);
}

async function reschedule(rowId: string, at: Date) {
  const { error } = await supabase
    .from('commitment_memory')
    .update({ next_intervention_at: at.toISOString() })
    .eq('id', rowId)
    .eq('fulfilled', false);
  if (error) console.error('[interventionEngine] 재스케줄 실패:', error.message);
}

async function setStage(rowId: string, stage: number, nextAt: Date) {
  const { error } = await supabase
    .from('commitment_memory')
    .update({ intervention_stage: stage, next_intervention_at: nextAt.toISOString() })
    .eq('id', rowId)
    .eq('fulfilled', false);
  if (error) console.error('[interventionEngine] 단계 변경 실패:', error.message);
}

// ---- 문구 생성 ---------------------------------------------------------------------------

// 사용자가 "지금 무엇을 하고 있는지"를 추측하는 문장. 미래 사건을 현재 행동으로 바꾸는 버그의 흔적이라
// 생성 결과에 이게 있으면 버리고 고정 문구를 쓴다.
const PRESENT_ACTION_GUESS_RE = /지금쯤|하고\s*있을\s*(시간|거)|하고\s*있겠|준비하고\s*있|일어났(어|겠|지)|벌써\s*(출발|나갔)/;

export function hasPresentActionGuess(text: string): boolean {
  return PRESENT_ACTION_GUESS_RE.test(text);
}

async function generateLine(systemPrompt: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');
    const text = typeof parsed.message === 'string' ? parsed.message.trim() : '';
    return text || null;
  } catch (err: any) {
    console.error('[interventionEngine] 문구 생성 실패:', err?.message ?? err);
    return null;
  }
}

const COMMON_RULES = `[공통 규칙]
- 이건 문자메시지 본문이다. "참견이 등장." 같은 머리말은 시스템이 따로 붙이니 절대 쓰지 마라.
- 사용자가 지금 무엇을 하고 있는지 추측하지 마라. "지금쯤 ~하고 있겠지", "벌써 일어났어?" 같은 문장 금지.
- 아래 [사실]에 없는 시간/장소/상황/결과를 지어내지 마라.
- 반말. 명령형("해", "잊지 마") 금지, 상담사/알림 말투 금지.
- 질문은 최대 하나.

${smsLengthRule(true)}`;
async function buildReminderMessage(row: DueRow, eventAt: Date | null, now: Date): Promise<string> {
  const fallback = eventAt
    ? `${relativeFromNow(eventAt, now).replace('약 ', '')}에 그거 있잖아. "${row.commitment}"`
    : `알려달라고 했던 거. "${row.commitment}"`;

  const facts = [
    `현재 시각: ${kstIsoWithWeekday(now)}`,
    eventAt ? `일정 시각: ${kstHuman(eventAt)} (${relativeFromNow(eventAt, now)})` : '일정 시각: 알 수 없음',
    `사용자가 알려달라고 한 말: "${row.commitment}"`,
  ].join('\n');

  const line = await generateLine(`${PERSONALITY_PROMPT}

지금 너는 사용자가 직접 "다시 알려줘"라고 부탁한 일정을 알려주는 문자를 쓴다. 압박이나 재촉이 아니라, 부탁받은 걸 챙겨주는 한마디다.

[사실]
${facts}

${COMMON_RULES}
- 일정이 언제인지(현재 시각 기준 상대 표현 또는 시각)를 자연스럽게 포함해라.

반드시 JSON으로만 답해: { "message": "..." }`);

  return line && !hasPresentActionGuess(line) ? line : fallback;
}

async function buildCommitmentCheckMessage(row: DueRow, dueAt: Date, now: Date): Promise<string> {
  const fallback = `"${row.commitment}" 그거, 어떻게 됐어?`;

  const facts = [
    `현재 시각: ${kstIsoWithWeekday(now)}`,
    `약속 기한: ${kstHuman(dueAt)} (${relativeFromNow(dueAt, now)} — 이미 지났음)`,
    `사용자가 스스로 한 말: "${row.commitment}"`,
  ].join('\n');

  const line = await generateLine(`${PERSONALITY_PROMPT}

지금 너는 사용자가 스스로 하겠다고 말했던 약속의 기한이 지난 뒤, 결과가 어떻게 됐는지 한 번 물어보는 문자를 쓴다.
재촉/경고가 아니다. 결과를 모르니 했다고도 안 했다고도 단정하지 마라.
예시 톤(베끼지 마라): "토요일에 운동하기로 했던 건 어떻게 됐어?"

[사실]
${facts}

${COMMON_RULES}
- 한 번에 답할 수 있는 질문 하나로 끝내라.

반드시 JSON으로만 답해: { "message": "..." }`);

  return line && !hasPresentActionGuess(line) ? line : fallback;
}

async function buildEventDayMessage(row: DueRow, eventAt: Date, now: Date): Promise<string> {
  const eve = isEveBefore(eventAt, now);
  const fallback = eve ? `내일 ${row.commitment} 있다며.` : `오늘이 그 ${row.commitment} 날이지?`;
  const facts = [
    `현재 시각: ${kstIsoWithWeekday(now)}`,
    `일정 시각: ${kstHuman(eventAt)} (${relativeFromNow(eventAt, now)})`,
    `사용자가 말해둔 일정: "${row.commitment}"`,
    eve ? '지금은 일정 전날 저녁이다.' : '지금은 일정 당일 아침이다.',
  ].join('\n');

  const line = await generateLine(`${PERSONALITY_PROMPT}

지금 너는 사용자가 예전에 지나가듯 말해둔 일정 날을 기억하고, ${eve ? '전날 저녁에' : '그날 아침에'} 먼저 아는 척하는 한마디를 쓴다.
"나 그거 기억하고 있었지" 느낌이 핵심이다. 응원/훈계/할 일 지시가 아니다.
예시 톤(베끼지 마라): "오늘 그 면접 날이지?", "내일 치과 있다며. 떨려?"

[사실]
${facts}

${COMMON_RULES}
- 일정이 ${eve ? '내일' : '오늘'}이라는 걸 자연스럽게 담아라.

반드시 JSON으로만 답해: { "message": "..." }`);
  return line && !hasPresentActionGuess(line) ? line : fallback;
}

async function buildEventCheckMessage(row: DueRow, eventAt: Date, now: Date): Promise<string> {
  const fallback = `${row.commitment} 어땠어?`;
  const facts = [
    `현재 시각: ${kstIsoWithWeekday(now)}`,
    `일정 시각: ${kstHuman(eventAt)} (${relativeFromNow(eventAt, now)} — 이미 지났음)`,
    `사용자가 말해둔 일정: "${row.commitment}"`,
  ].join('\n');

  const line = await generateLine(`${PERSONALITY_PROMPT}

지금 너는 사용자가 말해둔 일정이 끝난 뒤, 어땠는지 궁금해서 먼저 묻는 한마디를 쓴다.
결과를 모르니 잘됐다고도 망했다고도 단정하지 마라. 한 번에 답할 수 있는 질문 하나.
예시 톤(베끼지 마라): "면접 어땠어? 떨었지?", "치과 갔다 왔어?"

[사실]
${facts}

${COMMON_RULES}

반드시 JSON으로만 답해: { "message": "..." }`);
  return line && !hasPresentActionGuess(line) ? line : fallback;
}

/** 일정(kind='event') 한 줄 처리 — 그날 아침 → 끝난 뒤, 두 번만 찾아간다. */
async function processEventRow(row: DueRow, now: Date, dryRun: boolean): Promise<ProcessResult> {
  const atRaw = row.target_date ? new Date(row.target_date) : null;
  if (!row.user_id || !atRaw) {
    if (!dryRun) await finish(row.id);
    return { id: row.id, type: 'COMMITMENT_CHECK', action: 'dropped', reason: '사용자/일정 시각 없음' };
  }
  const at: Date = atRaw;
  const sch = scheduleEvent(at, new Date(row.created_at));
  const isDay = row.intervention_stage === 0;
  const type: InterventionType = isDay ? 'EVENT_DAY' : 'COMMITMENT_CHECK';

  if (now.getTime() > sch.expiresAt.getTime()) {
    if (!dryRun) await finish(row.id);
    return { id: row.id, type, action: 'expired', reason: '일정 끝나고 너무 지남 — 폐기' };
  }
  // 아침 알림을 못 보낸 채 일정이 시작됐으면 아침 알림은 건너뛰고 "끝난 뒤" 단계로
  if (isDay && now.getTime() >= at.getTime()) {
    if (!dryRun) await setStage(row.id, 1, sch.checkAt);
    return { id: row.id, type, action: 'held', reason: '일정이 이미 시작돼 아침 알림 건너뜀', retryAt: sch.checkAt.toISOString() };
  }

  const topicKey = `event:${row.id}:${isDay ? 'day' : 'check'}`;
  const gate = await checkPushGate(row.user_id, {
    type,
    channel: 'sms',
    now,
    topicKey,
    referencedEventAt: isDay ? null : at,
    expiresAt: isDay ? at : sch.expiresAt,
    eventBound: true,
  });
  if (!gate.allowed) {
    if (!dryRun) {
      if (gate.retryAt) await reschedule(row.id, gate.retryAt);
      else if (isDay) await setStage(row.id, 1, sch.checkAt);
      else await finish(row.id);
    }
    return { id: row.id, type, action: gate.retryAt ? 'held' : 'dropped', reason: gate.reason, retryAt: gate.retryAt?.toISOString() ?? null };
  }

  const body = isDay ? await buildEventDayMessage(row, at, now) : await buildEventCheckMessage(row, at, now);
  if (dryRun) return { id: row.id, type, action: 'dry_run', reason: gate.reason, message: body };

  const phone = await resolvePhone(row);
  if (!(await canReach(row.user_id, phone))) {
    // 찾아갈 수단이 없다(앱 알림 미허용 + 번호 없음). 다음 단계로 넘기거나 끝낸다.
    if (isDay) await setStage(row.id, 1, sch.checkAt);
    else await finish(row.id);
    return { id: row.id, type, action: 'skipped_no_phone', reason: '앱 알림도 문자도 보낼 수 없음' };
  }

  const sent = await deliverPush({
    userId: row.user_id,
    phone,
    type,
    channel: 'sms',
    header: INTERVENTION_HEADER,
    body,
    reason: `${isDay ? 'event_day' : 'event_check'}: ${row.commitment}`,
    topicKey,
    triggerEntryId: row.voice_entry_id,
  });
  if (isDay) await setStage(row.id, 1, sch.checkAt);
  else await finish(row.id);
  return { id: row.id, type, action: 'sms', message: sent.text, reason: `via ${sent.via}` };
}

// ---- 메인 --------------------------------------------------------------------------------

/**
 * 도래한 REMINDER / COMMITMENT_CHECK 후보를 처리한다.
 * dryRun=true면 발송/DB 갱신 없이 판단과 문구만 반환한다 (GPT 문구 생성은 실행).
 */
export async function processDueInterventions(dryRun: boolean = false): Promise<ProcessResult[]> {
  const now = new Date();
  const rows = await fetchDueRows(now);
  const results: ProcessResult[] = [];

  for (const row of rows) {
    if (row.kind === 'event') {
      try {
        results.push(await processEventRow(row, now, dryRun));
      } catch (err: any) {
        console.error(`[interventionEngine] event#${row.id} 처리 실패:`, err?.message);
        results.push({ id: row.id, type: 'EVENT_DAY', action: 'send_failed', error: err?.message ?? String(err) });
      }
      continue;
    }
    const kind: CommitmentKind = row.kind === 'reminder' ? 'reminder' : 'commitment';
    const type: InterventionType = kind === 'reminder' ? 'REMINDER' : 'COMMITMENT_CHECK';
    const createdAt = new Date(row.created_at);
    const targetDate = row.target_date ? new Date(row.target_date) : null;
    const expiresAt = commitmentExpiry(kind, targetDate, createdAt);

    try {
      if (!row.user_id) {
        if (!dryRun) await finish(row.id);
        results.push({ id: row.id, type, action: 'dropped', reason: 'user_id 없음' });
        continue;
      }

      if (now.getTime() > expiresAt.getTime()) {
        if (!dryRun) await finish(row.id);
        results.push({ id: row.id, type, action: 'expired', reason: '만료 — 보내지 않고 폐기' });
        continue;
      }

      const referencedEventAt = kind === 'reminder' ? targetDate : commitmentReferencedAt(targetDate, createdAt);
      const topicKey = `commitment:${row.id}`;

      const gate = await checkPushGate(row.user_id, {
        type,
        channel: 'sms',
        now,
        topicKey,
        referencedEventAt,
        expiresAt,
      });

      if (!gate.allowed) {
        if (!dryRun) {
          if (gate.retryAt) await reschedule(row.id, gate.retryAt);
          else await finish(row.id);
        }
        results.push({
          id: row.id,
          type,
          action: gate.retryAt ? 'held' : 'dropped',
          reason: gate.reason,
          retryAt: gate.retryAt?.toISOString() ?? null,
        });
        continue;
      }

      const body =
        kind === 'reminder'
          ? await buildReminderMessage(row, targetDate, now)
          : await buildCommitmentCheckMessage(row, referencedEventAt as Date, now);

      if (dryRun) {
        results.push({ id: row.id, type, action: 'dry_run', reason: gate.reason, message: body });
        continue;
      }

      const phone = await resolvePhone(row);
      if (!(await canReach(row.user_id, phone))) {
        // 앱 알림도 문자도 보낼 수단이 없다. 만료 전까지 하루 뒤 다시 확인한다.
        await reschedule(row.id, new Date(now.getTime() + 24 * 60 * 60 * 1000));
        results.push({ id: row.id, type, action: 'skipped_no_phone' });
        continue;
      }

      const sent = await deliverPush({
        userId: row.user_id,
        phone,
        type,
        channel: 'sms',
        header: INTERVENTION_HEADER,
        body,
        reason: `${type.toLowerCase()}: ${row.commitment}`,
        topicKey,
        triggerEntryId: row.voice_entry_id,
      });
      await finish(row.id);
      results.push({ id: row.id, type, action: 'sms', message: sent.text, reason: `via ${sent.via}` });
    } catch (err: any) {
      // 발송 실패 → 상태를 건드리지 않는다. 다음 실행 때 같은 조건으로 재시도된다(만료되면 폐기).
      console.error(`[interventionEngine] commitment_memory#${row.id} 처리 실패:`, err?.message);
      results.push({ id: row.id, type, action: 'send_failed', error: err?.message ?? String(err) });
    }
  }

  return results;
}
