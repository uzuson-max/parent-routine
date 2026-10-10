import { supabase } from '@/lib/supabase';
import { Channel, InterventionType, channelRule } from '@/lib/intervention/interventionTypes';
import { kstDate, kstParts, startOfKstDay } from '@/lib/intervention/kstTime';
import { loadUserPrefs, type UserPrefs } from '@/lib/userPrefs';

// ============================================================================
// Global Push Gate — "개입하기로 했다면, 지금 앱 밖으로 보내도 되는가?"를 판단하는 단 하나의 관문.
// interventionEngine / memoryCallbackEngine / insightCallbackEngine 등 선제 발송하는 모든 엔진이
// 발송 직전에 이 게이트를 통과해야 한다. 화면 반응(screen)은 이 게이트 대상이 아니다.
//
// 구조: loadPushHistory()(DB 조회) + evaluatePushGate()(순수 함수). 판단 로직을 순수 함수로 두어
// DB 없이 테스트할 수 있게 했다 (scripts/test-intervention-policy.ts).
//
// 발송 기록은 intervention_log(channel sms/call/letter, decision='intervene')에서 읽는다.
// dispatch.ts의 deliverPush()가 발송 성공 시 여기에 기록한다.
// ============================================================================

export const GENERAL_PUSH_COOLDOWN_HOURS = 12;
export const GENERAL_PUSH_DAILY_MAX = 1;
export const SAME_TOPIC_BLOCK_DAYS = 7; // 같은 기억/주제로는 이 기간 안에 다시 찾아가지 않는다
export const USER_ACTIVE_WINDOW_MINUTES = 60; // 이 시간 안에 앱에서 말했다면 화면이 이미 대화 채널이다
// 일반 push는 KST 이 시간대에만 보낸다 (REMINDER는 사용자가 정한 시각이라 예외).
export const QUIET_HOURS = { allowFromHour: 9, allowUntilHour: 21 }; // 09:00 ~ 21:59

export interface PushRecord {
  created_at: string;
  intervention_type: string | null;
  topic_key: string | null;
  chosen_memory_id: number | null;
}

export interface PushHistory {
  recentPushes: PushRecord[]; // 최근 SAME_TOPIC_BLOCK_DAYS 이내 발송 기록, 최신순
  lastUserActivityAt: string | null; // 사용자의 마지막 발화 시각
}

export interface PushGateInput {
  type: InterventionType;
  channel: Channel;
  now: Date;
  topicKey?: string | null; // 같은 주제/약속/기억 묶음 식별자 (예: "commitment:<id>", "entity:<id>")
  memoryId?: number | null;
  referencedEventAt?: Date | null; // 이 개입이 가리키는 사건 시각 (예: 토요일 09:00)
  expiresAt?: Date | null;
  // 사용자가 직접 말한 날짜 정해진 일정(아침 "오늘이지?" / 끝난 뒤 "어땠어?")이면 true.
  // 조용한 시간·만료·기한 전 금지는 그대로 지키고, 하루 상한/쿨다운/같은 주제 차단은 건너뛴다.
  // topicKey는 "event:"로 시작해야 한다 — 그래야 다른 참견의 하루 상한/쿨다운 계산에서도 빠진다.
  eventBound?: boolean;
}

// MY에서 사용자가 정한 참견 받는 방법 (lib/userPrefs.ts). 넘기지 않으면 기존 정책 그대로.
export type GatePrefs = Pick<UserPrefs, 'outreachEnabled' | 'interventionLevel' | 'quietStartHour' | 'quietEndHour'>;

interface EffectivePolicy {
  allowFromHour: number;
  allowUntilHour: number;
  cooldownHours: number;
  dailyMax: number;
}

function policyFor(prefs?: GatePrefs): EffectivePolicy {
  if (!prefs) {
    return {
      allowFromHour: QUIET_HOURS.allowFromHour,
      allowUntilHour: QUIET_HOURS.allowUntilHour,
      cooldownHours: GENERAL_PUSH_COOLDOWN_HOURS,
      dailyMax: GENERAL_PUSH_DAILY_MAX,
    };
  }
  const high = prefs.interventionLevel === 'high';
  return {
    allowFromHour: prefs.quietEndHour,
    allowUntilHour: prefs.quietStartHour - 1, // 22시부터 조용하면 21:59까지 허용
    cooldownHours: high ? 6 : GENERAL_PUSH_COOLDOWN_HOURS,
    dailyMax: high ? 2 : GENERAL_PUSH_DAILY_MAX,
  };
}

