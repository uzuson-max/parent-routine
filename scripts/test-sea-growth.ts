// scripts/test-sea-growth.ts
// 실행: npx tsx --tsconfig tsconfig.json scripts/test-sea-growth.ts
// 심해 성장 규칙(lib/seaGrowth.ts) 순수 함수 테스트 — DB/네트워크 없음.
import { computeMetrics, markSeen, resolveGrowth, stageFor, MAX_STAGE, type GrowthLineage } from '../lib/seaGrowth';

let fail = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + JSON.stringify(detail)}`);
  if (!cond) fail++;
}

const DAY = 86_400_000;
// 2026-10-01 12:00 KST
const BASE = Date.UTC(2026, 9, 1, 3, 0, 0);
const at = (dayOffset: number, hour = 12) => BASE + dayOffset * DAY + (hour - 12) * 3_600_000;
const lin = (...days: number[]): GrowthLineage => ({ mentions: days.map((d) => ({ at: at(d) })) });

// 1) 데이터 없음 → 0단계, 억지로 만들지 않음
{
  const m = computeMetrics([]);
  check('데이터 없으면 0단계', stageFor(m) === 0 && m.days === 0 && m.settled === 0, m);
}

// 2) 같은 날 같은 얘기를 열 번 녹음해도 "기록한 날"은 하루, "자리 잡은 생각"은 0
{
  const spam = { mentions: Array.from({ length: 10 }, (_, i) => ({ at: at(0, 9 + i) })) };
  const m = computeMetrics([spam, spam]);
  check('같은 날 중복 녹음은 하루로', m.days === 1 && m.settled === 0, m);
  check('중복 녹음만으로는 성장 안 함', stageFor(m) === 0, m);
}

// 3) 자정 경계는 한국 날짜 기준 (23시 vs 다음날 01시 = 이틀)
{
  const l = { mentions: [{ at: at(0, 23) }, { at: at(1, 1) }] };
  const m = computeMetrics([l]);
  check('한국 날짜로 이틀', m.days === 2 && m.settled === 1, m);
}

// 4) 이틀, 계보 2개 → 1단계
{
  const m = computeMetrics([lin(0), lin(1)]);
  check('이틀·생각 둘 → 1단계', stageFor(m) === 1, m);
}

// 5) 닷새를 기록했어도 다시 꺼낸 생각이 하나도 없으면 1단계에 머문다
{
  const m = computeMetrics([lin(0), lin(1), lin(2), lin(3), lin(4)]);
  check('다시 꺼낸 생각 없으면 2단계 못 감', stageFor(m) === 1, m);
  const m2 = computeMetrics([lin(0, 3), lin(1), lin(2), lin(3), lin(4)]);
  check('하나라도 다른 날 다시 꺼내면 2단계', stageFor(m2) === 2, m2);
}

// 6) 단계는 앞 단계 조건을 건너뛰지 않는다(topics 조건)
{
  check('topics 1이면 1단계 불가', stageFor({ days: 50, settled: 0, topics: 1 }) === 0);
  check('많이 쓰면 최고 단계', stageFor({ days: 60, settled: 30, topics: 40 }) === MAX_STAGE);
}

// 7) 처음 저장 — 지금 단계를 이미 본 것으로(가짜 성장 연출 없음)
{
  const r = resolveGrowth(3, { stage: null, seen: null });
  check('처음엔 stage=seen', r.stage === 3 && r.seen === 3 && r.write, r);
}

// 8) 성장했을 때만 stage > seen
{
  const r = resolveGrowth(4, { stage: 3, seen: 3 });
  check('올라가면 못 본 변화가 생김', r.stage === 4 && r.seen === 3 && r.write, r);
  const same = resolveGrowth(3, { stage: 3, seen: 3 });
  check('그대로면 변화 없음·저장 안 함', same.stage === 3 && same.seen === 3 && !same.write, same);
}

// 9) 데이터 조회 범위가 밀려 계산값이 내려가도 단계는 유지
{
  const r = resolveGrowth(1, { stage: 4, seen: 4 });
  check('단계는 안 내려감', r.stage === 4 && !r.write, r);
}

// 10) 멱등 — 같은 입력을 여러 번 넣어도 같은 결과
{
  let stored = { stage: 2 as number | null, seen: 2 as number | null };
  for (let i = 0; i < 5; i++) {
    const r = resolveGrowth(3, stored);
    stored = { stage: r.stage, seen: r.seen };
  }
  check('여러 번 불러도 한 단계만', stored.stage === 3 && stored.seen === 2, stored);
}

// 11) seen은 도달한 단계를 못 넘고, 내려가지도 않는다
{
  check('seen이 stage를 못 넘음', markSeen({ stage: 3, seen: 2 }, 5).seen === 3);
  check('seen은 안 내려감', markSeen({ stage: 3, seen: 3 }, 1).seen === 3);
}

// 12) 이상한 저장값 방어
{
  const r = resolveGrowth(2, { stage: 99 as any, seen: -4 as any });
  check('범위 밖 값은 잘라냄', r.stage === MAX_STAGE && r.seen === 0, r);
}

console.log(fail ? `\n${fail}개 실패` : '\n전부 통과');
if (fail) process.exit(1);
