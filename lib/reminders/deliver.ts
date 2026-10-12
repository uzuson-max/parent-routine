// lib/reminders/deliver.ts
// ============================================================================
// 알람 발송 — 서버 전용. /api/cron/send-reminders가 1분마다 부른다(Supabase pg_cron → SQL: docs/sql/2026-10-12_reminder_cron.sql).
// ----------------------------------------------------------------------------
// 두 번 보내지 않기
//   1) 보낼 알람을 "scheduled → sending"으로 바꾸는 조건부 UPDATE에 성공한 쪽만 보낸다.
//      크론이 겹쳐 돌아도 같은 줄을 두 군데서 잡을 수 없다(Postgres 행 잠금).
//   2) 보낸 뒤 sent로 바꾼다. 앱 알림에는 tag=reminder-{id}를 달아 기기에서도 같은 알림이 겹치지 않는다.
// 실패
//   - 일시적 실패(네트워크 등): 다음 크론에서 다시. 최대 3번, 2시간 넘게 늦으면 포기.
//   - 영구 실패(알려줄 수단 없음, 문자 길이 초과): 바로 failed. 화면에 이유가 보인다.
//   - sending에서 10분 넘게 멈춤(크론이 중간에 죽음): 위 규칙대로 다시 시도/포기.
// 채널
//   앱 알림 기기가 있으면 앱 알림(무료). 없거나 전부 실패하면 인증된 번호로 문자(기존 Solapi, 90바이트 SMS 전용).
//   참견 개입(lib/intervention/dispatch.ts)과는 일부러 분리 — 쿨다운 기록(intervention_log)/편지를 남기지 않는다.
// ============================================================================
import { supabase } from '@/lib/supabase';
import { hasPushSubscription, sendWebPush } from '@/lib/webPush';
import { sendSolapiSms, SmsTooLongError } from '@/lib/solapi';
import { COLS, smsConfigured, toReminder, userPhone, type Reminder } from '@/lib/reminders/store';
import { afterFailure, isTooLate, recoverStuck, REMINDER_HEADER, STUCK_SENDING_MS } from '@/lib/reminders/core';

const BATCH = 50;

export class PermanentError extends Error {}

// 테스트에서 DB/발송을 바꿔 끼울 수 있게(scripts/test-reminders.ts). 운영에서는 기본값 그대로.
type Db = typeof supabase;
export interface DeliverDeps {
  db?: Db;
  send?: (r: Reminder & { userId: string }) => Promise<'push' | 'sms'>;
}

export interface SendResult {
  id: number;
  outcome: 'sent' | 'retry' | 'failed' | 'late' | 'skipped';
  channel?: 'push' | 'sms';
  error?: string;
}

/** 실제 전달 — 성공하면 쓴 채널, 실패하면 throw. */
async function deliverOne(r: Reminder & { userId: string }): Promise<'push' | 'sms'> {
  if (await hasPushSubscription(r.userId)) {
    const pushed = await sendWebPush(r.userId, {
      title: REMINDER_HEADER,
      body: r.title,
      url: '/?reminder=' + r.id,
      tag: 'reminder-' + r.id,
    });
    if (pushed.sent > 0) return 'push';
    // 모든 기기 실패(구독 만료 등) → 문자로
  }
  if (!smsConfigured()) throw new PermanentError('no_channel: 앱 알림 기기 없음, 문자 설정 없음');
  const phone = await userPhone(r.userId);
  if (!phone) throw new PermanentError('no_channel: 앱 알림 기기도 전화번호도 없음');
  try {
    await sendSolapiSms(phone, r.title, { header: REMINDER_HEADER, logTag: 'Reminder SMS' });
  } catch (e: any) {
    if (e instanceof SmsTooLongError) throw new PermanentError('sms_too_long');
    throw e;
  }
  return 'sms';
}

