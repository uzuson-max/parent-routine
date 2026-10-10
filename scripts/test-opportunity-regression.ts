//
// conversation_opportunity 선택 실패 회귀 테스트 (2026-10-11)
// DB 읽기/쓰기 없음. 실제 운영 기록(voice_entries 2026-10-08~11)의 발화·검색 후보·응답을 그대로 고정 데이터로 쓴다.
//
// 실행 (PowerShell, 프로젝트 폴더에서):
//   npx.cmd tsx scripts/test-opportunity-regression.ts        → [A] 결정적 검사 + [B] 엔진 흐름(가짜 GPT). API 키 불필요.
//   npx.cmd tsx scripts/test-opportunity-regression.ts live 3 → [A][B] + [C] 실제 GPT로 6개 사례 3회씩 (.env.local의 OPENAI_API_KEY 사용)
//
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { validateResponse as validateTyped, isFeelingTarget } from '../lib/response/responsevalidator';
// 고정 데이터는 운영 jsonb를 그대로 옮긴 것이라 문자열 리터럴 타입이 넓다 — 검사 함수에는 any로 넘긴다.
const validateResponse = (r: any, c: any) => validateTyped(r, c);
import { tryRepair } from '../lib/response/responsefallback';
import { normalizeUnderstanding, findDirectOpinionRequest } from '../lib/response/understanding';
import { looksLikeNoSpeech } from '../lib/noSpeech';
import type { RelevantMemoryUnit } from '../lib/memoryRetrieval';

function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

