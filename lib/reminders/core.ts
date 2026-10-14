// lib/reminders/core.ts
// ============================================================================
// 알람 입력 검증 — 서버 전용(문자 바이트 계산 때문에 lib/solapi를 쓴다). 테스트: scripts/test-reminders.ts
// 브라우저에서도 쓰는 규칙/표시는 lib/reminders/rules.ts.
// ----------------------------------------------------------------------------
// 알람은 "생각 재발견(참견)"과 다른 기능이다.
//   참견 : 참견이가 의미 있다고 판단한 걸 먼저 꺼낸다 — 쿨다운/조용한 시간/하루 상한(pushGate)을 탄다.
//   알람 : 사용자가 정한 시각에 한 번 알려준다 — 사용자가 직접 부탁한 거라 게이트를 타지 않는다.
// 그래서 알람 발송은 intervention_log/편지에 남기지 않는다(참견 쿨다운을 건드리지 않게).
// ============================================================================
import { composeSms } from '@/lib/solapi';
import { MAX_AHEAD_MS, MIN_LEAD_MS, REMINDER_HEADER, REMINDER_TITLE_MAX, type ReminderSource } from '@/lib/reminders/rules';

export * from '@/lib/reminders/rules';

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export function normalizeTitle(raw: unknown): Check<string> {
  if (typeof raw !== 'string') return { ok: false, error: '뭘 알려줄지 적어줘' };
  const title = raw.replace(/\s+/g, ' ').trim();
  if (!title) return { ok: false, error: '뭘 알려줄지 적어줘' };
  if (title.length > REMINDER_TITLE_MAX) return { ok: false, error: `${REMINDER_TITLE_MAX}자까지만 돼` };
  // 앱 알림이 실패하면 문자로 간다 — 그때도 장문(LMS)으로 새지 않게 미리 막는다(이모지 등 큰 글자 대비).
  if (composeSms(title, REMINDER_HEADER).type !== 'SMS') return { ok: false, error: '조금만 짧게 적어줘' };
  return { ok: true, value: title };
}

export function normalizeRemindAt(raw: unknown, now: Date): Check<Date> {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: '언제 알려줄지 골라줘' };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { ok: false, error: '시간을 못 읽었어' };
  if (d.getTime() < now.getTime() + MIN_LEAD_MS) return { ok: false, error: '이미 지난 시간이야' };
  if (d.getTime() > now.getTime() + MAX_AHEAD_MS) return { ok: false, error: '1년 안쪽으로만 돼' };
  return { ok: true, value: d };
}

export function normalizeSource(raw: unknown): ReminderSource {
  return raw === 'voice' || raw === 'note' ? raw : 'manual';
}
