// app/api/user/reminders/route.ts
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { isMissingTable } from '@/lib/seaNotes';
import { normalizeRemindAt, normalizeSource, normalizeTitle } from '@/lib/reminders/core';
import { createForUser, deliveryAbility, listForUser, ReminderError } from '@/lib/reminders/store';

export const dynamic = 'force-dynamic';

// ============================================================================
// 알람 목록/만들기.
//   GET  → { reminders, delivery: { push, sms } }
//          delivery = 지금 이 계정에 실제로 알려줄 수단이 있는지. 둘 다 false면 화면이 숨기지 않고 알려준다.
//   POST { title, remind_at(ISO), source?, source_entry_id?, note_id? } → { reminder, existed, delivery }
//          알려줄 수단이 하나도 없으면 만들지 않는다(409 no_channel) — 울리지 않을 알람을 걸어두는 건 거짓말이다.
// ============================================================================

const NOT_READY = { success: false, code: 'not_ready', error: '알람이 아직 준비 안 됐어' };

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다' }, { status: 401 });
  try {
    const [reminders, delivery] = await Promise.all([listForUser(userId), deliveryAbility(userId)]);
    return NextResponse.json({ success: true, data: { reminders, delivery } });
  } catch (err: any) {
    if (isMissingTable(err)) return NextResponse.json(NOT_READY, { status: 503 });
    console.error('[api/user/reminders] 목록 실패:', err?.message);
    return NextResponse.json({ success: false, error: '알람을 못 불러왔어' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다' }, { status: 401 });
  const p = await request.json().catch(() => ({}));
  const title = normalizeTitle(p?.title);
  if (!title.ok) return NextResponse.json({ success: false, error: title.error }, { status: 400 });
  const at = normalizeRemindAt(p?.remind_at, new Date());
  if (!at.ok) return NextResponse.json({ success: false, error: at.error }, { status: 400 });
  const sourceEntryId = typeof p?.source_entry_id === 'string' && /^[0-9a-f-]{36}$/i.test(p.source_entry_id) ? p.source_entry_id : null;
  const noteId = Number.isSafeInteger(p?.note_id) && p.note_id > 0 ? Number(p.note_id) : null;

  try {
    const delivery = await deliveryAbility(userId);
    if (!delivery.push && !delivery.sms) {
      return NextResponse.json(
        { success: false, code: 'no_channel', error: '지금은 알려줄 방법이 없어\n앱 알림을 켜거나 전화번호 인증이 필요해', data: { delivery } },
        { status: 409 }
      );
    }
    const { reminder, existed } = await createForUser(userId, {
      title: title.value,
      remindAt: at.value,
      source: normalizeSource(p?.source),
      sourceEntryId,
      noteId,
    });
    return NextResponse.json({ success: true, data: { reminder, existed, delivery } });
  } catch (err: any) {
    if (err instanceof ReminderError) return NextResponse.json({ success: false, code: err.code, error: err.message }, { status: err.status });
    if (isMissingTable(err)) return NextResponse.json(NOT_READY, { status: 503 });
    console.error('[api/user/reminders] 만들기 실패:', err?.message);
    return NextResponse.json({ success: false, error: '알람이 안 걸렸어' }, { status: 500 });
  }
}