export type PushGateDecision =
  | { allowed: true; reason: string }
  | { allowed: false; reason: string; retryAt: Date | null }; // retryAt=null이면 재시도하지 말고 폐기

function nextAllowedWindowStart(now: Date, pol: EffectivePolicy = policyFor()): Date {
  const p = kstParts(now);
  if (p.hour < pol.allowFromHour) {
    return kstDate(p.year, p.month, p.day, pol.allowFromHour, 30);
  }
  const tomorrow = new Date(startOfKstDay(now).getTime() + 24 * 60 * 60 * 1000);
  const t = kstParts(tomorrow);
  return kstDate(t.year, t.month, t.day, pol.allowFromHour, 30);
}

function withinQuietHours(now: Date, pol: EffectivePolicy = policyFor()): boolean {
  const h = kstParts(now).hour;
  return h < pol.allowFromHour || h > pol.allowUntilHour;
}

function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function hold(reason: string, retryAt: Date | null, expiresAt?: Date | null): PushGateDecision {
  // 재시도 시각이 만료 이후라면 기다려봤자 소용없으니 폐기로 바꾼다.
  if (retryAt && expiresAt && retryAt.getTime() > expiresAt.getTime()) {
    return { allowed: false, reason: `${reason} (재시도 시각이 만료 이후라 폐기)`, retryAt: null };
  }
  return { allowed: false, reason, retryAt };
}

/**
 * 순수 함수 — DB를 읽지 않는다. 판단 순서:
 * 1) 채널 허용 여부  2) 사용자가 문자 참견을 껐는가 / '살짝'인가  3) 만료
 * 4) 사건 시각(기한 전 COMMITMENT_CHECK 금지)  5) REMINDER면 여기서 통과(쿨다운 bypass)
 * 6) 조용한 시간  7) 같은 topic/기억 중복  8) 사용자 활동 중(RETURN_MEMORY)
 * 9) 쿨다운(기본 12시간, '자주'는 6시간)  10) 하루 최대 횟수(기본 1, '자주'는 2)
 * prefs를 넘기지 않으면 기존 정책과 완전히 같다.
 */
