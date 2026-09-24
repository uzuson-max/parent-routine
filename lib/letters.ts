import { supabase } from '@/lib/supabase';

// ============================================================================
// 참견이의 편지 (letters) — "사용자에게 실제로 전달된 편지"를 보관하고 읽게 하는 사용자 경험 계층.
//
// 역할 경계:
//   - intervention_log / interventionEngine / memoryCallbackEngine / insightCallbackEngine
//     = "지금 무엇을, 왜 보낼지" 판단하고 실행하는 계층. 이 파일은 그쪽을 전혀 import하지 않는다.
//   - letters(이 파일) = 이미 만들어진 편지를 저장하고, 목록/상세/읽음 상태를 다루는 계층.
//
// 의존 방향은 한쪽뿐이다: (향후) Letter Opportunity 엔진 → createLetter() → letters 테이블.
// letters 쪽에서 responseEngine / memory / insight / intervention 엔진을 부르는 일은 없다.
//
// source_type / metadata / related_* 는 "왜 이 편지가 생겼는지"를 남기는 내부 기록용이다.
// 사용자에게 내려가는 응답(LetterSummary / LetterDetail)에는 절대 포함하지 않고,
// UI도 source_type에 따라 다르게 그리지 않는다 — 어떤 경로로 만들어졌든 편지는 그냥 편지다.
//
// 서버(service role) 전용 모듈. service role은 RLS를 우회하므로, 아래 모든 조회/수정에
// user_id 조건을 반드시 직접 건다(=실제 보안선). RLS는 이중 안전장치다.
// ============================================================================

// 향후 확장을 위한 값 목록. DB check 제약과 같은 값을 유지한다. UI/조회 로직은 이 값에 의존하지 않는다.
export const LETTER_SOURCE_TYPES = ['manual', 'memory_callback', 'insight', 'monthly_reflection', 'system'] as const;
export type LetterSourceType = (typeof LETTER_SOURCE_TYPES)[number];

// draft = 생성은 됐지만 아직 사용자에게 보이지 않음(향후 검증 단계용), delivered = 사용자에게 전달됨,
// archived = 숨김. 사용자에게 보이는 건 delivered뿐이다.
export type LetterStatus = 'draft' | 'delivered' | 'archived';

// ---- 클라이언트로 내려가는 모양 (내부 필드 없음) ------------------------------------------
export interface LetterSummary {
  id: number;
  title: string;
  preview: string;
  createdAt: string;
  isUnread: boolean;
}

export interface LetterDetail {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  isUnread: boolean;
}

const PREVIEW_MAX = 42;
const LIST_LIMIT = 50;

// 목록용 미리보기. 편지 첫 줄의 짧은 호칭("재빈아,")과 서명("— 참견이")은 건너뛰고
// 본문 첫머리만 한 줄로 보여준다. source_type과 무관하게 content만 보고 만든다.
export function buildPreview(content: string): string {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length > 1 && lines[0].length <= 16 && /[,，]$/.test(lines[0])) lines.shift();
  const body = lines.filter((l) => !/^[—–-]\s*참견이/.test(l)).join(' ');

  return body.length > PREVIEW_MAX ? body.slice(0, PREVIEW_MAX).trimEnd() + '…' : body;
}

// URL 경로에서 온 id를 bigint 범위의 양의 정수로만 받아들인다. 아니면 null(→ 404).
export function parseLetterId(raw: string): number | null {
  if (!/^\d{1,15}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function listLettersForUser(userId: string): Promise<LetterSummary[]> {
  const { data, error } = await supabase
    .from('letters')
    .select('id, title, content, created_at, read_at')
    .eq('user_id', userId)
    .eq('status', 'delivered')
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);

  if (error) throw new Error(`letters 목록 조회 실패: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    title: row.title as string,
    preview: buildPreview(row.content as string),
    createdAt: row.created_at as string,
    isUnread: !row.read_at,
  }));
}

export async function getLetterForUser(userId: string, letterId: number): Promise<LetterDetail | null> {
  const { data, error } = await supabase
    .from('letters')
    .select('id, title, content, created_at, read_at')
    .eq('id', letterId)
    .eq('user_id', userId)
    .eq('status', 'delivered')
    .maybeSingle();

  if (error) throw new Error(`letter 조회 실패: ${error.message}`);
  if (!data) return null;

  return {
    id: Number(data.id),
    title: data.title as string,
    content: data.content as string,
    createdAt: data.created_at as string,
    isUnread: !data.read_at,
  };
}

// 상세 화면에 실제로 들어갔을 때만 호출된다. 이미 읽은 편지는 read_at을 덮어쓰지 않는다(처음 읽은 순간 보존).
// 반환값: 편지가 존재하면 true(이미 읽었어도 true), 내 편지가 아니거나 없으면 false.
export async function markLetterRead(userId: string, letterId: number): Promise<boolean> {
  const { error: updateError } = await supabase
    .from('letters')
    .update({ read_at: new Date().toISOString() })
    .eq('id', letterId)
    .eq('user_id', userId)
    .eq('status', 'delivered')
    .is('read_at', null);

  if (updateError) throw new Error(`letter 읽음 처리 실패: ${updateError.message}`);

  const letter = await getLetterForUser(userId, letterId);
  return !!letter;
}

export async function countUnreadLetters(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('letters')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'delivered')
    .is('read_at', null);

  if (error) throw new Error(`unread letters 개수 조회 실패: ${error.message}`);
  return count ?? 0;
}

// ---- 향후 Letter Opportunity 엔진의 유일한 연결 지점 ---------------------------------------
// 이번 단계에서는 이 함수를 호출하는 곳이 없다(자동 생성 미구현).
// 나중에 편지 생성 엔진(예: lib/letterOpportunity.ts + cron 라우트)은 편지 문장을 다 만든 뒤
// 이 함수 하나만 호출하면 된다 — 저장/unread 상태/Home badge/편지함 노출은 자동으로 따라온다.
export interface CreateLetterInput {
  userId: string;
  title: string;
  content: string;
  sourceType?: LetterSourceType;
  status?: Extract<LetterStatus, 'draft' | 'delivered'>;
  relatedMemoryUnitId?: number | null;
  relatedInsightId?: number | null;
  metadata?: Record<string, unknown>;
}

export async function createLetter(input: CreateLetterInput): Promise<{ id: number }> {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!input.userId) throw new Error('createLetter: userId가 필요합니다.');
  if (!title || !content) throw new Error('createLetter: title/content가 비어 있습니다.');

  const { data, error } = await supabase
    .from('letters')
    .insert({
      user_id: input.userId,
      title,
      content,
      source_type: input.sourceType ?? 'manual',
      status: input.status ?? 'delivered',
      related_memory_unit_id: input.relatedMemoryUnitId ?? null,
      related_insight_id: input.relatedInsightId ?? null,
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`createLetter 실패: ${error?.message ?? 'no row'}`);
  return { id: Number(data.id) };
}
