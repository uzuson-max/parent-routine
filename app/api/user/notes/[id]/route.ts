// app/api/user/notes/[id]/route.ts
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { deleteNote, isMissingTable, markNoteOpened, normalizeNoteBody, updateNote } from '@/lib/seaNotes';

export const dynamic = 'force-dynamic';

// ============================================================================
// 메모 하나.
//   PATCH { body }          → 고치기
//   PATCH { opened: true }  → 다시 열어봤다고 기록. 직전에 연 시각(previousOpenedAt)을 같이 돌려준다.
//   DELETE                  → 지우기(되돌릴 수 없음 — 화면에서 한 번 더 묻는다)
// 남의 메모 id를 넣으면 404 — user_id로 직접 거른다.
// ============================================================================

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const NOT_READY = { success: false, code: 'not_ready', error: '메모장이 아직 준비 안 됐어.' };
const NOT_FOUND = { success: false, error: '그 메모가 없어.' };

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  const id = parseId(params.id);
  if (!id) return NextResponse.json(NOT_FOUND, { status: 404 });
  const payload = await request.json().catch(() => ({}));
  try {
    if (payload?.opened === true) {
      const r = await markNoteOpened(userId, id);
      if (!r) return NextResponse.json(NOT_FOUND, { status: 404 });
      return NextResponse.json({ success: true, data: r });
    }
    const v = normalizeNoteBody(payload?.body);
    if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    const note = await updateNote(userId, id, v.body);
    if (!note) return NextResponse.json(NOT_FOUND, { status: 404 });
    return NextResponse.json({ success: true, data: { note } });
  } catch (err: any) {
    if (isMissingTable(err)) return NextResponse.json(NOT_READY, { status: 503 });
    console.error('[api/user/notes/id] 수정 실패:', err?.message);
    return NextResponse.json({ success: false, error: '고친 게 저장이 안 됐어.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  const id = parseId(params.id);
  if (!id) return NextResponse.json(NOT_FOUND, { status: 404 });
  try {
    const ok = await deleteNote(userId, id);
    if (!ok) return NextResponse.json(NOT_FOUND, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (isMissingTable(err)) return NextResponse.json(NOT_READY, { status: 503 });
    console.error('[api/user/notes/id] 삭제 실패:', err?.message);
    return NextResponse.json({ success: false, error: '지우는 게 안 됐어.' }, { status: 500 });
  }
}
