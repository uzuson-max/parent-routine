// scripts/test-event-schedule.ts — 일정 알림 스케줄 + push gate 예외 규칙 확인 (DB 없이, 순수 함수만)
import { scheduleEvent, isEveBefore } from '@/lib/intervention/eventSchedule';
import { evaluatePushGate } from '@/lib/intervention/pushGate';
import { kstHuman } from '@/lib/intervention/kstTime';

const k = (s: string) => new Date(s + '+09:00');
let fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!cond) fail++;
};
const fmt = (d: Date | null) => (d ? kstHuman(d) : 'null');

// 1) 금요일 오후 2시 면접, 화요일에 말함 → 금요일 08:40 / 17:00
{
  const s = scheduleEvent(k('2026-10-16T14:00:00'), k('2026-10-13T20:00:00'));
  ok('오후 일정 → 당일 08:40', fmt(s.dayNudgeAt) === fmt(k('2026-10-16T08:40:00')), fmt(s.dayNudgeAt));
  ok('끝난 뒤 +3h', fmt(s.checkAt) === fmt(k('2026-10-16T17:00:00')), fmt(s.checkAt));
}
// 2) 내일 아침 9시 치과 → 전날 20:40, "내일" 문구
{
  const at = k('2026-10-14T09:00:00');
  const s = scheduleEvent(at, k('2026-10-13T12:00:00'));
  ok('이른 일정 → 전날 20:40', fmt(s.dayNudgeAt) === fmt(k('2026-10-13T20:40:00')), fmt(s.dayNudgeAt));
  ok('전날이면 eve=true', s.dayNudgeAt ? isEveBefore(at, s.dayNudgeAt) : false);
}
// 3) 오늘 오후 3시 일정을 오늘 오전 10시에 말함 → 아침 알림은 이미 지남 → null
{
  const s = scheduleEvent(k('2026-10-13T15:00:00'), k('2026-10-13T10:00:00'));
  ok('아침 지났으면 아침 알림 없음', s.dayNudgeAt === null, fmt(s.dayNudgeAt));
}
// 4) 월 경계: 11월 1일 오전 8시 → 10월 31일 20:40
{
  const s = scheduleEvent(k('2026-11-01T08:00:00'), k('2026-10-25T12:00:00'));
  ok('월 경계 전날', fmt(s.dayNudgeAt) === fmt(k('2026-10-31T20:40:00')), fmt(s.dayNudgeAt));
}

// ---- push gate ----
const recentGeneral = { created_at: k('2026-10-16T08:00:00').toISOString(), intervention_type: 'RETURN_MEMORY', topic_key: null, chosen_memory_id: 1 };
const history = { recentPushes: [recentGeneral], lastUserActivityAt: null };
const prefs: any = { outreachEnabled: true, interventionLevel: 'normal', quietStartHour: 22, quietEndHour: 9 };

// 5) 오늘 이미 다른 참견이 나갔어도 일정 알림은 나간다
{
  const d = evaluatePushGate({ type: 'COMMITMENT_CHECK', channel: 'sms', now: k('2026-10-16T17:00:00'), referencedEventAt: k('2026-10-16T14:00:00'), topicKey: 'event:x:check', eventBound: true }, history, prefs);
  ok('일정 알림은 하루 상한 예외', d.allowed, d.reason);
}
// 6) 같은 상황의 일반 참견은 막힌다 (기존 규칙 유지)
{
  const d = evaluatePushGate({ type: 'RETURN_MEMORY', channel: 'sms', now: k('2026-10-16T17:00:00'), topicKey: 'mem:2' }, history, prefs);
  ok('일반 참견은 여전히 하루 1번', !d.allowed, d.reason);
}
// 7) 일정 알림도 조용한 시간은 지킨다 (23시 → 다음 날 아침으로 보류)
{
  const d = evaluatePushGate({ type: 'COMMITMENT_CHECK', channel: 'sms', now: k('2026-10-16T23:00:00'), referencedEventAt: k('2026-10-16T20:00:00'), topicKey: 'event:x:check', eventBound: true }, history, prefs);
  ok('일정 알림도 조용한 시간엔 보류', !d.allowed && !!(d as any).retryAt, `${d.reason} → ${(d as any).retryAt ? kstHuman((d as any).retryAt) : ''}`);
}
// 8) 일정 알림이 나간 뒤에도 다른 참견의 하루 1번은 그대로 남아 있다
{
  const h = { recentPushes: [{ created_at: k('2026-10-16T08:40:00').toISOString(), intervention_type: 'EVENT_DAY', topic_key: 'event:x:day', chosen_memory_id: null }], lastUserActivityAt: null };
  const d = evaluatePushGate({ type: 'RETURN_MEMORY', channel: 'sms', now: k('2026-10-16T12:00:00'), topicKey: 'mem:3' }, h, prefs);
  ok('일정 알림은 다른 참견의 상한을 안 깎음', d.allowed, d.reason);
}
// 9) '살짝'이면 일정 알림도 안 감
{
  const d = evaluatePushGate({ type: 'EVENT_DAY', channel: 'push', now: k('2026-10-16T08:40:00'), topicKey: 'event:x:day', eventBound: true }, { recentPushes: [], lastUserActivityAt: null }, { ...prefs, interventionLevel: 'low' });
  ok("'살짝'이면 일정 알림도 안 보냄", !d.allowed, d.reason);
}

console.log(fail ? `\n${fail}개 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