/** sending에서 멈춘 줄 정리 — 다시 scheduled로 돌리거나 failed로 끝낸다. */
async function recoverStuckRows(now: Date, db: Db): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_SENDING_MS).toISOString();
  const { data, error } = await db
    .from('reminders')
    .select('id, attempts, remind_at')
    .eq('status', 'sending')
    .lt('updated_at', cutoff)
    .limit(BATCH);
  if (error) throw error;
  let n = 0;
  for (const row of data ?? []) {
    const next = recoverStuck(Number(row.attempts ?? 0), row.remind_at, now);
    const { error: uErr } = await db
      .from('reminders')
      .update(
        next === 'retry'
          ? { status: 'scheduled', last_error: 'stuck', updated_at: now.toISOString() }
          : { status: 'failed', last_error: 'stuck: 발송 중 멈춤', updated_at: now.toISOString() }
      )
      .eq('id', row.id)
      .eq('status', 'sending');
    if (!uErr) n++;
  }
  return n;
}

export async function processDueReminders(
  now: Date = new Date(),
  opts: { dryRun?: boolean } = {},
  deps: DeliverDeps = {}
): Promise<{
  recovered: number;
  results: SendResult[];
}> {
  const db = deps.db ?? supabase;
  const send = deps.send ?? deliverOne;
  const recovered = opts.dryRun ? 0 : await recoverStuckRows(now, db);

  const { data, error } = await db
    .from('reminders')
    .select(COLS)
    .eq('status', 'scheduled')
    .lte('remind_at', now.toISOString())
    .order('remind_at', { ascending: true })
    .limit(BATCH);
  if (error) throw error;

  const results: SendResult[] = [];
  for (const raw of data ?? []) {
    const r = { ...toReminder(raw), userId: String((raw as any).user_id) };
    if (opts.dryRun) {
      results.push({ id: r.id, outcome: isTooLate(r.remindAt, now) ? 'late' : 'skipped' });
      continue;
    }

    // 너무 늦었으면 보내지 않고 실패로 남긴다 — 화면에 "그때 못 알려줬어"가 보인다.
    if (isTooLate(r.remindAt, now)) {
      await db
        .from('reminders')
        .update({ status: 'failed', last_error: 'late', updated_at: now.toISOString() })
        .eq('id', r.id)
        .eq('status', 'scheduled');
      results.push({ id: r.id, outcome: 'late' });
      continue;
    }

    // 잡기 — 이 UPDATE가 행을 돌려줘야만 내가 보낸다(다른 크론이 먼저 잡았으면 빈 결과).
    const { data: claimed, error: claimErr } = await db
      .from('reminders')
      .update({ status: 'sending', attempts: r.attempts + 1, updated_at: now.toISOString() })
      .eq('id', r.id)
      .eq('status', 'scheduled')
      .select('id');
    if (claimErr || !(claimed ?? []).length) {
      results.push({ id: r.id, outcome: 'skipped' });
      continue;
    }

    try {
      const channel = await send(r);
      const { error: doneErr } = await db
        .from('reminders')
        .update({ status: 'sent', channel, sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
        .eq('id', r.id)
        .eq('status', 'sending');
      // 이미 보냈다. 기록만 실패하면 sending에 남아 10분 뒤 "멈춤"으로 재시도될 수 있다 — 크게 남긴다.
      if (doneErr) console.error('[reminders] 발송은 됐는데 sent 기록 실패:', r.id, doneErr.message);
      results.push({ id: r.id, outcome: 'sent', channel });
    } catch (e: any) {
      const permanent = e instanceof PermanentError;
      const msg = String(e?.message ?? e).slice(0, 300);
      const next = afterFailure(r.attempts + 1, r.remindAt, new Date(), permanent);
      await db
        .from('reminders')
        .update({ status: next === 'retry' ? 'scheduled' : 'failed', last_error: msg, updated_at: new Date().toISOString() })
        .eq('id', r.id)
        .eq('status', 'sending');
      console.error(`[reminders] ${r.id} 발송 실패(${next}):`, msg);
      results.push({ id: r.id, outcome: next === 'retry' ? 'retry' : 'failed', error: msg });
    }
  }
  return { recovered, results };
}
