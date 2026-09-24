
import {
  COMMITMENT_CHECK_DELAY_HOURS,
  COMMITMENT_DEFAULT_DUE_HOURS,
  COMMITMENT_EXPIRE_AFTER_DUE_HOURS,
  REMINDER_GRACE_AFTER_EVENT_MINUTES,
  REMINDER_LEAD_MINUTES,
} from '@/lib/intervention/interventionTypes';

// commitment_memory 한 줄이 "언제 개입 후보가 되고 언제 폐기되는지"를 계산하는 순수 함수 모음.
// commitment_memory의 기존 컬럼(target_date, next_intervention_at, intervention_stage)을 그대로 쓰고,
// 새로 추가하는 컬럼은 kind('commitment' | 'reminder') 하나뿐이다.

export type CommitmentKind = 'commitment' | 'reminder';

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

// "다시 알려줘", "까먹지 않게 말해줘", "리마인드 해줘" 같은 명시적 요청.
// GPT 판단(commitment_kind)이 틀려도 이 표현이 있으면 REMINDER로 본다 — 반대로 이 표현이 없다고
// 해서 REMINDER가 아닌 건 아니다(GPT 판단 존중).
const REMINDER_REQUEST_RE =
  /(다시\s*)?(알려\s*(줘|주라|줄래|줄 수|달라)|말해\s*(줘|주라|줄래)|상기시켜|리마인드|리마인더|깨워\s*(줘|주라)|잊지\s*않게|까먹지\s*않게)/;

export function isExplicitReminderRequest(transcript: string): boolean {
  return REMINDER_REQUEST_RE.test(transcript);
}

/** GPT가 준 기한 문자열을 검증한다. 과거(1시간 이상 전)나 너무 먼 미래(120일 초과)면 버린다. */
export function sanitizeDueAt(raw: unknown, now: Date): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  if (d.getTime() < now.getTime() - HOUR) return null;
  if (d.getTime() > now.getTime() + 120 * 24 * HOUR) return null;
  return d;
}

export interface CommitmentSchedule {
  targetDate: Date | null; // 사건/기한 시각 (알 수 없으면 null)
  nextInterventionAt: Date | null; // 개입 후보가 되는 시각 (null이면 개입 없음)
}

export function scheduleCommitment(kind: CommitmentKind, dueAt: Date | null, now: Date): CommitmentSchedule {
  if (kind === 'reminder') {
    if (!dueAt) {
      // 언제 알려줘야 할지 모르면 추측해서 보내지 않는다 — 저장만 한다.
      return { targetDate: null, nextInterventionAt: null };
    }
    const lead = new Date(dueAt.getTime() - REMINDER_LEAD_MINUTES * MIN);
    const earliest = new Date(now.getTime() + MIN);
    return { targetDate: dueAt, nextInterventionAt: lead.getTime() > earliest.getTime() ? lead : earliest };
  }

  // commitment: 기한이 지난 "뒤"에만 결과를 묻는다. 기한 전에는 절대 후보가 되지 않는다.
  const effectiveDue = dueAt ?? new Date(now.getTime() + COMMITMENT_DEFAULT_DUE_HOURS * HOUR);
  return {
    targetDate: dueAt,
    nextInterventionAt: new Date(effectiveDue.getTime() + COMMITMENT_CHECK_DELAY_HOURS * HOUR),
  };
}

/** 이 시각이 지나면 개입하지 않고 폐기한다. */
export function commitmentExpiry(kind: CommitmentKind, targetDate: Date | null, createdAt: Date): Date {
  if (kind === 'reminder') {
    const base = targetDate ?? createdAt;
    return new Date(base.getTime() + REMINDER_GRACE_AFTER_EVENT_MINUTES * MIN);
  }
  const due = targetDate ?? new Date(createdAt.getTime() + COMMITMENT_DEFAULT_DUE_HOURS * HOUR);
  return new Date(due.getTime() + COMMITMENT_EXPIRE_AFTER_DUE_HOURS * HOUR);
}

/** COMMITMENT_CHECK가 가리키는 사건 시각 — 이 시각 전에는 push gate가 막는다. */
export function commitmentReferencedAt(targetDate: Date | null, createdAt: Date): Date {
  return targetDate ?? new Date(createdAt.getTime() + COMMITMENT_DEFAULT_DUE_HOURS * HOUR);
}
