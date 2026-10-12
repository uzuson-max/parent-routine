// lib/reminders/store.ts
// ============================================================================
// 알람 저장소(reminders 테이블) — 서버 전용. SQL: docs/sql/2026-10-12_notes_reminders.sql
// 모든 사용자용 함수는 userId로 직접 거른다(service role은 RLS를 우회한다).
// ============================================================================
import { supabase } from '@/lib/supabase';
import { hasPushSubscription } from '@/lib/webPush';
import { MAX_ACTIVE_PER_USER, type ReminderSource, type ReminderStatus } from '@/lib/reminders/core';

export interface Reminder {
  id: number;
  title: string;
  remindAt: string;
  status: ReminderStatus;
  source: ReminderSource;
  sourceEntryId: string | null;
  noteId: number | null;
  channel: 'push' | 'sms' | null;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface DeliveryAbility {
  push: boolean; // 이 계정에 앱 알림을 받을 기기가 있고, 서버에 VAPID 키도 있다
  sms: boolean; // 인증된 전화번호가 있고, 서버에 문자 발송 설정이 있다
}

export const COLS =
  'id, user_id, title, remind_at, status, source, source_entry_id, note_id, channel, attempts, last_error, sent_at, created_at, updated_at';

export function toReminder(r: any): Reminder {
  return {
    id: Number(r.id),
    title: String(r.title ?? ''),
    remindAt: r.remind_at,
    status: r.status,
    source: r.source,
    sourceEntryId: r.source_entry_id ?? null,
    noteId: r.note_id === null || r.note_id === undefined ? null : Number(r.note_id),
    channel: r.channel ?? null,
    attempts: Number(r.attempts ?? 0),
    lastError: r.last_error ?? null,
    sentAt: r.sent_at ?? null,
    createdAt: r.created_at,
  };
}

export class ReminderError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
  }
}

export function smsConfigured(): boolean {
  return !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER_NUMBER);
}

export async function userPhone(userId: string): Promise<string | null> {
  const { data } = await supabase.from('user_memory').select('phone_number').eq('user_id', userId).maybeSingle();
  if (data?.phone_number) return String(data.phone_number);
  // 전화 인증은 auth.users.phone에 먼저 남는다(lib/phoneAuthClient.ts) — user_memory가 비어 있을 때의 보험.
  try {
    const { data: u } = await supabase.auth.admin.getUserById(userId);
    return u?.user?.phone ? String(u.user.phone) : null;
  } catch {
    return null;
  }
}

export async function deliveryAbility(userId: string): Promise<DeliveryAbility> {
  const [push, phone] = await Promise.all([
    hasPushSubscription(userId).catch(() => false),
    smsConfigured() ? userPhone(userId) : Promise.resolve(null),
  ]);
  return { push, sms: !!phone };
}

/**
 * 화면 목록 — 아직 안 끝난 것(예약/보내는 중/실패)은 시각과 상관없이 전부, 보낸 건 최근 2주 것만.
 * 취소한 건 안 보인다. (시각이 지났는데 아직 scheduled면 화면이 "아직 못 알려줬어"로 드러낸다 — 숨기지 않는다)
 */
export async function listForUser(userId: string): Promise<Reminder[]> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('reminders')
    .select(COLS)
    .eq('user_id', userId)
    .or(`status.in.(scheduled,sending,failed),and(status.eq.sent,remind_at.gte.${since})`)
    .order('remind_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(toReminder);
}

async function assertOwned(table: 'voice_entries' | 'sea_notes', id: string | number, userId: string) {
  const { data, error } = await supabase.from(table).select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ReminderError(404, '연결할 기록을 못 찾았어.');
}

export async function createForUser(
  userId: string,
  input: { title: string; remindAt: Date; source: ReminderSource; sourceEntryId?: string | null; noteId?: number | null }
): Promise<{ reminder: Reminder; existed: boolean }> {
  if (input.sourceEntryId) await assertOwned('voice_entries', input.sourceEntryId, userId);
  if (input.noteId) await assertOwned('sea_notes', input.noteId, userId);

  const { count, error: cErr } = await supabase
    .from('reminders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'scheduled');
  if (cErr) throw cErr;
  if ((count ?? 0) >= MAX_ACTIVE_PER_USER) throw new ReminderError(409, `알람은 ${MAX_ACTIVE_PER_USER}개까지만 걸어둘 수 있어.`);

  const { data, error } = await supabase
    .from('reminders')
    .insert({
      user_id: userId,
      title: input.title,
      remind_at: input.remindAt.toISOString(),
      source: input.source,
      source_entry_id: input.sourceEntryId ?? null,
      note_id: input.noteId ?? null,
    })
    .select(COLS)
    .single();
  if (error) {
    // 같은 녹음으로 이미 만든 알람 — 버튼을 두 번 눌렀거나 재시도. 새로 만들지 않고 그걸 돌려준다.
    if (error.code === '23505' && input.sourceEntryId) {
      const { data: existing } = await supabase
        .from('reminders')
        .select(COLS)
        .eq('user_id', userId)
        .eq('source_entry_id', input.sourceEntryId)
        .neq('status', 'canceled')
        .maybeSingle();
      if (existing) return { reminder: toReminder(existing), existed: true };
    }
    throw error;
  }
  return { reminder: toReminder(data), existed: false };
}

/** 고치기 — 아직 안 울렸거나 실패한 것만. 고치면 처음부터 다시 예약된다. */
export async function updateForUser(userId: string, id: number, patch: { title?: string; remindAt?: Date }): Promise<Reminder> {
  const fields: Record<string, unknown> = {
    status: 'scheduled',
    attempts: 0,
    last_error: null,
    channel: null,
    sent_at: null,
    updated_at: new Date().toISOString(),
  };
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.remindAt !== undefined) fields.remind_at = patch.remindAt.toISOString();
  const { data, error } = await supabase
    .from('reminders')
    .update(fields)
    .eq('id', id)
    .eq('user_id', userId)
    .in('status', ['scheduled', 'failed'])
    .select(COLS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw await explainUnchangeable(userId, id);
  return toReminder(data);
}

/** 취소 — 기록은 남기고(status=canceled) 목록에서만 뺀다. 이미 보내는 중/보낸 건 취소할 수 없다. */
export async function cancelForUser(userId: string, id: number): Promise<void> {
  const { data, error } = await supabase
    .from('reminders')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .in('status', ['scheduled', 'failed'])
    .select('id');
  if (error) throw error;
  if (!(data ?? []).length) throw await explainUnchangeable(userId, id);
}

async function explainUnchangeable(userId: string, id: number): Promise<ReminderError> {
  const { data } = await supabase.from('reminders').select('status').eq('id', id).eq('user_id', userId).maybeSingle();
  if (!data) return new ReminderError(404, '그 알람이 없어.');
  if (data.status === 'sending') return new ReminderError(409, '지금 막 알려주는 중이야.', 'sending');
  if (data.status === 'sent') return new ReminderError(409, '이미 알려준 알람이야.', 'sent');
  return new ReminderError(409, '이미 취소된 알람이야.', 'canceled');
}