type Check = { group: string; label: string; pass: boolean; detail?: string };
const results: Check[] = [];
let group = '';
function check(label: string, pass: boolean, detail?: string) {
  results.push({ group, label, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------------------------
// 고정 데이터 — 실제 기억 (memory_units). created_at은 원래 값 그대로.
// ---------------------------------------------------------------------------------------------
function mem(id: number, memory_type: string, content: string, created_at: string, raw_quote: string | null = null, extra: Partial<RelevantMemoryUnit> = {}): RelevantMemoryUnit {
  return { id, memory_type, subject: null, content, emotion: null, temporal_context: null, importance: 0.7, status: 'open', created_at, last_referenced_at: null, relevanceScore: 5, relevanceReason: 'fixture', raw_quote, ...extra };
}
const M: Record<number, RelevantMemoryUnit> = {
  12: mem(12, 'event', '10월 6일에 진행하는 베리어프리 행사 실측하러 다녀왔다.', '2026-09-14T12:03:32Z', null, { temporal_context: '오늘' }),
  60: mem(60, 'interest', '식물을 계속 키울 것이라는 생각이 있다.', '2026-09-23T11:47:45Z'),
  69: mem(69, 'interest', '식물에 대해 이야기할 사람이 없어 혼자 얘기하고 있다.', '2026-09-24T07:15:06Z'),
  79: mem(79, 'feeling', '시간이 하염없이 가는 것에 대한 답답함을 느끼고 있다.', '2026-09-24T17:21:56Z', null, { emotion: '답답함' }),
  87: mem(87, 'interest', '작은 공간에서 식물샵을 하고 싶다.', '2026-09-24T17:23:56Z'),
  88: mem(88, 'relationship', '이번 주 토요일에 고양이 털이 많이 날 것 같아 방 청소해야 할 것 같다.', '2026-09-24T19:07:52Z'),
  89: mem(89, 'relationship', '이번 주 토요일에 고양이 털이 많이 날려서 방 청소를 해야 할 것 같다.', '2026-09-25T04:35:20Z'),
  99: mem(99, 'place', '스튜디오에서 기본 호흡이 만들어져야 한다고 생각하고 있었다.', '2026-09-28T03:33:07Z', '그 돈은 결국 내가 렌탈비가 아닌지 임대료, 월세를 내고 있는 스튜디오에서 기본 호흡이 만들어져야 한다가 결론이고.'),
  105: mem(105, 'event', '스튜디오에서 11월 말에 대학 수업이 끝나고, 목표치를 이루고 난 다음에 식물 쪽도 더 가져보려 한다.', '2026-09-28T03:36:27Z', '스튜디오 11월 말이면 또 대학 수업 사실 끝날 2년인데 어찌됐건 성립 단계점은 넘었다고는 하지만 만족스럽지는 못한 결과치인 것 같거든'),
  107: mem(107, 'event', '스튜디오 환경이 좋지 않아 식물을 키우는 것이 어려워서 짜증이 났다.', '2026-09-28T03:36:36Z', '환경이 바람도 잘 안통하고 거기가 채광도 안좋고 하니까 식물을 갖다 놓으면 아무리 열심히 키워도 죽고 그러더라구요'),
  109: mem(109, 'commitment', '10월 중순에 모두의 창업에 대한 답이 나올 것 같고, 그 전까지 창견에 대한 인풋 시간을 조절할 계획이다.', '2026-09-28T03:39:46Z'),
  110: mem(110, 'interest', '고양이 관련 콘텐츠 계정을 키우고 싶어한다.', '2026-09-28T03:39:47Z', '우리 고양이, 예쁜 고양이 콘텐츠 하는 계정 3개를 무조건 키워야 돼.'),
  126: mem(126, 'event', '참견이 사운드 에펙스를 더 넣는 작업을 하고 있다.', '2026-10-04T13:05:46Z', '오늘은 참견이 사운드 에펙스 좀 더 넣는 작업을 하고 있어', { temporal_context: '오늘' }),
  131: mem(131, 'event', '식물샵을 할 때 Roots가 가장 중요하다고 생각한다고 했다.', '2026-10-04T15:28:02Z'),
  136: mem(136, 'event', '식물을 키우기 시작했을 때 뿌리에 대해 많은 생각을 하지 않았지만, 뿌리가 건강하다면 풍부한 식물이 되어야 한다고 느꼈다.', '2026-10-04T15:39:32Z'),
  140: mem(140, 'event', '이제 잘 시간이 되어가고 있다.', '2026-10-04T17:36:49Z'),
};

interface Case {
  key: string;
  title: string;
  transcript: string;
  intent: string; // 운영에서 실제로 분류된 utterance_intent
  candidates: number[]; // 운영 retrieval_trace 후보 (순위순)
  production: any; // 운영에서 실제로 나간 응답(필요한 필드만)
  expect: string; // 기대 행동
}

const CASES: Case[] = [
  {
    key: 'studio_2y',
    title: '① 스튜디오 계약 2년 / 활성화 1순위',
    transcript: '어찌됐건 다시 말하지만 스튜디오 활성화가 제일 먼저 우선이고 지금 10월 11일이야 2년이 끝났.. 와 2년이 벌써 다 지났어 스튜디오 렌탈한지가.. 렌탈이 아니지 공간을 계약한지가 벌써 거의 2년이 됐다는 거야 진짜 시간이 너무 말도 안되게 빠르다 와 진짜 심각할 정도로 빨라',
    intent: 'statement',
    candidates: [99, 105, 109, 79, 140],
    production: {
      response: '2년이 정말 빠르게 지나갔구나. 그런 시간의 흐름에 대해 어떻게 느끼고 있어?',
      response_strategy: 'CASUAL', question_present: true, memory_unit_id_used: null, memory_relevance: [], answered_user_question: false,
      conversation_opportunity: { source: 'current_turn', type: 'reactable_point', strength: 'STRONG', memory_unit_id: null, anchor_quote: '벌써 2년이 됐다는 거야 진짜 시간이 너무 말도 안되게 빠르다', anchor_fact: '스튜디오를 계약한 지 2년이 지났다', question_target: '시간이 이렇게 빠르게 지나간 것에 대한 생각' },
    },
    expect: '후보 105("11월 말이면 2년인데 만족스럽지 못한 결과치")·99를 판정하고, 관련 있으면 그 말과 오늘의 "활성화 1순위"를 연결',
  },
  {
    key: 'cat_out',
    title: '② 고양이와 처음 외출 (관련 없어 보이는 고양이 계정 기억)',
    transcript: '자 한번 다시 확인해보자. 오늘은 우리 인호 고양이랑 같이 쓰레기 버리러 갈 때 같이 갔다 왔어. 근데 쓰레기 버리러 갈 때가 아니라 쓰레기를 버리고 플라스틱백이 아래에 있었어가지고 그걸 가지러 갔다 왔다. 근데 처음으로 나가봐서 그런지 얘가 엄청 쫄아 있더라고. 어깨에 매달리고 올라가려고 하고 완전 나를 움켜잡고 있더라고. 그래서 좀 귀엽긴 했어.',
    intent: 'statement',
    candidates: [110, 88, 89, 12],
    production: {
      response: '고양이가 처음 나가서 쫄아있었다니 귀엽네! 그런 상황에서 니가 어떤 기분이었는지도 궁금해. 고양이랑 밖에 나가면 어떤 느낌이야?',
      response_strategy: 'CASUAL', question_present: false, memory_unit_id_used: null, memory_relevance: [], answered_user_question: false,
      conversation_opportunity: { source: 'current_turn', type: 'reactable_point', strength: 'STRONG', memory_unit_id: null, anchor_quote: '얘가 엄청 쫄아 있더라고.', anchor_fact: '고양이가 처음 나가서 많이 긴장했다.', question_target: '고양이랑 밖에 나가면 어떤 기분인지' },
    },
    expect: '후보를 판정하되 고양이 계정 기억을 억지로 쓰지 않음. 기분 대신 인호의 구체적 행동(어깨에 매달림 등)을 붙잡음',
  },
  {
    key: 'plant_shop',
    title: '③ 게을렀다 / 돈 모아야 돼 식물샵 하고 싶거든',
    transcript: '뭔가 아무런 문구가 없으니까 가이드라고 해야되나? 조금 필요하긴 하겠는데 일단 오늘은 뭔가를 많이 하진 않았네 그냥 하루가 흘러갔어 식물도 좀 돌보고 내일은 스튜디오 나가서 금붕어들 밥도 줘야 되고 조금 더 진취적으로 살아야 한다 살아야 한다 하는데 이렇게 게을러서야 쓰겠네 미쳐버려 근데 참견이에 너무 힘을 좀 많이 쏟는 건가 싶기도 하고 돈을 모아야 돼 식물샵 하고 싶거든',
    intent: 'statement',
    candidates: [107, 136, 87, 60, 69],
    production: {
      response: '오늘 하루가 그렇게 흘러갔구나. 식물도 돌보고 내일 금붕어들 밥 주러 가는 거, 그거 다 해내고 싶다는 마음이 느껴져. 게으름이 아니라 그냥 잠시 멈춘 거 아닐까? 내일은 어떤 계획이 있는지 궁금하네.',
      response_strategy: 'CASUAL', question_present: false, memory_unit_id_used: null, answered_user_question: false,
      memory_relevance: [
        { memory_unit_id: 107, relevance: 'YES', relation: 'same_problem' },
        { memory_unit_id: 136, relevance: 'NO', relation: 'no_relation' },
        { memory_unit_id: 87, relevance: 'YES', relation: 'same_topic_only' },
        { memory_unit_id: 60, relevance: 'YES', relation: 'same_topic_only' },
        { memory_unit_id: 69, relevance: 'NO', relation: 'no_relation' },
      ],
      conversation_opportunity: { source: 'memory', type: 'reactable_point', strength: 'STRONG', memory_unit_id: 107, anchor_quote: '오늘은 뭔가를 많이 하진 않았네 그냥 하루가 흘러갔어', anchor_fact: '오늘은 별로 한 일이 없다고 느끼고 있다', question_target: '내일은 어떤 계획이 있는지' },
    },
    expect: '스스로 고른 기억을 버리고 위로로 빠지지 않음 — 고른 기억을 쓰거나, 안 쓰면 current_turn으로 정직하게',
  },
  {
    key: 'paid_off',
    title: '④ 일 끝나고 입금 / 이제 식물샵+참견이+스튜디오',
    transcript: '오늘도 참견이 없기도 하고 있고 아주 좋은 점은 지금 성범죄 법구청 관리해서 일하고 있던 거 끝났어 드디어 사실 뭔가 진행하는 거나 임하는 게 사실 별로였거든 아 그래가지고 빨리 끝났으면 좋겠다 싶었는데 이거로써 마무리 된 거 같고 방금도 바로 입금이 된 거 같아 그래서 이제 할 거는 식물샵 플러스 참견이 플러스 스튜디오 활성화 오케이 이거',
    intent: 'statement',
    candidates: [126, 131, 105, 99, 87],
    production: {
      response: '그럼 지금 작업이 어떻게 진행되고 있는지 궁금하네. 사운드 에펙스 작업은 어떻게 되고 있어?',
      response_strategy: 'CASUAL', question_present: true, memory_unit_id_used: 126, answered_user_question: true,
      memory_relevance: [
        { memory_unit_id: 126, relevance: 'YES', relation: 'same_problem' },
        { memory_unit_id: 131, relevance: 'NO', relation: 'no_relation' },
      ],
      // 운영에서는 첫 생성의 anchor가 원문에 없어(ANCHOR_NOT_IN_TRANSCRIPT) 코드 수정으로 anchor만 지운 채 그대로 나갔다.
      conversation_opportunity: { source: 'memory', type: 'past_present_link', strength: 'STRONG', memory_unit_id: 126, anchor_quote: '참견이 사운드 작업을 하고 있었어', anchor_fact: null, question_target: '지금 작업이 어떻게 진행되고 있는지' },
    },
    expect: '원문에 근거(anchor) 없는 기억 소환은 코드 수정으로 내보내지 않고 재생성',
  },
  {
    key: 'otter',
    title: '⑤ 수달로 메인 캐릭터 바꿀까? 어떻게 생각해?',
    transcript: '한 번 녹음이 얼마나 더 빨리 되는지 한번 확인해보고 싶어서 지금 일단 녹음해보고 있고 이게 수달이 돌아다니는 게 너무 귀엽다 참견아 너 그냥 수달로 메인 캐릭터를 바꿀까? 어떻게 생각해?',
    intent: 'statement',
    candidates: [],
    production: {
      response: '수달이 돌아다니는 게 귀엽다고 하니, 수달로 메인 캐릭터 바꾸는 건 정말 좋은 생각인 것 같아! 왜 수달로 바꾸고 싶어?',
      response_strategy: 'CASUAL', question_present: true, memory_unit_id_used: null, memory_relevance: [], answered_user_question: false,
      conversation_opportunity: { source: 'current_turn', type: 'reactable_point', strength: 'STRONG', memory_unit_id: null, anchor_quote: '수달이 돌아다니는 게 너무 귀엽다', anchor_fact: '수달이 귀엽다고 느끼고 있다', question_target: '수달을 메인 캐릭터로 바꾸는 이유' },
    },
    expect: 'opinion_request로 보정 → 의견 없이 되묻기만 한 응답은 QUESTION_NOT_ANSWERED',
  },
];

const CTX = (c: Case, intent = c.intent, userQuestion: string | null = null) => ({
  validMemoryUnitIds: new Set<number>(c.candidates),
  previousResponse: null,
  transcript: c.transcript,
  utteranceIntent: intent,
  userQuestion,
  negativeTargets: [] as string[],
});
const byKey = (k: string) => CASES.find((c) => c.key === k)!;

// =============================================================================================
// [A] 결정적 검사 — 운영에서 실제로 나간 응답을 새 규칙으로 다시 판정
// =============================================================================================
function partA() {
  group = 'A';
  console.log('\n[A] 실패 사례 재판정 (운영 출력 그대로)');

  let c = byKey('studio_2y');
  let v = validateResponse(c.production, CTX(c));
  check(`${c.title} → MEMORY_RELEVANCE_SKIPPED`, v.reasons.includes('MEMORY_RELEVANCE_SKIPPED'), v.reasons.join(', '));

  c = byKey('cat_out');
  v = validateResponse(c.production, CTX(c));
  check(`${c.title} → MEMORY_RELEVANCE_SKIPPED (판정만 요구, 사용은 강제 안 함)`, v.reasons.includes('MEMORY_RELEVANCE_SKIPPED'), v.reasons.join(', '));
  // 같은 응답인데 기억을 전부 NO/same_topic_only로 판정했다면 → 새 규칙 어느 것도 걸리지 않아야 한다(관련 있다고 가정하지 않음).
  const catJudged = { ...c.production, memory_relevance: [
    { memory_unit_id: 110, relevance: 'YES', relation: 'same_topic_only' },
    { memory_unit_id: 88, relevance: 'NO', relation: 'no_relation' },
    { memory_unit_id: 89, relevance: 'NO', relation: 'no_relation' },
    { memory_unit_id: 12, relevance: 'NO', relation: 'no_relation' },
  ] };
  v = validateResponse(catJudged, CTX(c));
  check('② 고양이 계정 기억을 same_topic_only로 판정하면 감정 질문이어도 새 규칙 미발동', !v.reasons.some((r) => ['MEMORY_RELEVANCE_SKIPPED', 'SELECTED_MEMORY_NOT_USED', 'FEELING_TARGET_OVER_MEMORY'].includes(r)), v.reasons.join(', ') || '통과');

  c = byKey('plant_shop');
  v = validateResponse(c.production, CTX(c));
  check(`${c.title} → SELECTED_MEMORY_NOT_USED`, v.reasons.includes('SELECTED_MEMORY_NOT_USED'), v.reasons.join(', '));

  c = byKey('paid_off');
  const paidFirst = { ...c.production };
  v = validateResponse(paidFirst, CTX(c));
  const repaired = tryRepair({ result: { ...paidFirst, interference_purpose: 'listen', tone: 'neutral', humor_opportunity: 'low', memory_used: true, memory_reference: null, insight_id_used: null, channel: 'text', relationship_level: 5 } as any, reasons: v.reasons }, CTX(c));
  check(`${c.title} → anchor가 원문에 없음`, v.reasons.includes('ANCHOR_NOT_IN_TRANSCRIPT'), v.reasons.join(', '));
  check('④ 기억 기반 opportunity의 원문 밖 anchor는 코드 수정 안 함(재생성으로)', repaired === null, repaired ? '수정돼서 그대로 나감' : '수정 거부 → 재생성');

  c = byKey('otter');
  const u = normalizeUnderstanding({ utterance_intent: 'statement', user_question: null, stances: [] }, c.transcript);
  check(`${c.title} → intent 보정`, u.utterance_intent === 'opinion_request', `${u.utterance_intent} / user_question="${u.user_question}"`);
  v = validateResponse(c.production, CTX(c, u.utterance_intent, u.user_question));
  check('⑤ 의견 없이 되물은 운영 응답 → QUESTION_NOT_ANSWERED', v.reasons.includes('QUESTION_NOT_ANSWERED'), v.reasons.join(', '));

  check('⑥ "이 영상은 유료광고를 포함하고 있습니다." → 무음 환각(확인 요청 화면)', looksLikeNoSpeech('이 영상은 유료광고를 포함하고 있습니다.', undefined));

  // ---- 반례: 새 규칙이 정상 응답을 망가뜨리지 않는가 ----
  group = 'A-반례';
  console.log('\n[A-반례] 정상 응답은 그대로 통과해야 한다');

  c = byKey('studio_2y');
  const goodMemory = {
    response: '저번에 11월 말이면 2년인데 결과가 만족스럽진 않다고 했잖아. 활성화 1순위면 뭐부터 손댈 건데?',
    response_strategy: 'MEMORY_REFERENCE', question_present: true, memory_unit_id_used: 105, answered_user_question: false,
    memory_relevance: [
      { memory_unit_id: 99, relevance: 'YES', relation: 'continuation' },
      { memory_unit_id: 105, relevance: 'YES', relation: 'same_problem' },
      { memory_unit_id: 109, relevance: 'NO', relation: 'no_relation' },
      { memory_unit_id: 79, relevance: 'YES', relation: 'same_topic_only' },
      { memory_unit_id: 140, relevance: 'NO', relation: 'no_relation' },
    ],
    conversation_opportunity: { source: 'memory', type: 'past_present_link', strength: 'STRONG', memory_unit_id: 105, anchor_quote: '스튜디오 활성화가 제일 먼저 우선이고', anchor_fact: '스튜디오 활성화를 최우선으로 두고 있다', question_target: '활성화를 위해 먼저 할 일' },
  };
  v = validateResponse(goodMemory, CTX(c));
  check('① 기억을 제대로 쓴 응답 → 통과', v.passed, v.reasons.join(', ') || '통과');

  const goodCurrent = {
    ...byKey('cat_out').production,
    response: '어깨까지 기어 올라갔으면 인호 입장에선 거의 탈출 작전이었네. 플라스틱백 가지러 간 그 짧은 거리가 처음이었던 거야?',
    question_present: true,
    memory_relevance: catJudged.memory_relevance,
    conversation_opportunity: { source: 'current_turn', type: 'reactable_point', strength: 'STRONG', memory_unit_id: null, anchor_quote: '어깨에 매달리고 올라가려고 하고', anchor_fact: '고양이가 어깨에 매달려 올라가려 했다', question_target: '인호가 밖에 나간 게 처음인지' },
  };
  v = validateResponse(goodCurrent, CTX(byKey('cat_out')));
  check('② 기억 판정 후 오늘 디테일에 반응한 응답 → 통과', v.passed, v.reasons.join(', ') || '통과');

  // 후보가 없으면 memory_relevance=[]는 정상
  const noCand = { ...byKey('cat_out').production, ...goodCurrent, memory_relevance: [] };
  v = validateResponse(noCand, { ...CTX(byKey('cat_out')), validMemoryUnitIds: new Set<number>() });
  check('후보 0개 + memory_relevance=[] → SKIPPED 미발동', !v.reasons.includes('MEMORY_RELEVANCE_SKIPPED'), v.reasons.join(', ') || '통과');

  // worthy 기억이 있어도 사용자가 질문한 턴이면 감정 target 규칙은 보지 않는다(답이 먼저)
  const qTurn = { ...goodCurrent, answered_user_question: true, conversation_opportunity: { ...goodCurrent.conversation_opportunity, question_target: '그 말 듣고 든 생각' }, memory_relevance: [{ memory_unit_id: 110, relevance: 'YES', relation: 'same_problem' }] };
  v = validateResponse(qTurn, CTX(byKey('cat_out'), 'opinion_request', '어떻게 생각해'));
  check('질문 턴 + worthy 기억 + 감정 target → FEELING 규칙 미발동', !v.reasons.includes('FEELING_TARGET_OVER_MEMORY'), v.reasons.join(', ') || '통과');

  // worthy 기억이 있는데 감정을 물은 경우 → 발동 (규칙이 실제로 작동하는지)
  const feel = { ...goodCurrent, conversation_opportunity: { ...goodCurrent.conversation_opportunity, question_target: '그때 어떤 기분이었는지' }, memory_relevance: [{ memory_unit_id: 110, relevance: 'YES', relation: 'same_problem' }] };
  v = validateResponse(feel, CTX(byKey('cat_out')));
  check('statement + worthy 기억 + 감정 target → FEELING_TARGET_OVER_MEMORY', v.reasons.includes('FEELING_TARGET_OVER_MEMORY'), v.reasons.join(', '));

  check('isFeelingTarget: "어깨에 매달린 이유" → false', !isFeelingTarget('어깨에 매달린 이유'));
  check('isFeelingTarget: "시간이 빠르게 지나간 것에 대한 생각" → true', isFeelingTarget('시간이 빠르게 지나간 것에 대한 생각'));

  // 의견 요청 보정 반례
  const reported = '참견아 내가 이거 오늘 로제 떡볶이랑 얍떡 시키고 싶은데 시킬까 말까 고민된다 이렇게 말을 했어 그러면 이제 참견이 네가 참견을 해줘야지';
  check('남의 말/예시 옮기기("시킬까 말까 고민된다 이렇게 말을 했어") → 의견 요청 아님', findDirectOpinionRequest(reported) === null, String(findDirectOpinionRequest(reported)));
  const reported2 = '친구가 나한테 이거 어떻게 생각해 이렇게 물어보더라';
  check('"어떻게 생각해 이렇게 물어보더라" → 의견 요청 아님', findDirectOpinionRequest(reported2) === null, String(findDirectOpinionRequest(reported2)));
  check('"오늘 회사 진짜 개답답하다." → 의견 요청 아님', findDirectOpinionRequest('오늘 회사 진짜 개답답하다.') === null);
  const t2 = '유명하다고 해서 점 한번 보러 가고 싶은데 20만 원이나 한대. 너무 비싼 것 같아. 요즘은 GPT로도 많이 본다더라. 너라면 어떻게 생각해?';
  check('"너라면 어떻게 생각해?" → 의견 요청', findDirectOpinionRequest(t2) !== null, String(findDirectOpinionRequest(t2)));
  const keepQ = normalizeUnderstanding({ utterance_intent: 'question', user_question: '어디 가야 되냐', stances: [] }, '제주도는 싫고 어디 가야 되냐 어떻게 생각해');
  check('이미 question으로 분류된 건 그대로 둔다', keepQ.utterance_intent === 'question' && keepQ.user_question === '어디 가야 되냐');

  // 무음 환각 반례 — 진짜 말은 통과
  check('"유튜브 영상에 유료광고 포함이라고 떠서 좀 별로였어" → 진짜 말(환각 아님)', !looksLikeNoSpeech('유튜브 영상에 유료광고 포함이라고 떠서 좀 별로였어', undefined));
  check('"이 영상은 유료광고를 포함하고 있습니다 라고 떴는데 광고 너무 많아서 짜증났어" → 진짜 말', !looksLikeNoSpeech('이 영상은 유료광고를 포함하고 있습니다 라고 떴는데 광고가 너무 많아서 끝까지 보다가 짜증나서 껐어', undefined));
}

// =============================================================================================
// [B] 엔진 흐름 — GPT 응답을 가짜로 주입해서 SOFT 사유 처리 경로를 확인 (fetch 대체, 네트워크 없음)
// =============================================================================================
async function partB() {
  group = 'B';
  console.log('\n[B] 엔진 흐름 (가짜 GPT 응답 주입)');
  const { generateResponseCore } = await import('../lib/responseEngine');
  const realFetch = globalThis.fetch;
  const c = byKey('studio_2y');
  const base = { transcript: c.transcript, analysis: { utterance_intent: 'statement', user_question: null, stances: [] }, memoryCandidates: [], existingCommitments: [], relevantMemoryUnits: c.candidates.map((id) => M[id]), relevantInsights: [], relationshipLevel: 5, nickname: null, callAllowed: false, recentTurns: [] };
  const good = { ...{ answered_user_question: false, interference_purpose: 'notice', tone: 'casual', humor_opportunity: 'low', memory_used: true, memory_reference: '11월 말이면 2년', insight_id_used: null, channel: 'text' }, ...JSONclone(goodMemoryFor(c)) };
  const skipped = { answered_user_question: false, interference_purpose: 'listen', tone: 'neutral', humor_opportunity: 'low', memory_used: false, memory_reference: null, insight_id_used: null, channel: 'text', ...JSONclone(c.production) };

  async function run(label: string, outputs: any[], expectFn: (r: any, calls: number) => [boolean, string]) {
    let calls = 0;
    (globalThis as any).fetch = async () => {
      const out = outputs[Math.min(calls, outputs.length - 1)];
      calls++;
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(out) } }] }), text: async () => '' } as any;
    };
    const r = await generateResponseCore(base as any);
    const [pass, detail] = expectFn(r, calls);
    check(label, pass, detail);
  }

  await run('1차 SKIPPED → 재생성에서 기억 연결 → 재생성 결과 사용', [skipped, good], (r, calls) => [
    calls === 2 && r.memory_unit_id_used === 105 && !r.fallback_used,
    `GPT ${calls}회, used=${r.memory_unit_id_used}, "${r.response}"`,
  ]);
  await run('1차 SKIPPED → 재생성도 SKIPPED → fallback 템플릿 아님(재생성 문장 사용)', [skipped, skipped], (r, calls) => [
    calls === 2 && !r.fallback_used && r.response === skipped.response,
    `GPT ${calls}회, fallback=${r.fallback_used}, reason=${r.validation_failure_reason}`,
  ]);
  await run('1차 SKIPPED → 재생성이 빈 응답(HARD) → 1차 결과 사용', [skipped, { ...skipped, response: '' }], (r, calls) => [
    calls === 2 && !r.fallback_used && r.response === skipped.response,
    `GPT ${calls}회, fallback=${r.fallback_used}, "${r.response}"`,
  ]);
  await run('기존 동작 유지: 처음부터 통과하면 재생성 없음', [good], (r, calls) => [calls === 1 && r.validation_passed && r.memory_unit_id_used === 105, `GPT ${calls}회`]);
  const twoQ = { ...good, response: '저번에 11월 말이면 2년인데 결과가 만족스럽진 않다고 했잖아. 그거 아직도 그래? 활성화 1순위면 뭐부터 손댈 건데?' };
  await run('기존 동작 유지: 물음표 2개뿐이면 코드 수정(재생성 없음)', [twoQ], (r, calls) => [calls === 1 && r.repaired === true, `GPT ${calls}회, repaired=${r.repaired}, "${r.response}"`]);

  (globalThis as any).fetch = realFetch;
}
function JSONclone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }
function goodMemoryFor(c: Case) {
  return {
    response: '저번에 11월 말이면 2년인데 결과가 만족스럽진 않다고 했잖아. 활성화 1순위면 뭐부터 손댈 건데?',
    response_strategy: 'MEMORY_REFERENCE', question_present: true, memory_unit_id_used: 105,
    memory_relevance: c.candidates.map((id) => ({ memory_unit_id: id, relevance: id === 105 || id === 99 ? 'YES' : 'NO', relation: id === 105 ? 'same_problem' : id === 99 ? 'continuation' : 'no_relation' })),
    conversation_opportunity: { source: 'memory', type: 'past_present_link', strength: 'STRONG', memory_unit_id: 105, anchor_quote: '스튜디오 활성화가 제일 먼저 우선이고', anchor_fact: '스튜디오 활성화를 최우선으로 두고 있다', question_target: '활성화를 위해 먼저 할 일' },
  };
}

