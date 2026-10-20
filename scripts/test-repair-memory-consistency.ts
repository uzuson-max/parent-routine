// 2026-10-21 (D) — tryRepair가 기억이 든 문장을 지우고도 memory_unit_id_used를 남기는 문제(R08 유형) 결정적 테스트.
// API·DB 호출 없음. 실행: npx tsx scripts/test-repair-memory-consistency.ts
//
// 사례 1은 M1~M4 전후 비교 실행(2026-10-21, R08 after #3)의 최초 생성 결과를 그대로 썼다(응답 본문·opportunity 필드는 원자료 그대로).
// memory_relevance는 원자료에 저장되지 않아서, 엔진이 memory_unit_id_used=171을 남기려면 반드시 있어야 하는 최소값
// (171 = YES)만 넣었다. relation은 원자료에 없으므로 기억 사용이 허용되는 관계 중 하나(past_want_relevant_now)로 두었다.
// 기억 원문은 운영 DB memory_units(171·131·87·60·136)의 raw_quote/content 그대로다.
import { tryRepair } from '../lib/response/responsefallback';
import { validateResponse } from '../lib/response/responsevalidator';
import { SOFT_VALIDATION_REASONS } from '../lib/response/responsetypes';

type Check = { label: string; pass: boolean; detail?: string };
const results: Check[] = [];
function check(label: string, pass: boolean, detail?: string) {
  results.push({ label, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
}

const TRANSCRIPT = '식물샵을 11월에 열면 날씨도 안 맞고 망할 것 같아요.';
const MEMORY_TEXTS: Record<number, string> = {
  171: '돈을 모아야 돼 식물샵 하고 싶거든 / 식물샵을 하고 싶다는 목표가 있다.',
  131: '이제 내가 식물샵을 할 때 뭔가 나는 Roots를 되게 중요하잖아 / 식물샵을 할 때 Roots가 가장 중요하다고 생각한다고 했다.',
  87: '작은 공간에서 식물샵을 하고 싶다.',
  60: '식물을 계속 키울 것이라는 생각이 있다.',
  136: '제가 식물을 키우기 시작했을때 예를 들면 이번 주, 월 해에도 뭔지 기억을 못든건 아니였자나요 뿌리가 건강한다면 뿌리가 정말 풍부한 식물이 되어야만 합니다 / 식물을 키우기 시작했을 때 뿌리에 대해 많은 생각을 하지 않았지만, 뿌리가 건강하다면 풍부한 식물이 되어야 한다고 느꼈다.',
};
const ctx = (withMemoryTexts = true): any => ({
  validMemoryUnitIds: new Set([171, 131, 87, 60, 136]),
  previousResponse: null,
  transcript: TRANSCRIPT,
  utteranceIntent: 'statement',
  userQuestion: null,
  negativeTargets: [],
  ...(withMemoryTexts ? { memoryTexts: MEMORY_TEXTS } : {}),
});

function memoryResult(response: string, overrides: Record<string, any> = {}): any {
  return {
    response,
    response_strategy: 'QUESTION',
    interference_purpose: 'push',
    tone: 'neutral',
    humor_opportunity: 'low',
    memory_used: true,
    memory_reference: '식물샵을 하고 싶다는 목표',
    memory_unit_id_used: 171,
    insight_id_used: null,
    memory_relevance: [
      { memory_unit_id: 171, relevance: 'YES', relation: 'past_want_relevant_now' },
      { memory_unit_id: 131, relevance: 'NO', relation: 'no_relation' },
      { memory_unit_id: 87, relevance: 'NO', relation: 'no_relation' },
      { memory_unit_id: 60, relevance: 'NO', relation: 'no_relation' },
      { memory_unit_id: 136, relevance: 'NO', relation: 'no_relation' },
    ],
    conversation_opportunity: {
      source: 'memory',
      type: 'past_present_link',
      strength: 'STRONG',
      memory_unit_id: 171,
      anchor_quote: '식물샵을 11월에 열면 날씨도 안 맞고 망할 것 같아요.',
      anchor_fact: '식물샵을 11월에 열면 날씨가 맞지 않을 것이라는 우려가 있다.',
      question_target: '식물샵을 여는 시점에 대한 생각',
    },
    answered_user_question: false,
    question_present: true,
    channel: 'text',
    relationship_level: 5,
    ...overrides,
  };
}

// 엔진과 같은 조건: 실패 사유가 전부 HARD이고 수정 가능할 때만 tryRepair를 부른다(SOFT가 섞이면 엔진은 재생성으로 간다).
function reasonsFor(result: any, c: any) {
  const reasons = validateResponse(result, c).reasons;
  return { reasons, soft: reasons.filter((r) => SOFT_VALIDATION_REASONS.has(r)) };
}

function main() {
  console.log('\n[1] R08 after #3 — 기억이 든 질문 문장이 지워지는 축약은 거절해야 한다');
  const r08 = memoryResult(
    '그렇다면 니가 식물샵을 하고 싶다는 목표가 있었던 만큼, 날씨가 좋은 시점으로 조정해보는 건 어때? 11월 말이나 12월 초 같은 때는 어떤 생각이야?'
  );
  const v1 = reasonsFor(r08, ctx());
  check('입력 검증 사유가 TOO_MANY_QUESTIONS 하나(엔진이 tryRepair로 보내는 조건)', v1.reasons.length === 1 && v1.reasons[0] === 'TOO_MANY_QUESTIONS', v1.reasons.join(', '));
  const out1 = tryRepair({ result: r08, reasons: v1.reasons }, ctx());
  check(
    '수정 거절(null) — "기억 id는 있는데 기억 문장은 없는" 결과를 내지 않는다',
    out1 === null,
    out1 ? `repair 결과: "${out1.result.response}" / memory_unit_id_used=${out1.result.memory_unit_id_used}` : 'null'
  );

  console.log('\n[2] 기억 문장(평서문)은 남고 기억과 무관한 질문만 지워지면 기존처럼 수정한다');
  const keep = memoryResult('식물샵 하고 싶다며, 11월이면 날씨가 걸리긴 하네. 날씨 말고 다른 이유도 있어? 오픈 날짜는 정해둔 거야?', {
    conversation_opportunity: { ...memoryResult('').conversation_opportunity, question_target: '날씨 말고 다른 이유' },
  });
  const v2 = reasonsFor(keep, ctx());
  check('입력 검증 사유가 TOO_MANY_QUESTIONS 하나', v2.reasons.length === 1 && v2.reasons[0] === 'TOO_MANY_QUESTIONS', v2.reasons.join(', '));
  const out2 = tryRepair({ result: keep, reasons: v2.reasons }, ctx());
  check('수정 성공', out2 !== null, out2 ? `"${out2.result.response}"` : 'null');
  if (out2) {
    check('기억 문장이 남아 있다', out2.result.response.startsWith('식물샵 하고 싶다며'), out2.result.response);
    check('물음표 1개', (out2.result.response.match(/[?？]/g) ?? []).length === 1);
    check('memory_unit_id_used 유지(171)', out2.result.memory_unit_id_used === 171);
    const changed = Object.keys(keep).filter((k) => JSON.stringify((keep as any)[k]) !== JSON.stringify((out2.result as any)[k]));
    check('response 외 바뀐 필드 없음(question_present는 원래 true, 수정 후도 true)', changed.length === 1 && changed[0] === 'response', changed.join(', '));
  }

  console.log('\n[3] 문장부호만 바뀌는 축약(양자택일 합치기)은 지운 문장이 없으므로 기억이 있어도 수정한다');
  const merge = memoryResult('식물샵 하고 싶다며. 11월이야? 아니면 내년 봄이야?', {
    conversation_opportunity: { ...memoryResult('').conversation_opportunity, question_target: '여는 시점' },
  });
  const v3 = reasonsFor(merge, ctx());
  const out3 = tryRepair({ result: merge, reasons: v3.reasons }, ctx());
  check('입력 검증 사유가 TOO_MANY_QUESTIONS 하나', v3.reasons.length === 1 && v3.reasons[0] === 'TOO_MANY_QUESTIONS', v3.reasons.join(', '));
  check('수정 성공 + 단어 그대로("A야, 아니면 B야?")', out3 !== null && out3.result.response === '식물샵 하고 싶다며. 11월이야, 아니면 내년 봄이야?', out3 ? out3.result.response : 'null');
  check('memory_unit_id_used 유지(171)', out3?.result.memory_unit_id_used === 171);

  console.log('\n[4] 기억 원문을 받을 수 없으면(판단 불가) 문장을 지우는 수정은 보수적으로 거절한다');
  const v4 = reasonsFor(keep, ctx(false));
  const out4 = tryRepair({ result: keep, reasons: v4.reasons }, ctx(false));
  check('memoryTexts 없음 → 수정 거절(null)', out4 === null, out4 ? out4.result.response : 'null');

  console.log('\n[5] 기억을 쓰지 않은 응답은 기존 동작 그대로 수정한다');
  const noMem = memoryResult('식물샵을 11월에 열면 날씨가 걸리긴 하네. 날씨 말고 다른 이유도 있어? 오픈 날짜는 정해둔 거야?', {
    memory_used: false,
    memory_reference: null,
    memory_unit_id_used: null,
    response_strategy: 'CASUAL',
    conversation_opportunity: {
      source: 'current_turn',
      type: 'reactable_point',
      strength: 'STRONG',
      memory_unit_id: null,
      anchor_quote: '11월에 열면 날씨도 안 맞고',
      anchor_fact: '11월에 열면 날씨가 맞지 않을 것 같다',
      question_target: '날씨 말고 다른 이유',
    },
  });
  const v5 = reasonsFor(noMem, ctx(false));
  const out5 = tryRepair({ result: noMem, reasons: v5.reasons }, ctx(false));
  check('입력 검증 사유가 TOO_MANY_QUESTIONS 하나', v5.reasons.length === 1 && v5.reasons[0] === 'TOO_MANY_QUESTIONS', v5.reasons.join(', '));
  check(
    '수정 성공 — 첫 질문을 남김',
    out5 !== null && out5.result.response === '식물샵을 11월에 열면 날씨가 걸리긴 하네. 날씨 말고 다른 이유도 있어?',
    out5 ? out5.result.response : 'null'
  );

  const failed = results.filter((r) => !r.pass);
  console.log(`\n==== 합계: ${results.length - failed.length}/${results.length} PASS ====`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL: ${f.label}${f.detail ? ` — ${f.detail}` : ''}`));
    process.exitCode = 1;
  }
}

main();