export function evaluatePushGate(input: PushGateInput, history: PushHistory, prefs?: GatePrefs): PushGateDecision {
  // eslint-disable-next-line no-param-reassign
  const { type, channel, now, expiresAt, referencedEventAt } = input;
  const rule = channelRule(type, channel);
  const pol = policyFor(prefs);

  if (rule === 'forbidden') {
    return { allowed: false, reason: `${type} + ${channel} 조합은 허용되지 않음`, retryAt: null };
  }
  if (rule === 'immediate') {
    // screen 같은 즉시 채널은 push가 아니다 — 게이트를 부를 이유가 없지만, 불렸다면 통과시킨다.
    return { allowed: true, reason: 'immediate 채널 (push gate 대상 아님)' };
  }

  if (prefs && !prefs.outreachEnabled) {
    return { allowed: false, reason: '사용자가 문자·전화 참견을 꺼둠', retryAt: null };
  }
  if (prefs && prefs.interventionLevel === 'low' && type !== 'REMINDER') {
    return { allowed: false, reason: "참견 정도 '살짝' — 직접 부탁한 알림만 문자로 보냄", retryAt: null };
  }

  if (expiresAt && now.getTime() > expiresAt.getTime()) {
    return { allowed: false, reason: '만료됨', retryAt: null };
  }

  if (type === 'COMMITMENT_CHECK' && referencedEventAt && now.getTime() < referencedEventAt.getTime()) {
    // 기한 전 "토요일에 운동한다고 했잖아!" 식의 선제 압박 금지.
    return hold('약속 기한 전이라 확인하지 않음', referencedEventAt, expiresAt);
  }

  if (rule === 'bypass') {
    return { allowed: true, reason: `${type}: 일반 쿨다운 bypass (발송 후 쿨다운은 다시 시작됨)` };
  }

  // ---- 여기부터 일반(gated) push ----

  if (withinQuietHours(now, pol)) {
    return hold('조용한 시간대', nextAllowedWindowStart(now, pol), expiresAt);
  }

  if (input.eventBound) {
    return { allowed: true, reason: '사용자가 말한 일정 알림 — 하루 상한/쿨다운 예외 (조용한 시간은 지킴)' };
  }

  // 일정 알림은 사용자가 직접 말한 일정이라, 다른 참견의 쿨다운/하루 상한 계산에 넣지 않는다.
  history = { ...history, recentPushes: history.recentPushes.filter((p) => !(p.topic_key ?? '').startsWith('event:')) };

  const blockSince = now.getTime() - SAME_TOPIC_BLOCK_DAYS * 24 * 60 * 60 * 1000;
  const sameTopic = history.recentPushes.find(
    (p) =>
      new Date(p.created_at).getTime() >= blockSince &&
      ((input.topicKey && p.topic_key === input.topicKey) ||
        (input.memoryId != null && p.chosen_memory_id === input.memoryId))
  );
  if (sameTopic) {
    return { allowed: false, reason: '같은 주제/기억으로 최근에 이미 찾아감', retryAt: null };
  }

  if (type === 'RETURN_MEMORY' && history.lastUserActivityAt) {
    const activeUntil = new Date(history.lastUserActivityAt).getTime() + USER_ACTIVE_WINDOW_MINUTES * 60 * 1000;
    if (now.getTime() < activeUntil) {
      // 방금까지 앱에서 이야기하던 사람에게 문자를 또 보내지 않는다 — 화면이 이미 대화 채널이다.
      return hold('사용자가 방금 앱에서 활동함', new Date(activeUntil), expiresAt);
    }
  }

  // 쿨다운은 REMINDER 포함 "모든" push 기준 — REMINDER가 나가면 일반 push 쿨다운이 다시 시작된다.
  const lastPush = history.recentPushes[0];
  if (lastPush) {
    const cooldownUntil = new Date(lastPush.created_at).getTime() + pol.cooldownHours * 60 * 60 * 1000;
    if (now.getTime() < cooldownUntil) {
      let retry = new Date(cooldownUntil);
      if (withinQuietHours(retry, pol)) retry = nextAllowedWindowStart(retry, pol);
      return hold(`일반 push 쿨다운(${pol.cooldownHours}시간) 중`, retry, expiresAt);
    }
  }

  // 하루 상한은 REMINDER를 세지 않는다 (사용자가 직접 요청한 것이므로).
  const todayStart = startOfKstDay(now).getTime();
  const todayGeneral = history.recentPushes.filter(
    (p) => new Date(p.created_at).getTime() >= todayStart && p.intervention_type !== 'REMINDER'
  ).length;
  if (todayGeneral >= pol.dailyMax) {
    const tomorrow = new Date(todayStart + 24 * 60 * 60 * 1000);
    const retry = laterOf(nextAllowedWindowStart(new Date(tomorrow.getTime() - 60 * 1000), pol), tomorrow);
    return hold('오늘 일반 push 상한 도달', retry, expiresAt);
  }

  return { allowed: true, reason: 'push gate 통과' };
}

export async function loadPushHistory(userId: string, now: Date = new Date()): Promise<PushHistory> {
  const since = new Date(now.getTime() - SAME_TOPIC_BLOCK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [pushRes, activityRes] = await Promise.all([
    supabase
      .from('intervention_log')
      .select('created_at, intervention_type, topic_key, chosen_memory_id')
      .eq('user_id', userId)
      .eq('decision', 'intervene')
      .in('channel', ['sms', 'push', 'call', 'letter'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('voice_entries')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (pushRes.error) {
    // 기록을 못 읽었는데 "기록 없음"으로 취급하면 게이트가 열려버린다 — 호출부가 막도록 예외를 던진다.
    throw new Error(`[pushGate] intervention_log 조회 실패: ${pushRes.error.message}`);
  }

  return {
    recentPushes: (pushRes.data ?? []) as PushRecord[],
    lastUserActivityAt: (activityRes.data as any)?.created_at ?? null,
  };
}

/** DB 조회 + 판단을 한 번에. 조회 실패 시 안전하게 "보내지 않음"(1시간 뒤 재시도)으로 답한다. */
export async function checkPushGate(userId: string, input: PushGateInput): Promise<PushGateDecision> {
  const rule = channelRule(input.type, input.channel);
  if (rule === 'forbidden' || rule === 'immediate') return evaluatePushGate(input, { recentPushes: [], lastUserActivityAt: null });
  try {
    // 사용자 설정을 못 읽으면 loadUserPrefs가 던진다 → 아래 catch에서 안전하게 보류.
    // (migration 전이라 컬럼이 없을 때만 기본값 = 기존 정책)
    const [history, { prefs }] = await Promise.all([loadPushHistory(userId, input.now), loadUserPrefs(userId)]);
    return evaluatePushGate(input, history, prefs);
  } catch (err: any) {
    console.error(err?.message ?? err);
    return hold('push 기록 조회 실패 — 안전하게 보류', new Date(input.now.getTime() + 60 * 60 * 1000), input.expiresAt);
  }
}
