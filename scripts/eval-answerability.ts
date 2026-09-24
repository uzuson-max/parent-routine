
//
// STEP 5-1 — Answerability 평가 실행 스크립트 (DB/LLM 호출 없음, 앱 동작에 영향 없음)
// 실행: npx tsx scripts/eval-answerability.ts
//
// 1) 새 detector(isQuestionNotAnswerable)가 평가 세트의 answerability 라벨을 얼마나 맞히는지
// 2) 같은 세트를 기존 validateResponse()에 넣었을 때 무엇을 잡고 무엇을 놓치는지
// 를 나란히 출력한다. validateResponse()는 수정하지 않았고, detector는 아직 연결되지 않았다.

import { ANSWERABILITY_CASES, type AnswerabilityCase } from './eval/answerabilityCases';
import { detectUnanswerableQuestion } from '../lib/response/responsevalidator';
import { validateResponse } from '../lib/response/responsevalidator';

function runExistingValidator(c: AnswerabilityCase) {
  const hasQ = /[?？]/.test(c.response);
  const linked = c.validator_input?.memory_linked === true;
  const strategy = c.validator_input?.strategy ?? (hasQ ? 'QUESTION' : 'CASUAL');
  return validateResponse(
    {
      response: c.response,
      response_strategy: strategy as any,
      question_present: hasQ,
      memory_unit_id_used: linked ? 1 : null,
      memory_relevance: linked ? [{ memory_unit_id: 1, relevance: 'YES' }] : [],
      conversation_opportunity: linked
        ? { source: 'memory', type: 'past_present_link', strength: 'STRONG', memory_unit_id: 1, anchor_quote: null, anchor_fact: null, question_target: null }
        : { source: 'current_turn', type: 'reactable_point', strength: 'STRONG', memory_unit_id: null, anchor_quote: null, anchor_fact: null, question_target: null },
    },
    { validMemoryUnitIds: new Set(linked ? [1] : []), previousResponse: null }
  );
}

const rows = ANSWERABILITY_CASES.map((c) => {
  const detection = detectUnanswerableQuestion(c.response);
  const existing = runExistingValidator(c);
  return { c, detection, existing };
});

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));

console.log('━━━━━━━━ 사례별 결과 ━━━━━━━━');
console.log('id   | 사람 라벨(answerability/expected) | 새 detector | 기존 validator | 응답');
for (const { c, detection, existing } of rows) {
  const label = `${c.answerability}${c.obviousness ? '(' + c.obviousness + ')' : ''}/${c.expected}`;
  const det = detection ? `탐지:${detection.pattern}` : '-';
  const old = existing.passed ? 'PASS' : 'FAIL:' + existing.reasons.join('+');
  console.log(`${c.id}  | ${pad(label, 30)} | ${pad(det, 26)} | ${pad(old, 34)} | ${c.response}`);
}

// ---- 새 detector 지표 (정답 = answerability === NOT_ANSWERABLE) ----
const positives = rows.filter((r) => r.c.answerability === 'NOT_ANSWERABLE');
const obvious = positives.filter((r) => r.c.obviousness === 'OBVIOUS');
const subtle = positives.filter((r) => r.c.obviousness === 'SUBTLE');
const negatives = rows.filter((r) => r.c.answerability !== 'NOT_ANSWERABLE');
const fp = negatives.filter((r) => r.detection);
const fnObvious = obvious.filter((r) => !r.detection);
const fnSubtle = subtle.filter((r) => !r.detection);
const realLogs = rows.filter((r) => r.c.category === 'E_REAL_LOG');

console.log('\n━━━━━━━━ 새 detector (isQuestionNotAnswerable) ━━━━━━━━');
console.log(`명백한(OBVIOUS) 답변불가 탐지: ${obvious.length - fnObvious.length} / ${obvious.length}`);
console.log(`애매한(SUBTLE) 답변불가 탐지:  ${subtle.length - fnSubtle.length} / ${subtle.length}  (놓쳐도 되는 범주)`);
console.log(`답변 가능·질문 없음 사례 오탐(FP): ${fp.length} / ${negatives.length}`);
console.log(`실제 로그 탐지: ${realLogs.filter((r) => r.detection).length} / ${realLogs.length}`);
console.log('\n[False positive 목록]' + (fp.length ? '' : ' 없음'));
for (const r of fp) console.log(`  ${r.c.id} ${r.detection!.pattern} | ${r.c.response}`);
console.log('[False negative — OBVIOUS]' + (fnObvious.length ? '' : ' 없음'));
for (const r of fnObvious) console.log(`  ${r.c.id} | ${r.c.response}`);
console.log('[False negative — SUBTLE (허용 범주)]' + (fnSubtle.length ? '' : ' 없음'));
for (const r of fnSubtle) console.log(`  ${r.c.id} | ${r.c.response}  ← ${r.c.reason}`);

// ---- 기존 validator vs 새 detector ----
console.log('\n━━━━━━━━ 기존 validator vs 새 answerability detector ━━━━━━━━');
const byCat: Record<string, typeof rows> = {};
for (const r of rows) byCat[r.c.category] = (byCat[r.c.category] ?? []).concat([r]);
console.log('카테고리               | 사례 | 사람 판정 FAIL | 기존 validator FAIL | 새 detector 탐지');
for (const cat of Object.keys(byCat)) {
  const rs = byCat[cat];
  console.log(
    `${pad(cat, 22)} | ${pad(String(rs.length), 4)} | ${pad(String(rs.filter((r) => r.c.expected === 'FAIL').length), 14)} | ${pad(String(rs.filter((r) => !r.existing.passed).length), 19)} | ${rs.filter((r) => r.detection).length}`
  );
}
const humanFail = rows.filter((r) => r.c.expected === 'FAIL');
const humanPass = rows.filter((r) => r.c.expected === 'PASS');
console.log(`\n사람이 FAIL로 본 ${humanFail.length}건 중 — 기존 validator가 잡은 것: ${humanFail.filter((r) => !r.existing.passed).length}, 새 detector가 잡은 것: ${humanFail.filter((r) => r.detection).length}, 둘 중 하나라도: ${humanFail.filter((r) => !r.existing.passed || r.detection).length}`);
console.log(`사람이 PASS로 본 ${humanPass.length}건 중 — 기존 validator가 떨어뜨린 것: ${humanPass.filter((r) => !r.existing.passed).length}, 새 detector가 떨어뜨린 것: ${humanPass.filter((r) => r.detection).length}`);
console.log('\n[기존 validator가 PASS 사례를 떨어뜨린 것]');
for (const r of humanPass.filter((r) => !r.existing.passed)) console.log(`  ${r.c.id} ${r.existing.reasons.join('+')} | ${r.c.response}`);
console.log('[어느 쪽도 못 잡는 FAIL — failure_type별]');
for (const r of humanFail.filter((r) => r.existing.passed && !r.detection)) console.log(`  ${r.c.id} [${r.c.failure_types.join(', ')}] | ${r.c.response}`);
