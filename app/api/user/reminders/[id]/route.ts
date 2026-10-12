// app/api/user/reminders/[id]/route.ts
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { isMissingTable } from '@/lib/seaNotes';
import { normalizeRemindAt, normalizeTitle } from '@/lib/reminders/core';
import { cancelForUser, ReminderError, updateForUser } from '@/lib/reminders/store';

export const dynamic = 'force-dynamic';

// ============================================================================
// 알람 하나.
//   PATCH  { title?, remind_at? } → 고치기(아직 안 울렸거나 실패한 것만). 고치면 다시 예약된다.
//   DELETE                        → 취소(기록은 남고 목록에서 빠진다). 취소한 알람은 크론이 절대 집지 않는다.
// ============================================================================

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const NOT_READY = { success: false, code: 'not_ready', error: '알람이 아직 준비 안 됐어.' };

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ success: false, error: '그 알람이 없어.' }, { status: 404 });
  const p = await request.json().catch(() => ({}));
  const patch: { title?: string; remindAt?: Date } = {};
  if (p?.title !== undefined) {
    const t = normalizeTitle(p.title);
    if (!t.ok) return NextResponse.json({ success: false, error: t.error }, { status: 400 });
    patch.title = t.value;
  }
  if (p?.remind_at !== undefined) {
    const a = normalizeRemindAt(p.remind_at, new Date());
    if (!a.ok) return NextResponse.json({ success: false, error: a.error }, { status: 400 });
    patch.remindAt = a.value;
  }
  if (patch.title === undefined && patch.remindAt === undefined) {
    return NextResponse.json({ success: false, error: '바꾼 게 없어.' }, { status: 400 });
  }
  try {
    const reminder = await updateForUser(userId, id, patch);
    return NextResponse.json({ success: true, data: { reminder } });
  } catch (err: any) {
    if (err instanceof ReminderError) return NextResponse.json({ success: false, code: err.code, error: err.message }, { status: err.status });
    if (isMissingTable(err)) return NextResponse.json(NOT_READY, { status: 503 });
    console.error('[api/user/reminders/id] 수정 실패:', err?.message);
    return NextResponse.json({ success: false, error: '고친 게 저장이 안 됐어.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ success: false, error: '그 알람이 없어.' }, { status: 404 });
  try {
    await cancelForUser(userId, id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof ReminderError) return NextResponse.json({ success: false, code: err.code, error: err.message }, { status: err.status });
    if (isMissingTable(err)) return NextResponse.json(NOT_READY, { status: 503 });
    console.error('[api/user/reminders/id] 취소 실패:', err?.message);
    return NextResponse.json({ success: false, error: '취소가 안 됐어.' }, { status: 500 });
  }
}
