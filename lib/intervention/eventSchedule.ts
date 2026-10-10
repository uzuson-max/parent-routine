// lib/intervention/eventSchedule.ts
import { kstDate, kstParts } from '@/lib/intervention/kstTime';

// ============================================================================
// 사용자가 말한 "날짜가 정해진 일정"(면접, 치과, 출발…)에 참견이가 언제 찾아갈지 계산하는 순수 함수.
//   1) 그날 아침 "오늘이지?"  (EVENT_DAY)        — 일정이 오전 11시 이후면 당일 08:40,
//                                                    더 이른 일정이면 전날 20:40 ("내일 아침이지?")
//   2) 끝난 뒤 "어땠어?"      (COMMITMENT_CHECK) — 일정 시각 + 3시간. 조용한 시간에 걸리면 push gate가 다음 날 아침으로 미룬다.
//   일정 시각 + 36시간이 지나면 더 찾아가지 않는다.
// 일정 알림은 사용자가 직접 말한 일정이라, 다른 참견의 "하루 1번/12시간 간격" 상한에서 빼준다(조용한 시간은 지킨다).
// commitment_memory의 기존 컬럼을 그대로 쓴다: intervention_stage 0 = 아침 전, 1 = 끝난 뒤 확인 전, 4 = 종료.
// ============================================================================

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const EVENT_CHECK_DELAY_HOURS = 3;
export const EVENT_EXPIRE_AFTER_HOURS = 36;
// 아침 알림을 보내기엔 일정이 너무 임박했으면(이 시간 안이면) 아침 알림은 건너뛴다.
const MIN_LEAD_FOR_DAY_NUDGE_MINUTES = 90;

export interface EventSchedule {
  dayNudgeAt: Date | null; // 그날 아침(또는 전날 저녁) 알림 — 이미 지났거나 너무 임박하면 null
  checkAt: Date; // 끝난 뒤 "어땠어?"
  expiresAt: Date;
}

export function scheduleEvent(at: Date, now: Date): EventSchedule {
  const p = kstParts(at);
  let dayNudgeAt: Date;
  if (p.hour >= 11) {
    dayNudgeAt = kstDate(p.year, p.month, p.day, 8, 40);
  } else {
    // 이른 일정 — 당일 아침엔 이미 나가 있을 수 있으니 전날 저녁에
    const prev = new Date(kstDate(p.year, p.month, p.day, 12, 0).getTime() - 24 * HOUR);
    const q = kstParts(prev);
    dayNudgeAt = kstDate(q.year, q.month, q.day, 20, 40);
  }
  const tooLate =
    dayNudgeAt.getTime() <= now.getTime() + 5 * MIN ||
    at.getTime() - dayNudgeAt.getTime() < MIN_LEAD_FOR_DAY_NUDGE_MINUTES * MIN;

  return {
    dayNudgeAt: tooLate ? null : dayNudgeAt,
    checkAt: new Date(at.getTime() + EVENT_CHECK_DELAY_HOURS * HOUR),
    expiresAt: new Date(at.getTime() + EVENT_EXPIRE_AFTER_HOURS * HOUR),
  };
}

/** 아침 알림이 "전날 저녁"에 나가는지 — 문구를 "내일"로 쓸지 "오늘"로 쓸지 정할 때 쓴다. */
export function isEveBefore(at: Date, nudgeAt: Date): boolean {
  return kstParts(at).day !== kstParts(nudgeAt).day;
}
