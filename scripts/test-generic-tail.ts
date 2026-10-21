// 2026-10-21 — RULE 30 GENERIC_TAIL 결정적 테스트. API·DB 호출 없음.
// 실행: npx tsx scripts/test-generic-tail.ts
// 사례 1은 운영 DB voice_entries 9f4b201a(2026-10-21 03:20 KST)의 실제 응답·원문·기억(#170) 그대로다.
import { tryRepair } from '../lib/response/responsefallback';
import { isGenericTail, validateResponse } from '../lib/response/responsevalidator';

type Check = { label: string; pass: boolean; detail?: string };
const results: Check[] = [];
function check(label: string, pass: boolean, detail?: string) {
  results.push({ label, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
}

// ---- 1~7: isGenericTail 단위 판정 ----
const T1 = '뭔가 열심히 살지 않고 있는 거 같다라는 생각이 들었어. 부끄러워. 내일부터는 다시, 그리고 더 많이 열심히 살 거야. 하고 싶은 거 다 이루고 살 거야.';
const R1 = '그런 생각이 드는 건 자연스러운 것 같아. 내일부터 다시 열심히 살겠다는 결심, 그게 중요한 걸. 지난번에 게으름이 걱정된다고 했던 것도 기억나. 그걸 잘 극복해보면 좋겠어!';

const unitCases: { label: string; transcript: string; response: string; expect: boolean }[] = [
  { label: '1 실제 10-21 응답 — 꼬리 "극복해보면 좋겠어" 잡힘', transcript: T1, response: R1, expect: true },
  {
    label: '2 한 문장짜리 칭찬은 이 규칙 대상 아님(기존 RULE 6/7 담당)',
    transcript: '인스타그램 내일부터 글 올리고 그래서 이용할 사람 모을 거야',
    response: '인스타그램에 글 올리는 거 좋은 생각이네!',
    expect: false,
  },
  { label: '3 사용자가 직접 쓴 바람을 되받기 → 통과', transcript: '제주도 가서 한달 살면 좋겠다', response: '제주도 한달살기 또 나왔네. 진짜 가면 좋겠다.', expect: false },
  { label: '4 물음표로 끝남 → 통과', transcript: T1, response: '내일부터라며. 근데 내일 뭐부터 할 건데?', expect: false },
  { label: '5 진지한 발화, 구체적 공감 + 질문 → 통과', transcript: '엄마가 입원했어', response: '입원했으면 정신없겠다. 오늘 병원 갔다 왔어?', expect: false },
  { label: '6 기억 문장으로 끝남 → 통과', transcript: T1, response: '부끄럽다니. 저번에도 게을러서야 쓰겠냐며.', expect: false },
  {
    label: '7 꼬리가 원문 디테일을 담음 → 구체적이라 통과',
    transcript: '내일부터 아침에 수영 다시 나가려고',
    response: '수영 또 시작이네. 내일부터 아침에 수영 다시 나가면 좋겠다.',
    expect: false,
  },
  {
    label: '8 (알려진 트레이드오프) 진지한 발화 뒤 바람 꼬리도 잡힘 → 꼬리만 걷힘',
    transcript: '엄마가 입원했어',
    response: '입원했으면 정신없겠다. 빨리 나으시면 좋겠어.',
    expect: true,
  },
];
console.log('\n[isGenericTail]');
for (const c of unitCases) {
  const got = isGenericTail(c.response, c.transcript);
  check(c.label, got === c.expect, `got=${got}`);
}

// ---- 9: 엔진 경로 — validate → tryRepair가 마지막 문장만 걷고 기억 표시를 유지하는가 ----
console.log('\n[validate + tryRepair — 실제 10-21 사례]');
const MEMORY_TEXT_170 = '조금 더 진취적으로 살아야 한다 살아야 한다 하는데 이렇게 게을러서야 쓰겠네 / 조금 더 진취적으로 살아야 한다는 생각이 있지만 게으름이 걱정된다.';
const ctx: any = {
  validMemoryUnitIds: new Set([211, 170, 202, 171, 54]),
  previousResponse: null,
  transcript: T1,
  utteranceIntent: 'statement',
  memoryTexts: { 170: MEMORY_TEXT_170 },
};
const result: any = {
  response: R1,
  response_strategy: 'EMPATHY',
  interference_purpose: 'validate',
  memory_unit_id_used: 170,
  memory_used: true,
  memory_reference: '재빈이 게으름이 걱정된다고 했던 게 기억나.',
  insight_id_used: null,
  memory_relevance: [
    { memory_unit_id: 170, relevance: 'YES', relation: 'continuation' },
    { memory_unit_id: 171, relevance: 'NO', relation: 'no_relation' },
  ],
  conversation_opportunity: {
    type: 'past_present_link',
    source: 'memory',
    strength: 'STRONG',
    memory_unit_id: 170,
    anchor_quote: null,
    anchor_fact: null,
    question_target: '내일부터 다시 열심히 살겠다는 결심',
  },
  question_present: false,
  channel: 'text',
  tone: 'casual',
  humor_opportunity: 'low',
  relationship_level: 5,
  utterance_intent: 'statement',
  answered_user_question: true,
};
const v = validateResponse(result, ctx);
check('validator가 GENERIC_TAIL을 낸다', v.reasons.includes('GENERIC_TAIL'), v.reasons.join(', '));
const hard = v.reasons; // 이 사례는 SOFT 사유 없이 GENERIC_TAIL만 나와야 repair 대상이 된다
const repaired = tryRepair({ result, reasons: hard }, ctx);
check('tryRepair 성공', repaired !== null, repaired ? repaired.result.response : `reasons=${hard.join(', ')}`);
if (repaired) {
  check('마지막 문장만 사라짐', !repaired.result.response.includes('극복해보면') && repaired.result.response.includes('기억나'));
  check('기억 표시 유지(memory_unit_id_used=170)', repaired.result.memory_unit_id_used === 170);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) process.exit(1);
