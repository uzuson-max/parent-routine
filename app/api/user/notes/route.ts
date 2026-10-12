// app/api/user/notes/route.ts
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { createNote, isMissingTable, listNotes, normalizeNoteBody } from '@/lib/seaNotes';

export const dynamic = 'force-dynamic';

// ============================================================================
// 바다 위 메모 목록/쓰기.
//   GET  ?q=검색어 → { notes }      (최근 것부터, 최대 300개)
//   POST { body }   → { note }
// 테이블이 아직 없으면(SQL 실행 전) 503 + code:'not_ready' — 화면이 숨기지 않고 그대로 알려준다.
// ============================================================================

const NOT_READY = { success: false, code: 'not_ready', error: '메모장이 아직 준비 안 됐어.' };

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  try {
    const q = new URL(request.url).searchParams.get('q');
    const notes = await listNotes(userId, q);
    return NextResponse.json({ success: true, data: { notes } });
  } catch (err: any) {
    if (isMissingTable(err)) return NextResponse.json(NOT_READY, { status: 503 });
    console.error('[api/user/notes] 목록 실패:', err?.message);
    return NextResponse.json({ success: false, error: '메모를 못 불러왔어.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  const payload = await request.json().catch(() => ({}));
  const v = normalizeNoteBody(payload?.body);
  if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
  try {
    const note = await createNote(userId, v.body);
    return NextResponse.json({ success: true, data: { note } });
  } catch (err: any) {
    if (isMissingTable(err)) return NextResponse.json(NOT_READY, { status: 503 });
    console.error('[api/user/notes] 저장 실패:', err?.message);
    return NextResponse.json({ success: false, error: '저장이 안 됐어. 적은 건 그대로 있어.' }, { status: 500 });
  }
}
