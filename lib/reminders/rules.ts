// lib/reminders/rules.ts
// ============================================================================
// 알람 규칙 중 브라우저에서도 쓰는 것 — import 없음(서버 전용 모듈을 끌고 오지 않게).
// 서버 쪽 검증(문자 바이트 등)은 lib/reminders/core.ts.
// ============================================================================

export const REMINDER_HEADER = '참견이 알람';
export const REMINDER_TITLE_MAX = 30; // 화면 입력 한도 — 문자로 가도 90바이트 안에 들어가게
export const MIN_LEAD_MS = 60 * 1000; // 1분 뒤부터
export const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000; // 1년 안쪽
export const LATE_LIMIT_MS = 2 * 60 * 60 * 1000; // 2시간 넘게 늦었으면 보내지 않는다(늦은 알람은 소음)
export const MAX_ATTEMPTS = 3;
export const STUCK_SENDING_MS = 10 * 60 * 1000; // sending에서 10분 넘게 멈춰 있으면 크론이 죽은 것
export const MAX_ACTIVE_PER_USER = 50;
export const VOICE_LEAD_MS = 30 * 60 * 1000; // 음성 일정 → 30분 전에 알려주자고 제안
export const OVERDUE_GRACE_MS = 3 * 60 * 1000; // 시각이 3분 넘게 지났는데 아직 예약 상태면 "아직 못 알려줬어"

export type ReminderStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'canceled';
export type ReminderSource = 'manual' | 'voice' | 'note';

/**
 * 음성에서 잡힌 일정 → 알람 제안 시각. 30분 전이 이미 코앞이면 일정 시각 그대로, 그것도 지났으면 제안하지 않는다.
 * (제안만 한다. 실제 생성은 사용자가 [응]을 눌렀을 때)
 */
export function suggestFromEvent(eventAtIso: string, now: Date): string | null {
  const at = new Date(eventAtIso).getTime();
  if (!Number.isFinite(at)) return null;
  const early = at - VOICE_LEAD_MS;
  if (early >= now.getTime() + 5 * 60 * 1000) return new Date(early).toISOString();
  if (at >= now.getTime() + 2 * 60 * 1000) return new Date(at).toISOString();
  return null;
}

/** 크론이 집어든 알람을 지금 보내도 되는지 — 너무 늦었으면 보내지 않고 실패로 남긴다. */
export function isTooLate(remindAtIso: string, now: Date): boolean {
  return now.getTime() - new Date(remindAtIso).getTime() > LATE_LIMIT_MS;
}

/** 발송 실패 후 — 일시적 실패면 다음 크론에서 다시(최대 3번), 영구 실패/늦음이면 끝. */
export function afterFailure(attemptsSoFar: number, remindAtIso: string, now: Date, permanent: boolean): 'retry' | 'fail' {
  if (permanent) return 'fail';
  if (attemptsSoFar >= MAX_ATTEMPTS) return 'fail';
  if (isTooLate(remindAtIso, now)) return 'fail';
  return 'retry';
}

/** sending에서 멈춘 알람(크론이 중간에 죽음) — 다시 시도할지, 실패로 끝낼지. */
export function recoverStuck(attempts: number, remindAtIso: string, now: Date): 'retry' | 'fail' {
  return afterFailure(attempts, remindAtIso, now, false);
}

/** 예약 상태인데 시각이 한참 지났다 = 발송기가 안 돌고 있다. 화면이 숨기지 않고 드러낸다. */
export function isOverdue(status: ReminderStatus, remindAtIso: string, now: Date): boolean {
  return status === 'scheduled' && now.getTime() - new Date(remindAtIso).getTime() > OVERDUE_GRACE_MS;
}

/** 화면에 보여줄 실패 이유 — 사람 말로. */
export function failureText(lastError: string | null | undefined): string {
  const e = lastError ?? '';
  if (e.startsWith('late')) return '그때 못 알려줬어\n너무 늦어버려서';
  if (e.startsWith('no_channel')) return '알려줄 방법이 없었어\n앱 알림이나 전화번호가 필요해';
  return '알려주려다 실패했어';
}

// ---- 한국 시간 표시/입력 (기기 시간대와 상관없이 한국 시간 기준) ----
const KST = 9 * 60 * 60 * 1000;
const WD = ['일', '월', '화', '수', '목', '금', '토'];

function kst(d: Date) {
  const k = new Date(d.getTime() + KST);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), h: k.getUTCHours(), min: k.getUTCMinutes(), wd: k.getUTCDay() };
}
const pad = (n: number) => String(n).padStart(2, '0');

/** "오늘 오후 3시" / "내일 오전 11시 30분" / "10월 24일(금) 오전 9시" */
export function kstLabel(iso: string, now: Date = new Date()): string {
  const t = kst(new Date(iso));
  const n = kst(now);
  const dayNum = (p: { y: number; m: number; d: number }) => Date.UTC(p.y, p.m - 1, p.d) / 86_400_000;
  const diff = dayNum(t) - dayNum(n);
  const day = diff === 0 ? '오늘' : diff === 1 ? '내일' : diff === 2 ? '모레' : diff === -1 ? '어제' : `${t.m}월 ${t.d}일(${WD[t.wd]})`;
  const ampm = t.h < 12 ? '오전' : '오후';
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${day} ${ampm} ${h12}시${t.min ? ` ${t.min}분` : ''}`;
}

/** 입력칸(date, time)용 한국 시간 문자열 */
export function kstInputParts(iso: string): { date: string; time: string } {
  const t = kst(new Date(iso));
  return { date: `${t.y}-${pad(t.m)}-${pad(t.d)}`, time: `${pad(t.h)}:${pad(t.min)}` };
}

/** 입력칸 값(한국 날짜/시각) → ISO. 기기가 다른 시간대여도 한국 시간으로 해석한다. */
export function kstInputToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 빠른 선택 — "1시간 뒤", "오늘 밤 9시"(지났으면 생략), "내일 아침 9시" */
export function quickPicks(now: Date = new Date()): { label: string; iso: string }[] {
  const out: { label: string; iso: string }[] = [];
  const inHour = new Date(now.getTime() + 60 * 60 * 1000);
  inHour.setUTCSeconds(0, 0);
  out.push({ label: '1시간 뒤', iso: inHour.toISOString() });
  const n = kst(now);
  const tonight = new Date(Date.UTC(n.y, n.m - 1, n.d, 21, 0) - KST);
  if (tonight.getTime() - now.getTime() > 10 * 60 * 1000) out.push({ label: '오늘 밤 9시', iso: tonight.toISOString() });
  const tomorrow = new Date(Date.UTC(n.y, n.m - 1, n.d + 1, 9, 0) - KST);
  out.push({ label: '내일 아침 9시', iso: tomorrow.toISOString() });
  return out;
}
