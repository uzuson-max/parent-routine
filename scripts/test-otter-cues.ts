// scripts/test-otter-cues.ts
// 실행: npx tsx --tsconfig tsconfig.json scripts/test-otter-cues.ts
// 참견이(수달) 반응 규칙(lib/otterCues.ts) — 순수 함수 테스트. DB/네트워크 없음.
import { decideCue, deepTapCue, deepTapLines, GREET_GAP_MS, pickVisit, WANDER_GAP_MS, type OtterMemory, type VisitState } from '../lib/otterCues';

let fail = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + JSON.stringify(detail)}`);
  if (!cond) fail++;
}

const NOW = new Date('2026-10-12T09:00:00Z'); // 18:00 KST
const DAY = 86_400_000;
const MIN = 60_000;
const iso = (msFromNow: number) => new Date(NOW.getTime() + msFromNow).toISOString();

// 1) 처음 홈 안내는 딱 한 번
{
  const a = decideCue({ type: 'home_first_visit' }, {}, NOW);
  check('처음 홈 → 안내 한마디', !!a.cue?.line && a.next.homeIntro === true, a);
  const b = decideCue({ type: 'home_first_visit' }, a.next, NOW);
  check('두 번째 홈 → 조용히', b.cue === null, b);
}

// 2) 메모 저장 — 첫 번째만 말하고 그 뒤엔 말 없이 끄덕
{
  const a = decideCue({ type: 'note_saved' }, {}, NOW);
  check('첫 메모 저장 → 한마디', !!a.cue?.line && a.next.firstNote === true, a);
  const b = decideCue({ type: 'note_saved' }, a.next, NOW);
  check('두 번째 메모 저장 → 말 없음(끄덕)', !!b.cue && b.cue.line === null && b.cue.motion === 'nod', b);
}

// 3) 오래된 메모를 다시 열었을 때만 "오랜만" — 사실(만든 시각/마지막으로 연 시각)로만
{
  const fresh = decideCue({ type: 'note_reopened', createdAt: iso(-3 * DAY), previousOpenedAt: null }, {}, NOW);
  check('3일 전 메모 → 조용히', fresh.cue === null, fresh);
  const old = decideCue({ type: 'note_reopened', createdAt: iso(-40 * DAY), previousOpenedAt: null }, {}, NOW);
  check('40일 전 메모(처음 다시 엶) → 놀람 + 한 달 전쯤', !!old.cue && old.cue.expression === 'surprise' && /한 달 전쯤/.test(old.cue.line ?? ''), old);
  const seenRecently = decideCue({ type: 'note_reopened', createdAt: iso(-40 * DAY), previousOpenedAt: iso(-2 * DAY) }, {}, NOW);
  check('오래된 메모라도 이틀 전에 봤으면 → 조용히', seenRecently.cue === null, seenRecently);
  const seenLongAgo = decideCue({ type: 'note_reopened', createdAt: iso(-90 * DAY), previousOpenedAt: iso(-30 * DAY) }, {}, NOW);
  check('마지막으로 본 게 30일 전 → "마지막으로 본 게"', /마지막으로 본 게/.test(seenLongAgo.cue?.line ?? ''), seenLongAgo);
}

// 4) 알람 설정 — 첫 번째만 시각+채널을 말한다, 저장 안 된 걸 말하지 않는다
{
  const at = '2026-10-13T02:00:00Z'; // 내일 11:00 KST
  const a = decideCue({ type: 'reminder_set', remindAt: at, channel: 'sms' }, {}, NOW);
  check('첫 알람 → 내일 오전 11시 + 문자', (a.cue?.line ?? '').includes('내일 오전 11시') && (a.cue?.line ?? '').includes('문자'), a);
  const b = decideCue({ type: 'reminder_set', remindAt: at, channel: 'sms' }, a.next, NOW);
  check('두 번째 알람 → 말 없음', !!b.cue && b.cue.line === null, b);
}

// 5) 실패한 알람은 알람마다 한 번만
{
  const a = decideCue({ type: 'reminder_failed', id: 7, title: '스튜디오' }, {}, NOW);
  check('실패 알람 → 한마디', (a.cue?.line ?? '').includes('스튜디오'), a);
  const b = decideCue({ type: 'reminder_failed', id: 7, title: '스튜디오' }, a.next, NOW);
  check('같은 실패 알람 → 다시 말 안 함', b.cue === null, b);
  const c = decideCue({ type: 'reminder_failed', id: 8, title: '병원' }, a.next, NOW);
  check('다른 실패 알람 → 말함', !!c.cue, c);
}

// 6) 심해 인사 — 6시간에 한 번 이하, 곧 울릴 알람이 있으면 그걸 말한다
{
  const a = decideCue({ type: 'deep_arrive', night: false, nextReminder: null }, {}, NOW);
  check('처음 내려옴 → 인사', a.cue?.line === '어, 왔어?', a);
  const b = decideCue({ type: 'deep_arrive', night: false, nextReminder: null }, a.next, new Date(NOW.getTime() + 60_000));
  check('1분 뒤 또 내려옴 → 조용히', b.cue === null, b);
  const c = decideCue({ type: 'deep_arrive', night: false, nextReminder: null }, a.next, new Date(NOW.getTime() + GREET_GAP_MS + 1000));
  check('6시간 뒤 → 다시 인사', !!c.cue, c);
  const mem: OtterMemory = {};
  const d = decideCue({ type: 'deep_arrive', night: true, nextReminder: { title: '약 먹기', at: iso(60 * 60 * 1000) } }, mem, NOW);
  check('곧 울릴 알람 → 그걸 말함', (d.cue?.line ?? '').includes('약 먹기'), d);
  const e = decideCue({ type: 'deep_arrive', night: true, nextReminder: { title: '약 먹기', at: iso(5 * DAY) } }, mem, NOW);
  check('먼 알람 → 평소 밤 인사', e.cue?.line === '…음? 이 시간에 왔어?', e);
}

// 7) 심해 탭 — 실제 상태로만, 다 말하면 더 안 만든다
{
  const facts = { fishCount: 0, stage: 0, noteCount: null, nextReminder: null };
  const lines = deepTapLines(facts, NOW);
  check('물고기 0 → 숫자 자랑 없이 "아직 없네"', lines.some((l) => l.includes('아직 물고기가 없네')) && !lines.some((l) => /\d+마리/.test(l)), lines);
  check('메모 개수 모르면 쪽지 얘기 안 함', !lines.some((l) => l.includes('쪽지')), lines);
  const withNotes = deepTapLines({ ...facts, noteCount: 3 }, NOW);
  check('메모 있으면 쪽지 얘기', withNotes.some((l) => l.includes('쪽지')), withNotes);
  const seq = Array.from({ length: lines.length + 3 }, (_, i) => deepTapCue(facts, i, NOW).line);
  check('같은 말 연달아 안 함', seq.slice(0, lines.length).every((l, i, a) => i === 0 || l !== a[i - 1]), seq);
  check('다 말한 뒤엔 "간지러워" 한 번, 그다음은 말 없음', seq[lines.length] === '간지러워.' && seq[lines.length + 1] === null, seq);
  check('명령형 "말해봐" 없음', !lines.join(' ').includes('말해봐'), lines);
}

// 8) 말투 — 명령형 종결/공손체 금지 확인(모든 말)
{
  const all: string[] = [];
  const push = (r: { cue: { line: string | null } | null }) => r.cue?.line && all.push(r.cue.line);
  push(decideCue({ type: 'home_first_visit' }, {}, NOW));
  push(decideCue({ type: 'note_saved' }, {}, NOW));
  push(decideCue({ type: 'reminder_set', remindAt: iso(DAY), channel: 'push' }, {}, NOW));
  push(decideCue({ type: 'reminder_failed', id: 1, title: 'x' }, {}, NOW));
  all.push(...deepTapLines({ fishCount: 2, stage: 3, noteCount: 1, nextReminder: { title: 'y', at: iso(DAY) } }, NOW));
  const bad = all.filter((l) => /(해주세요|하세요|세요\.|말해봐|기억해\.|해야 해|잊지 마)/.test(l));
  check('금지 말투 없음', bad.length === 0, bad);
}

// 9) 첫 화면 방문(수달이 올라오는 일)
{
  const base: VisitState = {
    night: false,
    quiet: false,
    sinceLastVisitMs: Infinity,
    nextReminder: null,
    oldFish: null,
    newFryId: null,
    anyFishId: 'f1',
  };
  const alarm = { id: 5, title: '스튜디오', at: iso(40 * MIN) };
  const a = pickVisit({ ...base, nextReminder: alarm }, {}, NOW, 0.9);
  check('40분 뒤 알람 → 쪽지 들고 와서 "맞지?"', a.visit?.kind === 'alarm' && a.visit.holding === 'note' && /스튜디오.*맞지\?/.test(a.visit.line ?? ''), a.visit);
  const a2 = pickVisit({ ...base, nextReminder: alarm }, a.next, NOW, 0.9);
  check('같은 알람으로 두 번 안 옴', a2.visit?.kind !== 'alarm', a2.visit);
  const far = pickVisit({ ...base, nextReminder: { ...alarm, at: iso(3 * 60 * MIN) } }, {}, NOW, 0.9);
  check('3시간 뒤 알람 → 아직 안 옴', far.visit === null, far.visit);
  const quietAlarm = pickVisit({ ...base, quiet: true, nextReminder: alarm }, {}, NOW, 0.9);
  check('말풍선 떠 있으면 말하러 안 옴', quietAlarm.visit === null, quietAlarm.visit);
  const nightAlarm = pickVisit({ ...base, night: true, nextReminder: alarm }, {}, NOW, 0.1);
  check('밤이어도 알람은 옴', nightAlarm.visit?.kind === 'alarm', nightAlarm.visit);

  const old = pickVisit({ ...base, oldFish: { id: 'L1', lastAt: iso(-30 * DAY) } }, {}, NOW, 0.9);
  check('30일 안 꺼낸 생각 → 그 물고기 옆 + 언제인지', old.visit?.kind === 'old_fish' && old.visit.targetFishId === 'L1' && /한 달 전쯤/.test(old.visit.line ?? ''), old.visit);
  const old2 = pickVisit({ ...base, oldFish: { id: 'L1', lastAt: iso(-30 * DAY) } }, old.next, NOW, 0.9);
  check('같은 주에 같은 물고기 또 안 옴', old2.visit?.kind !== 'old_fish', old2.visit);
  const young = pickVisit({ ...base, oldFish: { id: 'L2', lastAt: iso(-3 * DAY) } }, {}, NOW, 0.9);
  check('3일 된 생각 → 안 옴', young.visit === null, young.visit);

  const fry = pickVisit({ ...base, quiet: true, newFryId: 'S9' }, {}, NOW, 0.9);
  check('새 치어 → 말 없이 구경(말풍선 있어도)', fry.visit?.kind === 'new_fry' && fry.visit.line === null && fry.visit.targetFishId === 'S9', fry.visit);

  const w1 = pickVisit(base, {}, NOW, 0.2);
  check('할 일 없음 + 가끔 → 말 없이 놀러 옴', w1.visit?.kind === 'wander' && w1.visit.line === null, w1.visit);
  const w2 = pickVisit(base, {}, NOW, 0.8);
  check('할 일 없음 + 대부분 → 안 옴', w2.visit === null, w2.visit);
  const w3 = pickVisit({ ...base, sinceLastVisitMs: WANDER_GAP_MS - 1000 }, {}, NOW, 0.1);
  check('방금 왔다 갔으면 안 옴', w3.visit === null, w3.visit);
  const w4 = pickVisit({ ...base, night: true }, {}, NOW, 0.1);
  check('밤엔 놀러 안 옴(잠)', w4.visit === null, w4.visit);
}

console.log(fail ? `\n${fail}개 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
