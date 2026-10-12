// scripts/test-reminders.ts
// 실행: npx tsx --tsconfig tsconfig.json scripts/test-reminders.ts
// 알람 규칙(lib/reminders/core.ts, rules.ts) + 발송기(lib/reminders/deliver.ts)를 가짜 DB로 검증한다.
// 실제 DB/문자/앱 알림은 쓰지 않는다 — 실제 발송 검증은 배포 후 별도로 해야 한다.
import {
  afterFailure,
  isOverdue,
  isTooLate,
  kstInputToIso,
  kstLabel,
  normalizeRemindAt,
  normalizeTitle,
  quickPicks,
  suggestFromEvent,
  MAX_ATTEMPTS,
} from '../lib/reminders/core';
import { PermanentError, processDueReminders } from '../lib/reminders/deliver';

let fail = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + JSON.stringify(detail)}`);
  if (!cond) fail++;
}

const NOW = new Date('2026-10-12T09:00:00Z'); // 18:00 KST
const MIN = 60_000;
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

// ---------------------------------------------------------------- 입력 검증
{
  check('제목 정상', normalizeTitle('  스튜디오   가기 ').ok && (normalizeTitle(' 스튜디오   가기 ') as any).value === '스튜디오 가기');
  check('빈 제목 거절', !normalizeTitle('   ').ok);
  check('31자 거절', !normalizeTitle('가'.repeat(31)).ok);
  check('30자 한글은 문자 90바이트 안', normalizeTitle('가'.repeat(30)).ok);
  check('이모지 30개는 문자로 못 보내니 거절', !normalizeTitle('😀'.repeat(30)).ok);
  check('지난 시각 거절', !normalizeRemindAt(at(-MIN), NOW).ok);
  check('30초 뒤 거절(1분 이상)', !normalizeRemindAt(at(30_000), NOW).ok);
  check('2분 뒤 허용', normalizeRemindAt(at(2 * MIN), NOW).ok);
  check('400일 뒤 거절', !normalizeRemindAt(at(400 * 86_400_000), NOW).ok);
  check('이상한 문자열 거절', !normalizeRemindAt('내일', NOW).ok);
}

// ---------------------------------------------------------------- 한국 시간
{
  const iso = kstInputToIso('2026-10-13', '11:00');
  check('입력칸 → 한국 시간 ISO', iso === '2026-10-13T02:00:00.000Z', iso);
  check('표시: 내일 오전 11시', kstLabel(iso!, NOW) === '내일 오전 11시', kstLabel(iso!, NOW));
  check('표시: 오늘 오후 9시 30분', kstLabel('2026-10-12T12:30:00Z', NOW) === '오늘 오후 9시 30분', kstLabel('2026-10-12T12:30:00Z', NOW));
  check('표시: 자정 = 오전 12시', kstLabel('2026-10-12T15:00:00Z', NOW) === '내일 오전 12시', kstLabel('2026-10-12T15:00:00Z', NOW));
  const picks = quickPicks(NOW);
  check('빠른 선택: 1시간 뒤 / 오늘 밤 9시 / 내일 아침 9시', picks.map((p) => p.label).join(',') === '1시간 뒤,오늘 밤 9시,내일 아침 9시', picks);
  const late = quickPicks(new Date('2026-10-12T12:55:00Z')); // 21:55 KST
  check('밤 10시 가까우면 "오늘 밤 9시" 빠짐', !late.some((p) => p.label === '오늘 밤 9시'), late);
}

// ---------------------------------------------------------------- 음성 일정 → 제안 시각
{
  check('내일 11시 일정 → 10시 30분 제안', suggestFromEvent('2026-10-13T02:00:00Z', NOW) === '2026-10-13T01:30:00.000Z');
  check('20분 뒤 일정 → 그 시각 그대로', suggestFromEvent(at(20 * MIN), NOW) === at(20 * MIN));
  check('1분 뒤 일정 → 제안 안 함', suggestFromEvent(at(MIN), NOW) === null);
  check('지난 일정 → 제안 안 함', suggestFromEvent(at(-MIN), NOW) === null);
}

// ---------------------------------------------------------------- 실패/지연 규칙
{
  check('3시간 늦음 = 너무 늦음', isTooLate(at(-3 * 60 * MIN), NOW));
  check('5분 늦음 = 보냄', !isTooLate(at(-5 * MIN), NOW));
  check('일시 실패 1번째 → 재시도', afterFailure(1, at(-MIN), NOW, false) === 'retry');
  check(`일시 실패 ${MAX_ATTEMPTS}번째 → 포기`, afterFailure(MAX_ATTEMPTS, at(-MIN), NOW, false) === 'fail');
  check('영구 실패 → 바로 포기', afterFailure(1, at(-MIN), NOW, true) === 'fail');
  check('예약인데 10분 지남 → 화면에 "아직 못 알려줬어"', isOverdue('scheduled', at(-10 * MIN), NOW));
  check('보낸 건 overdue 아님', !isOverdue('sent', at(-10 * MIN), NOW));
}

// ---------------------------------------------------------------- 가짜 DB로 발송기
type Row = Record<string, any>;
function fakeDb(rows: Row[]) {
  class Q {
    private filters: ((r: Row) => boolean)[] = [];
    private op: 'select' | 'update' = 'select';
    private patch: Row = {};
    private returning = false;
    private _limit = Infinity;
    private _order: { col: string; asc: boolean } | null = null;
    constructor(private table: string) {}
    select() {
      if (this.op === 'update') this.returning = true;
      return this;
    }
    update(p: Row) {
      this.op = 'update';
      this.patch = p;
      return this;
    }
    eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
    neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
    lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this; }
    lte(c: string, v: any) { this.filters.push((r) => r[c] <= v); return this; }
    in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
    order(col: string, o: { ascending: boolean }) { this._order = { col, asc: o.ascending }; return this; }
    limit(n: number) { this._limit = n; return this; }
    then(resolve: (v: any) => void) {
      if (this.table !== 'reminders') return resolve({ data: [], error: null });
      let hit = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === 'update') {
        hit.forEach((r) => Object.assign(r, this.patch));
        return resolve({ data: this.returning ? hit.map((r) => ({ ...r })) : null, error: null });
      }
      if (this._order) {
        const { col, asc } = this._order;
        hit = [...hit].sort((a, b) => (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1));
      }
      return resolve({ data: hit.slice(0, this._limit).map((r) => ({ ...r })), error: null });
    }
  }
  return { from: (t: string) => new Q(t) } as any;
}
const row = (id: number, remindMs: number, extra: Row = {}): Row => ({
  id,
  user_id: 'u1',
  title: '알람' + id,
  remind_at: at(remindMs),
  status: 'scheduled',
  source: 'manual',
  source_entry_id: null,
  note_id: null,
  channel: null,
  attempts: 0,
  last_error: null,
  sent_at: null,
  created_at: at(-60 * MIN),
  updated_at: at(-60 * MIN),
  ...extra,
});

async function main() {
  // 1) 보낼 때 된 것만, 한 번만
  {
    const rows = [row(1, -MIN), row(2, 10 * MIN), row(3, -2 * MIN, { status: 'canceled' })];
    const sent: number[] = [];
    const db = fakeDb(rows);
    const send = async (r: any) => {
      sent.push(r.id);
      return 'sms' as const;
    };
    const r1 = await processDueReminders(NOW, {}, { db, send });
    check('시각 된 알람만 보냄', sent.join() === '1', { sent, r1 });
    check('보낸 알람 → sent + 채널 기록', rows[0].status === 'sent' && rows[0].channel === 'sms' && rows[0].attempts === 1, rows[0]);
    check('취소한 알람은 절대 안 보냄', rows[2].status === 'canceled' && !sent.includes(3));
    check('아직 안 된 알람은 그대로', rows[1].status === 'scheduled');
    await processDueReminders(NOW, {}, { db, send });
    check('크론이 다시 돌아도 중복 발송 없음', sent.join() === '1', sent);
  }

  // 2) 크론 두 개가 동시에 떠도 한 번만 (잡기 경쟁)
  {
    const rows = [row(10, -MIN)];
    const sent: number[] = [];
    const db = fakeDb(rows);
    const send = async (r: any) => {
      sent.push(r.id);
      await new Promise((ok) => setTimeout(ok, 20));
      return 'push' as const;
    };
    await Promise.all([processDueReminders(NOW, {}, { db, send }), processDueReminders(NOW, {}, { db, send })]);
    check('동시에 두 번 돌아도 한 번만 보냄', sent.length === 1, sent);
  }

  // 3) 일시 실패 → 재시도 → 3번째에 포기
  {
    const rows = [row(20, -MIN)];
    const db = fakeDb(rows);
    let calls = 0;
    const send = async () => {
      calls++;
      throw new Error('network');
    };
    await processDueReminders(NOW, {}, { db, send });
    check('1번째 실패 → 다시 예약', rows[0].status === 'scheduled' && rows[0].attempts === 1 && rows[0].last_error === 'network', rows[0]);
    await processDueReminders(NOW, {}, { db, send });
    await processDueReminders(NOW, {}, { db, send });
    check('3번 실패 → failed로 끝', rows[0].status === 'failed' && calls === 3, { row: rows[0], calls });
    await processDueReminders(NOW, {}, { db, send });
    check('failed는 다시 안 집음', calls === 3, calls);
  }

  // 4) 영구 실패(알려줄 수단 없음) → 바로 failed, 이유 남김
  {
    const rows = [row(30, -MIN)];
    const db = fakeDb(rows);
    await processDueReminders(NOW, {}, {
      db,
      send: async () => {
        throw new PermanentError('no_channel: 없음');
      },
    });
    check('수단 없음 → 바로 failed + 이유', rows[0].status === 'failed' && String(rows[0].last_error).startsWith('no_channel'), rows[0]);
  }

  // 5) 너무 늦은 알람(발송기가 멈췄다 깨어남) → 보내지 않고 late로
  {
    const rows = [row(40, -3 * 60 * MIN)];
    const sent: number[] = [];
    const db = fakeDb(rows);
    await processDueReminders(NOW, {}, { db, send: async (r: any) => (sent.push(r.id), 'sms' as const) });
    check('3시간 늦음 → 안 보내고 failed(late)', sent.length === 0 && rows[0].status === 'failed' && rows[0].last_error === 'late', rows[0]);
  }

  // 6) sending에서 멈춘 알람 → 10분 지나면 다시 시도
  {
    const rows = [row(50, -20 * MIN, { status: 'sending', attempts: 1, updated_at: at(-15 * MIN) })];
    const sent: number[] = [];
    const db = fakeDb(rows);
    const r = await processDueReminders(NOW, {}, { db, send: async (x: any) => (sent.push(x.id), 'push' as const) });
    check('멈춘 알람 복구 후 발송', r.recovered === 1 && sent.join() === '50' && rows[0].status === 'sent', { r, row: rows[0] });
    const fresh = [row(51, -MIN, { status: 'sending', attempts: 1, updated_at: at(-2 * MIN) })];
    const r2 = await processDueReminders(NOW, {}, { db: fakeDb(fresh), send: async () => 'push' as const });
    check('방금 sending 된 건 건드리지 않음', r2.recovered === 0 && fresh[0].status === 'sending', fresh[0]);
  }

  // 7) dryRun은 아무것도 안 바꿈
  {
    const rows = [row(60, -MIN)];
    const r = await processDueReminders(NOW, { dryRun: true }, { db: fakeDb(rows), send: async () => 'sms' as const });
    check('dryRun → 상태 그대로', rows[0].status === 'scheduled' && r.results.length === 1, rows[0]);
  }

  console.log(fail ? `\n${fail}개 실패` : '\n전부 통과');
  process.exit(fail ? 1 : 0);
}

main();
