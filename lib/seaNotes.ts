// lib/seaNotes.ts
// ============================================================================
// 바다 위 메모 — 서버 전용 데이터 접근(sea_notes 테이블, SQL: docs/sql/2026-10-12_notes_reminders.sql).
// ----------------------------------------------------------------------------
// 메모는 "생각 기록(voice_entries → 기억 엔진)"과 목적이 다르다. 사용자가 손으로 적어둔 짧은 글일 뿐이라
//   - 기억 추출/인사이트/SMS 개입 어디에도 넣지 않는다(이 파일 밖으로 나가지 않는다).
//   - 카테고리/태그/날짜를 묻지 않는다. 본문 하나만.
// 모든 함수는 userId를 받아 .eq('user_id', userId)로 직접 거른다 — service role은 RLS를 우회하기 때문.
// ============================================================================
import { supabase } from '@/lib/supabase';

export const NOTE_MAX_CHARS = 1000;
export const NOTE_LIST_LIMIT = 300;

export interface SeaNote {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

/** 저장할 본문으로 다듬는다. 비었거나 너무 길면 오류 메시지(사용자에게 그대로 보여줄 문장). */
export function normalizeNoteBody(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: '적은 게 없어.' };
  // 앞뒤 공백만 정리하고, 줄바꿈은 살린다. 세 줄 이상 비는 건 두 줄로.
  const body = raw.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!body) return { ok: false, error: '적은 게 없어.' };
  if (body.length > NOTE_MAX_CHARS) return { ok: false, error: `${NOTE_MAX_CHARS}자까지만 띄울 수 있어.` };
  return { ok: true, body };
}

/** 테이블이 아직 없을 때(SQL 실행 전) — 화면이 "아직 준비 안 됐어"를 정확히 보여줄 수 있게 구분한다. */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? '');
}

function toNote(r: any): SeaNote {
  return {
    id: Number(r.id),
    body: String(r.body ?? ''),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastOpenedAt: r.last_opened_at ?? null,
  };
}

const COLS = 'id, body, created_at, updated_at, last_opened_at';

export async function listNotes(userId: string, q?: string | null): Promise<SeaNote[]> {
  let query = supabase.from('sea_notes').select(COLS).eq('user_id', userId).order('created_at', { ascending: false }).limit(NOTE_LIST_LIMIT);
  const term = (q ?? '').trim().slice(0, 40);
  if (term) {
    // ilike 와일드카드 문자는 글자 그대로 찾게 이스케이프
    query = query.ilike('body', `%${term.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toNote);
}

export async function createNote(userId: string, body: string): Promise<SeaNote> {
  const { data, error } = await supabase.from('sea_notes').insert({ user_id: userId, body }).select(COLS).single();
  if (error) throw error;
  return toNote(data);
}

export async function updateNote(userId: string, id: number, body: string): Promise<SeaNote | null> {
  const { data, error } = await supabase
    .from('sea_notes')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select(COLS)
    .maybeSingle();
  if (error) throw error;
  return data ? toNote(data) : null;
}

/** 다시 열어봤다고 기록 — 직전 값을 같이 돌려준다(수달이 "오랜만이네"를 사실로만 말하게). */
export async function markNoteOpened(
  userId: string,
  id: number
): Promise<{ note: SeaNote; previousOpenedAt: string | null } | null> {
  const { data: before, error: e1 } = await supabase
    .from('sea_notes')
    .select(COLS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (e1) throw e1;
  if (!before) return null;
  const { data, error } = await supabase
    .from('sea_notes')
    .update({ last_opened_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select(COLS)
    .maybeSingle();
  if (error) throw error;
  return { note: toNote(data ?? before), previousOpenedAt: (before as any).last_opened_at ?? null };
}

export async function deleteNote(userId: string, id: number): Promise<boolean> {
  const { data, error } = await supabase.from('sea_notes').delete().eq('id', id).eq('user_id', userId).select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
