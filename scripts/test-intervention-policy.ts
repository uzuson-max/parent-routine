
import { evaluatePushGate, PushHistory } from '../lib/intervention/pushGate';
import { channelRule } from '../lib/intervention/interventionTypes';
import {
  isExplicitReminderRequest,
  scheduleCommitment,
  commitmentExpiry,
  commitmentReferencedAt,
  sanitizeDueAt,
} from '../lib/intervention/commitmentSchedule';
import { kstDate, kstHuman } from '../lib/intervention/kstTime';
import { composeSms } from '../lib/solapi';
import { hasPresentActionGuess } from '../lib/interventionEngine';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const empty: PushHistory = { recentPushes: [], lastUserActivityAt: null };
const thu2030 = kstDate(2026, 9, 24, 20, 30);
const sat0900 = kstDate(2026, 9, 26, 9, 0);

// A: REMINDER
{
  check('A1 리마인더 요청 감지', isExplicitReminderRequest('토요일 아침 9시에 출발할 예정이니까 그것 좀 다시 알려줘'));
  const s = scheduleCommitment('reminder', sat0900, thu2030);
  check('A2 target_date = 토 09:00', s.targetDate?.getTime() === sat0900.getTime());
  check('A3 발송 예정 = 토 08:00', s.nextInterventionAt?.getTime() === kstDate(2026, 9, 26, 8, 0).getTime(), s.nextInterventionAt ? kstHuman(s.nextInterventionAt) : 'null');
  check('A4 시각 없는 리마인더는 스케줄 안 함', scheduleCommitment('reminder', null, thu2030).nextInterventionAt === null);
  check('A5 과거 시각은 버림', sanitizeDueAt(kstDate(2026, 9, 24, 9, 0).toISOString(), thu2030) === null);
}
// B: COMMITMENT_CHECK
{
  check('B1 리마인더 요청 아님', !isExplicitReminderRequest('토요일 아침에 운동할 거야'));
  const due = kstDate(2026, 9, 26, 8, 0);
  const s = scheduleCommitment('commitment', due, thu2030);
  check('B2 결과 확인 = 기한+3h', s.nextInterventionAt?.getTime() === kstDate(2026, 9, 26, 11, 0).getTime());
  const ref = commitmentReferencedAt(due, thu2030);
  const exp = commitmentExpiry('commitment', due, thu2030);
  const before = evaluatePushGate({ type: 'COMMITMENT_CHECK', channel: 'sms', now: kstDate(2026, 9, 25, 12, 0), referencedEventAt: ref, expiresAt: exp }, empty);
  check('B3 기한 전 차단', !before.allowed, before.reason);
  const after = evaluatePushGate({ type: 'COMMITMENT_CHECK', channel: 'sms', now: kstDate(2026, 9, 26, 11, 0), referencedEventAt: ref, expiresAt: exp }, empty);
  check('B4 기한 후 허용', after.allowed, after.reason);
  const expired = evaluatePushGate({ type: 'COMMITMENT_CHECK', channel: 'sms', now: kstDate(2026, 9, 29, 12, 0), referencedEventAt: ref, expiresAt: exp }, empty);
  check('B5 72h 지나면 폐기', !expired.allowed, expired.reason);
  check('B6 전화 금지', channelRule('COMMITMENT_CHECK', 'call') === 'forbidden');
}
// C: RETURN_MEMORY
{
  check('C1 screen immediate', channelRule('RETURN_MEMORY', 'screen') === 'immediate');
  check('C2 sms gated', channelRule('RETURN_MEMORY', 'sms') === 'gated');
  check('C3 call forbidden', channelRule('RETURN_MEMORY', 'call') === 'forbidden');
  check('C4 기록 없으면 통과', evaluatePushGate({ type: 'RETURN_MEMORY', channel: 'sms', now: kstDate(2026, 9, 25, 14, 0) }, empty).allowed);
  const active = evaluatePushGate({ type: 'RETURN_MEMORY', channel: 'sms', now: kstDate(2026, 9, 25, 14, 0) }, { recentPushes: [], lastUserActivityAt: kstDate(2026, 9, 25, 13, 40).toISOString() });
  check('C5 앱 활동 직후 보류', !active.allowed, active.reason);
}
// D: 쿨다운
{
  const h: PushHistory = { recentPushes: [{ created_at: kstDate(2026, 9, 25, 10, 0).toISOString(), intervention_type: 'RETURN_MEMORY', topic_key: 'memory:1', chosen_memory_id: 1 }], lastUserActivityAt: null };
  const d = evaluatePushGate({ type: 'RETURN_MEMORY', channel: 'sms', now: kstDate(2026, 9, 25, 18, 0), memoryId: 2 }, h);
  check('D1 12h 쿨다운 차단', !d.allowed, d.reason);
  const d2 = evaluatePushGate({ type: 'RETURN_MEMORY', channel: 'sms', now: kstDate(2026, 9, 27, 12, 0), memoryId: 1, topicKey: 'memory:1' }, h);
  check('D2 같은 기억 7일 차단', !d2.allowed, d2.reason);
}
// E: REMINDER bypass + 쿨다운 리셋
{
  const h: PushHistory = { recentPushes: [{ created_at: kstDate(2026, 9, 26, 7, 45).toISOString(), intervention_type: 'RETURN_MEMORY', topic_key: 'x', chosen_memory_id: null }], lastUserActivityAt: null };
  check('E1 REMINDER bypass', evaluatePushGate({ type: 'REMINDER', channel: 'sms', now: kstDate(2026, 9, 26, 8, 0), referencedEventAt: sat0900, expiresAt: commitmentExpiry('reminder', sat0900, thu2030) }, h).allowed);
  const after: PushHistory = { recentPushes: [{ created_at: kstDate(2026, 9, 26, 8, 0).toISOString(), intervention_type: 'REMINDER', topic_key: 'commitment:r', chosen_memory_id: null }], lastUserActivityAt: null };
  const g = evaluatePushGate({ type: 'RETURN_MEMORY', channel: 'sms', now: kstDate(2026, 9, 26, 14, 0) }, after);
  check('E2 REMINDER 후 일반 push 쿨다운', !g.allowed && g.reason.includes('쿨다운'), g.reason);
  check('E3 REMINDER는 하루 상한에 안 셈', evaluatePushGate({ type: 'RETURN_MEMORY', channel: 'sms', now: kstDate(2026, 9, 26, 20, 30) }, after).allowed);
  check('E4 REMINDER는 이른 아침에도 발송', evaluatePushGate({ type: 'REMINDER', channel: 'sms', now: kstDate(2026, 9, 26, 6, 0), referencedEventAt: kstDate(2026, 9, 26, 7, 0), expiresAt: kstDate(2026, 9, 26, 7, 30) }, empty).allowed);
}
// F/G: FOLLOW_UP
{
  check('F1 FOLLOW_UP SMS 금지', !evaluatePushGate({ type: 'FOLLOW_UP', channel: 'sms', now: kstDate(2026, 9, 25, 14, 0) }, empty).allowed);
  check('F2 FOLLOW_UP 전화 금지', channelRule('FOLLOW_UP', 'call') === 'forbidden');
  check('G1 대화(screen) 안에서는 허용', channelRule('FOLLOW_UP', 'screen') === 'immediate');
}
// H: 미래 사건을 현재 행동으로 바꾸지 않음
{
  check('H1 버그 문구 감지', hasPresentActionGuess('지금쯤 일어나서 준비하고 있을 시간인데, 가족 보러 갈 준비는 잘 되고 있어?'));
  check('H2 정상 문구 통과', !hasPresentActionGuess('한 시간 뒤에 9시 출발이잖아. 짐은 다 챙겼어?'));
  const s = scheduleCommitment('reminder', sat0900, kstDate(2026, 9, 24, 16, 14));
  check('H3 목요일 저장 리마인더는 목요일에 후보 아님', (s.nextInterventionAt as Date).getTime() > thu2030.getTime());
  const d = evaluatePushGate({ type: 'COMMITMENT_CHECK', channel: 'sms', now: thu2030, referencedEventAt: sat0900, expiresAt: commitmentExpiry('commitment', sat0900, thu2030) }, empty);
  check('H4 commitment로 분류돼도 목 20:30 차단', !d.allowed, d.reason);
}
// I: 같은 topic 여러 기억
{
  const h: PushHistory = { recentPushes: [{ created_at: kstDate(2026, 9, 25, 11, 0).toISOString(), intervention_type: 'RETURN_MEMORY', topic_key: 'entity:vacation', chosen_memory_id: 10 }], lastUserActivityAt: null };
  const same = evaluatePushGate({ type: 'RETURN_MEMORY', channel: 'sms', now: kstDate(2026, 9, 25, 15, 0), memoryId: 11, topicKey: 'entity:vacation' }, h);
  check('I1 같은 topic 차단', !same.allowed && same.reason.includes('같은 주제'), same.reason);
  check('I2 3일 뒤에도 차단', !evaluatePushGate({ type: 'RETURN_MEMORY', channel: 'sms', now: kstDate(2026, 9, 28, 12, 0), memoryId: 12, topicKey: 'entity:vacation' }, h).allowed);
  check('I3 다른 topic도 쿨다운 적용', !evaluatePushGate({ type: 'RETURN_MEMORY', channel: 'sms', now: kstDate(2026, 9, 25, 14, 0), memoryId: 13, topicKey: 'entity:work' }, h).allowed);
}
// J: "참견이 등장." 중복 없음
{
  const longBody = '안녕! 토요일에 가족 보러 가는 거, 아침 9시 출발이라고 했잖아. 한 시간 뒤야. 짐은 어제 챙겨뒀어? 혹시 빠진 거 있으면 지금 확인해봐도 늦지 않아.';
  const c = composeSms(longBody, '참견이 등장.');
  check('J1 LMS에서 정확히 1번', c.type === 'LMS' && `${c.subject}\n${c.text}`.split('참견이 등장.').length - 1 === 1);
  const s = composeSms('한 시간 뒤 출발이지?', '참견이 등장.');
  check('J2 SMS에서 정확히 1번', s.type === 'SMS' && s.text.split('참견이 등장.').length - 1 === 1);
  check('J3 GPT가 머리말 반복해도 1번', composeSms('참견이 등장. 한 시간 뒤 출발이지?', '참견이 등장.').text.split('참견이 등장.').length - 1 === 1);
  check('J4 헤더 없는 LMS 제목은 "참견이"', composeSms(longBody).subject === '참견이');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
