// lib/userPrefs.ts
import { supabase } from '@/lib/supabase';

// ============================================================================
// 사용자가 MY에서 정하는 "참견 받는 방법" — 서버가 실제 문자/전화 발송 직전에 읽는다.
// ----------------------------------------------------------------------------
// 예전 MY의 알림/참견 정도는 폰(localStorage)에만 저장돼서 서버 발송과 아무 관계가 없었다.
// 이제는 user_memory의 컬럼 4개에 저장하고, pushGate(선제 문자)와 voice/upload(전화)가 읽는다.
//
//   outreach_enabled  — false면 문자/전화로는 아예 참견하지 않는다(앱 안 대답만).
//   intervention_level — low: 내가 부탁한 알림(REMINDER)만 문자, 나머지는 앱 안에서만. 전화 안 함.
//                        medium: 기존 정책(12시간 간격, 하루 1번).
//                        high: 6시간 간격, 하루 2번.
//   quiet_start_hour / quiet_end_hour — 이 사이(KST)에는 먼저 문자하지 않는다. 기본 22시~9시
//                        (기존 pushGate QUIET_HOURS 09:00~21:59 허용과 같은 값).
//
// migration(docs/sql/2026-10-08_my_settings.sql) 적용 전에는 컬럼이 없어서 조회가 실패한다 —
// 그때는 기본값(= 지금까지와 똑같은 동작)으로 돌아가고, 저장은 실패로 알린다.
// ============================================================================

export type InterventionLevel = 'low' | 'medium' | 'high';

export interface UserPrefs {
  outreachEnabled: boolean;
  interventionLevel: InterventionLevel;
  quietStartHour: number; // 21~24 (24 = 자정)
  quietEndHour: number; // 6~11
}

export const DEFAULT_PREFS: UserPrefs = {
  outreachEnabled: true,
  interventionLevel: 'medium',
  quietStartHour: 22,
  quietEndHour: 9,
};

export const QUIET_START_OPTIONS = [21, 22, 23, 24];
export const QUIET_END_OPTIONS = [7, 8, 9, 10];

function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42703' || /column .* does not exist/i.test(err.message ?? '') || /schema cache/i.test(err.message ?? '');
}

function normalize(row: any): UserPrefs {
  const level = row?.intervention_level;
  const qs = Number(row?.quiet_start_hour);
  const qe = Number(row?.quiet_end_hour);
  return {
    outreachEnabled: row?.outreach_enabled === false ? false : true,
    interventionLevel: level === 'low' || level === 'high' ? level : 'medium',
    quietStartHour: QUIET_START_OPTIONS.includes(qs) ? qs : DEFAULT_PREFS.quietStartHour,
    quietEndHour: QUIET_END_OPTIONS.includes(qe) ? qe : DEFAULT_PREFS.quietEndHour,
  };
}

export async function loadUserPrefs(userId: string): Promise<{ prefs: UserPrefs; migrationNeeded: boolean }> {
  const { data, error } = await supabase
    .from('user_memory')
    .select('outreach_enabled, intervention_level, quiet_start_hour, quiet_end_hour')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return { prefs: DEFAULT_PREFS, migrationNeeded: true };
    // 못 읽었을 때 기본값(=문자 허용)으로 열어두면 사용자가 꺼둔 문자가 나갈 수 있다 — 호출부가 판단하게 던진다.
    throw new Error(`[userPrefs] 조회 실패: ${error.message}`);
  }
  return { prefs: normalize(data), migrationNeeded: false };
}

export async function saveUserPrefs(
  userId: string,
  patch: Partial<UserPrefs>
): Promise<{ ok: true; prefs: UserPrefs } | { ok: false; error: string; migrationNeeded?: boolean }> {
  const row: Record<string, any> = { user_id: userId, updated_at: new Date().toISOString() };
  if (patch.outreachEnabled !== undefined) row.outreach_enabled = !!patch.outreachEnabled;
  if (patch.interventionLevel !== undefined) {
    if (!['low', 'medium', 'high'].includes(patch.interventionLevel)) return { ok: false, error: '참견 정도 값이 이상해.' };
    row.intervention_level = patch.interventionLevel;
  }
  if (patch.quietStartHour !== undefined) {
    if (!QUIET_START_OPTIONS.includes(patch.quietStartHour)) return { ok: false, error: '조용한 시간 값이 이상해.' };
    row.quiet_start_hour = patch.quietStartHour;
  }
  if (patch.quietEndHour !== undefined) {
    if (!QUIET_END_OPTIONS.includes(patch.quietEndHour)) return { ok: false, error: '조용한 시간 값이 이상해.' };
    row.quiet_end_hour = patch.quietEndHour;
  }

  const { error } = await supabase.from('user_memory').upsert(row, { onConflict: 'user_id' });
  if (error) {
    if (isMissingColumn(error)) return { ok: false, error: '설정 저장 준비가 아직 안 됐어.', migrationNeeded: true };
    return { ok: false, error: error.message };
  }
  const { prefs } = await loadUserPrefs(userId);
  return { ok: true, prefs };
}

/** 앱 밖으로(문자/전화) 먼저 참견해도 되는 사용자인가 — 즉시 전화(voice/upload)용 */
export function allowsCalls(prefs: UserPrefs): boolean {
  return prefs.outreachEnabled && prefs.interventionLevel !== 'low';
}