// =============================================================================================
// [C] 실제 GPT — 운영과 같은 분석 → 응답 경로 (DB 조회만 빠짐). 결과는 사람이 읽고 판단한다.
// =============================================================================================
async function partC(repeat: number) {
  group = 'C';
  loadEnvLocal();
  if (!process.env.OPENAI_API_KEY) {
    console.log('\n[C] OPENAI_API_KEY가 없어 건너뜀');
    return;
  }
  const { analyzeTranscriptOnly } = await import('../lib/analysis');
  const { generateResponseCore } = await import('../lib/responseEngine');
  console.log(`\n[C] 실제 GPT — 사례당 ${repeat}회`);
  const rows: any[] = [];
  for (const c of CASES) {
    for (let i = 0; i < repeat; i++) {
      const analysis: any = await analyzeTranscriptOnly(c.transcript);
      const r = await generateResponseCore({
        transcript: c.transcript, analysis, memoryCandidates: [], existingCommitments: [],
        relevantMemoryUnits: c.candidates.map((id) => M[id]), relevantInsights: [],
        relationshipLevel: 5, nickname: null, callAllowed: false, recentTurns: [],
      } as any);
      const opp = r.conversation_opportunity;
      const row = {
        case: c.key, run: i + 1, intent: analysis?.utterance_intent, user_question: analysis?.user_question,
        relevance: r.memory_relevance.map((m: any) => `${m.memory_unit_id}:${m.relevance}/${m.relation ?? '-'}`).join(' '),
        source: opp.source, memory_unit_id_used: r.memory_unit_id_used, target: opp.question_target,
        regen: r.regeneration_count, fallback: r.fallback_used, reasons: r.validation_failure_reason, response: r.response,
      };
      rows.push(row);
      console.log(`  ${c.title} #${i + 1}\n    intent=${row.intent} | relevance=[${row.relevance}] | source=${row.source} used=${row.memory_unit_id_used} | regen=${row.regen} fallback=${row.fallback}${row.reasons ? ` | 사유=${row.reasons}` : ''}\n    target: ${row.target}\n    → ${row.response}`);
    }
    console.log(`    기대: ${c.expect}`);
  }
  const file = `regression-opportunity-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(rows, null, 2));
  console.log(`\n  결과 저장: ${file}`);
}

(async () => {
  partA();
  await partB();
  const live = process.argv[2] === 'live';
  if (live) await partC(Math.max(1, Number(process.argv[3]) || 1));
  const auto = results.filter((r) => r.group !== 'C');
  const failed = auto.filter((r) => !r.pass);
  console.log(`\n자동 검사: ${auto.length - failed.length}/${auto.length} 통과`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL [${f.group}] ${f.label} — ${f.detail ?? ''}`);
    process.exit(1);
  }
})();
