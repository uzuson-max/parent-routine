
// 참견이 1차 수정 검증 스크립트 (DB 읽기/쓰기 없음, 앱 동작에 영향 없음)
//
// 실행:
//   npx tsx scripts/test-response-v1.ts            → [A] 규칙 검사만 (API 키 불필요, GPT 호출 없음)
//   OPENAI_API_KEY=sk-... npx tsx scripts/test-response-v1.ts [반복횟수=1]
//                                                   → [A] + [B] 실제 Test 1~6 (운영과 같은 분석 → 응답 경로)
//
// [B]는 운영 경로와 같은 함수를 그대로 쓴다: analyzeTranscriptOnly()(= analysis callGPT, 과거 약속/패턴 없이)
// → generateResponseCore()(= 프롬프트 → 생성 → 검증 → 수정/재생성 → fallback). DB 조회만 빠진다
// (관계 단계 3, 닉네임 없음, 최근 대화 없음, 전화 불가). Test 3만 "과거 사주 기억"을 후보로 직접 넣는다.
//
import { validateResponse, findNegativeStanceAsInterest, isQuestionOnlyResponse } from '../lib/response/responsevalidator';
import { buildIntentFallback, keepOneQuestion } from '../lib/response/responsefallback';
import { isGroundedIn, normalizeUnderstanding } from '../lib/response/understanding';
import type { RelevantMemoryUnit } from '../lib/memoryRetrieval';

type Check = { label: string; pass: boolean; detail?: string };
const results: Check[] = [];
function check(label: string, pass: boolean, detail?: string) {
  results.push({ label, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
}

const T1 =
  '다음주 연휴니까 내가 지금 전주에 살고 있으니까 쉽게 가기 어려운 강원도 쪽을 가보는 것도 방법일 것 같고 아니면 리프레쉬를 할 겸 중국 선전 3박 4일도 나쁘지 않을 것 같고 일본도 괜찮은데 일본은 연휴 때 비행기값이 너무 비싸고 아무튼 그렇다고 제주도 가기도 싫고 어디 가야 되냐';
const T2 = '유명하다고 해서 점 한번 보러 가고 싶은데 20만 원이나 한대. 너무 비싼 것 같아. 요즘은 GPT로도 많이 본다더라. 너라면 어떻게 생각해?';
const T3 = '20만 원짜리 옷 샀어.';
const T4 = '토요일 아침에 갈 건데 그때 알려줘.';
const T5 = '오늘 회사 진짜 개답답하다.';
const T6 = '제주도는 진짜 가기 싫어.';

function baseResult(response: string, extra: Record<string, any> = {}) {
  return {
    response,
    response_strategy: 'CASUAL' as const,
    question_present: /[?？]/.test(response),
    memory_unit_id_used: null,
    memory_relevance: [],
    conversation_opportunity: {
      source: 'current_turn' as const,
      type: 'reactable_point' as const,
      strength: 'STRONG' as const,
      memory_unit_id: null,
      anchor_quote: null,
      anchor_fact: null,
      question_target: null,
    },
    ...extra,
  };
}

function ctx(transcript: string, intent: string, userQuestion: string | null, negativeTargets: string[] = []) {
  return { validMemoryUnitIds: new Set<number>(), previousResponse: null, transcript, utteranceIntent: intent, userQuestion, negativeTargets };
}

// ===================================================================================
// [A] 결정적 검사 — GPT 없이 규칙/fallback/anchor/의도 보정만 확인
// ===================================================================================
function partA() {
  console.log('\n==== [A] 규칙 검사 (GPT 호출 없음) ====');

  // 1) 예전 실제 실패 응답들이 이제 검증에서 걸리는가
  const c1 = ctx(T1, 'mixed', '어디 가야 되냐', ['제주도']);
  const v1 = validateResponse(baseResult('제주도에서 제일 해보고 싶은 게 뭐야?'), c1);
  check('T1 예전 응답 "제주도에서 제일 해보고 싶은 게 뭐야?" → 실패 처리', !v1.passed, v1.reasons.join(', '));
  check('  └ 부정 뒤집기 감지', v1.reasons.includes('NEGATIVE_STANCE_AS_INTEREST'));
  check('  └ 질문 무시(되묻기만) 감지', v1.reasons.includes('QUESTION_NOT_ANSWERED'));

  const c4 = ctx(T4, 'reminder_request', '토요일 아침에 갈 건데 그때 알려줘');
  const v4 = validateResponse(baseResult('지금은 뭐가 제일 걸려?'), c4);
  check('T4 예전 응답 "지금은 뭐가 제일 걸려?" → 실패 처리', !v4.passed && v4.reasons.includes('QUESTION_NOT_ANSWERED'), v4.reasons.join(', '));
  const v4ok = validateResponse(baseResult('토요일 아침 출발하는 거, 그때 알려달라는 거지?'), c4);
  check('T4 확인 응답 "토요일 아침 출발하는 거, 그때 알려달라는 거지?" → 통과', v4ok.passed, v4ok.reasons.join(', '));

  const c2 = ctx(T2, 'opinion_request', '너라면 어떻게 생각해?');
  const v2bad = validateResponse(baseResult('20만 원이면 뭐가 제일 궁금해서 보려는 거야?'), c2);
  check('T2 의견 요청에 되묻기만 → 실패 처리', !v2bad.passed && v2bad.reasons.includes('QUESTION_NOT_ANSWERED'));
  const v2ok = validateResponse(
    baseResult('20만 원이면 한 번 더 고민해볼 것 같아. 궁금한 게 그 사람 풀이 자체면 가볼 만하고, 그냥 운세가 궁금한 거면 GPT로도 충분할 수 있고.'),
    c2
  );
  check('T2 의견을 준 응답 → 통과', v2ok.passed, v2ok.reasons.join(', '));

  const c6 = ctx(T6, 'vent', null, ['제주도']);
  check('T6 "제주도에서 뭐 하고 싶어?" → 부정 뒤집기 감지', !!findNegativeStanceAsInterest('제주도에서 뭐 하고 싶어?', ['제주도']));
  check('T6 "제주도는 빼고 가면 되지." → 오탐 없음', !findNegativeStanceAsInterest('제주도는 빼고 가면 되지.', ['제주도']));
  const v6 = validateResponse(baseResult('제주도가 뭐가 그렇게 싫어?'), c6);
  check('T6 "제주도가 뭐가 그렇게 싫어?" (부정 유지한 질문) → 통과', v6.passed, v6.reasons.join(', '));

  const c5 = ctx(T5, 'vent', null);
  const v5 = validateResponse(baseResult("오늘은 '답답'에 '개'까지 붙었네. 회사가 오늘 단단히 한 건 했나 보다."), c5);
  check('T5 토로에 질문 없는 반응 → 통과 (vent는 답 의무 없음)', v5.passed, v5.reasons.join(', '));

  // 2) validator ↔ prompt 모순 해소: 질문 2개 → 실패, 코드 수정으로 1개만 남기면 통과
  const two = '강원도랑 선전이 남네. 가까운 데 원하면 강원도? 아니면 리프레시면 선전?';
  const vTwo = validateResponse(baseResult(two), c1);
  check('질문 2개 응답 → TOO_MANY_QUESTIONS', vTwo.reasons.includes('TOO_MANY_QUESTIONS'));
  const fixed = keepOneQuestion(two, '선전');
  check('keepOneQuestion → 질문 1개만 남고 답 문장 유지', (fixed.match(/[?？]/g) ?? []).length === 1 && fixed.startsWith('강원도랑 선전이 남네.'), fixed);

  // 3) anchor 원문 대조
  check('anchor 원문 복사 → 인정', isGroundedIn('제주도 가기도 싫고', T1));
  check('anchor 공백/문장부호만 다름 → 인정', isGroundedIn('제주도 가기도  싫고,', T1));
  check('anchor 지어낸 문장 → 거부', !isGroundedIn('제주도 여행을 가고 싶다', T1));
  const vAnchor = validateResponse(
    baseResult('강원도랑 선전 중엔 선전이 더 여행 같을 것 같아.', {
      conversation_opportunity: { ...baseResult('').conversation_opportunity, anchor_quote: '제주도에서 한 달 살고 싶다' },
    }),
    c1
  );
  check('원문에 없는 anchor_quote → ANCHOR_NOT_IN_TRANSCRIPT', vAnchor.reasons.includes('ANCHOR_NOT_IN_TRANSCRIPT'));

  // 4) 의도 보정 (GPT 값이 없을 때 규칙 기반) + 원문에 없는 user_question 폐기
  check('규칙 기반 의도: T4 → reminder_request', normalizeUnderstanding(null, T4).utterance_intent === 'reminder_request');
  check('규칙 기반 의도: T2 → opinion_request', normalizeUnderstanding(null, T2).utterance_intent === 'opinion_request');
  const u = normalizeUnderstanding(
    { utterance_intent: 'question', user_question: '어디로 여행 가면 좋을까요', stances: [{ target: '제주도', stance: 'negative', quote: '제주도 가기도 싫고' }, { target: '하와이', stance: 'positive', quote: null }] },
    T1
  );
  check('원문에 없는 user_question 폐기', u.user_question === null);
  check('원문에 있는 stance 유지 / 원문에 없는 대상(하와이) 폐기', u.stances.length === 1 && u.stances[0].target === '제주도');

  // 5) fallback — 키워드가 아니라 의도 기반. 제주도/generic 질문이 나오지 않는가
  const fbCases: [string, any][] = [
    [T1, { utterance_intent: 'mixed', user_question: '어디 가야 되냐', stances: [{ target: '제주도', stance: 'negative', quote: null }] }],
    [T2, { utterance_intent: 'opinion_request', user_question: '너라면 어떻게 생각해?', stances: [] }],
    [T3, { utterance_intent: 'statement', user_question: null, stances: [] }],
    [T4, { utterance_intent: 'reminder_request', user_question: '토요일 아침에 갈 건데 그때 알려줘', stances: [], commitment_due_at: '2026-10-03T08:00:00+09:00' }],
    [T4, { utterance_intent: 'reminder_request', user_question: '토요일 아침에 갈 건데 그때 알려줘', stances: [], commitment_due_at: null }],
    [T5, { utterance_intent: 'vent', user_question: null, stances: [] }],
    [T6, { utterance_intent: 'vent', user_question: null, stances: [{ target: '제주도', stance: 'negative', quote: null }] }],
  ];
  for (const [t, a] of fbCases) {
    const fb = buildIntentFallback(t, a, null);
    const bad =
      /제주도에서 제일 해보고 싶은/.test(fb) ||
      fb === '지금은 뭐가 제일 걸려?' ||
      !!findNegativeStanceAsInterest(fb, (a.stances ?? []).filter((s: any) => s.stance === 'negative').map((s: any) => s.target));
    check(`fallback(${a.utterance_intent}${a.commitment_due_at === null ? ', 시각 없음' : ''})`, !bad && (fb.match(/[?？]/g) ?? []).length <= 1, fb);
  }
  check('isQuestionOnlyResponse 동작', isQuestionOnlyResponse('뭐야?') && !isQuestionOnlyResponse('그렇구나. 뭐야?'));
}

// ===================================================================================
// [B] 실제 GPT 경로 — Test 1~6
// ===================================================================================
const SAJU_MEMORY: RelevantMemoryUnit = {
  id: 900001,
  memory_type: 'concern',
  subject: '사주',
  content: '유명한 사주를 보고 싶지만 20만 원이 비싸서 고민했다',
  emotion: '망설임',
  temporal_context: '며칠 전',
  importance: 0.6,
  status: 'open',
  created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  last_referenced_at: null,
  relevanceScore: 5,
  relevanceReason: 'test fixture',
  stance: 'uncertain',
  raw_quote: '20만 원이나 한대. 너무 비싼 것 같아',
};

const JUDGE_RE = /(아깝다면서|비싸다더니|비싸다면서|사주엔|사주에는|옷엔 쓰|옷에는 쓰)/;
const RESERVED_RE = /(맞춰놨|맞춰 놨|예약했|예약해놨|등록했|알람 설정)/;

async function partB(runs: number) {
  const { analyzeTranscriptOnly } = await import('../lib/analysis');
  const { generateResponseCore } = await import('../lib/responseEngine');

  const cases: { id: string; transcript: string; memories: RelevantMemoryUnit[] }[] = [
    { id: 'Test 1 — 여행', transcript: T1, memories: [] },
    { id: 'Test 2 — 의견 요청', transcript: T2, memories: [] },
    { id: 'Test 3 — 소비(과거 사주 기억 있음)', transcript: T3, memories: [SAJU_MEMORY] },
    { id: 'Test 4 — Reminder', transcript: T4, memories: [] },
    { id: 'Test 5 — 단순 토로', transcript: T5, memories: [] },
    { id: 'Test 6 — 부정', transcript: T6, memories: [] },
  ];

  const stats = { total: 0, repaired: 0, regenerated: 0, fallback: 0, calls: 0 };

  for (let run = 1; run <= runs; run++) {
    for (const c of cases) {
      console.log(`\n==== [B] ${c.id} (run ${run}) ====`);
      const analysis = await analyzeTranscriptOnly(c.transcript);
      const r = await generateResponseCore({
        transcript: c.transcript,
        analysis,
        memoryCandidates: [],
        existingCommitments: [],
        relevantMemoryUnits: c.memories,
        relevantInsights: [],
        initialTopic: undefined,
        relationshipLevel: 3,
        nickname: null,
        callAllowed: false,
        recentTurns: [],
      });
      stats.total++;
      stats.calls += 1 + 1 + r.regeneration_count; // analysis + generation (+ regeneration)
      if (r.repaired) stats.repaired++;
      if (r.regeneration_count > 0) stats.regenerated++;
      if (r.fallback_used) stats.fallback++;

      console.log(`  intent=${analysis.utterance_intent} user_question=${JSON.stringify(analysis.user_question)}`);
      console.log(`  stances=${JSON.stringify(analysis.stances)}`);
      console.log(`  response: "${r.response}"`);
      console.log(
        `  strategy=${r.response_strategy} answered=${r.answered_user_question} regen=${r.regeneration_count} repaired=${r.repaired} fallback=${r.fallback_used}(${r.fallback_kind}) reasons=${r.validation_failure_reason}`
      );
      console.log(`  opportunity=${JSON.stringify(r.conversation_opportunity)} memory_unit_id_used=${r.memory_unit_id_used}`);

      const q = (r.response.match(/[?？]/g) ?? []).length;
      const neg = (analysis.stances ?? []).filter((s: any) => s.stance === 'negative').map((s: any) => s.target);
      switch (c.transcript) {
        case T1:
          check('T1 제주도를 negative로 이해', neg.includes('제주도'));
          check('T1 질문으로 이해 (question/mixed)', ['question', 'mixed'].includes(analysis.utterance_intent));
          check('T1 제주도를 원하는 것처럼 말하지 않음', !findNegativeStanceAsInterest(r.response, ['제주도']));
          check('T1 실제로 답함 (강원도/선전 언급 + 되묻기만 아님)', /(강원|선전|심천)/.test(r.response) && !isQuestionOnlyResponse(r.response));
          check('T1 fallback 아님', !r.fallback_used);
          break;
        case T2:
          check('T2 opinion_request로 이해', analysis.utterance_intent === 'opinion_request');
          check('T2 의견을 줌 (되묻기만 아님)', !isQuestionOnlyResponse(r.response) && r.answered_user_question !== false);
          check('T2 사주/점을 좋아한다고 단정하지 않음', !/(좋아하잖아|관심 많잖아|원래 좋아)/.test(r.response));
          break;
        case T3:
          check('T3 과거 사주 기억으로 판정하지 않음', !JUDGE_RE.test(r.response));
          check('T3 질문 최대 1개', q <= 1);
          break;
        case T4:
          check('T4 reminder_request로 이해', analysis.utterance_intent === 'reminder_request');
          check('T4 요청을 받아서 확인 (토요일/아침/알려 언급)', /(토요일|아침|알려)/.test(r.response));
          check('T4 예약됐다고 말하지 않음', !RESERVED_RE.test(r.response));
          break;
        case T5:
          check('T5 vent로 이해', analysis.utterance_intent === 'vent');
          check('T5 질문으로 억지 전환하지 않음 (물음표 0개)', q === 0, q > 0 ? `물음표 ${q}개` : undefined);
          break;
        case T6:
          check('T6 제주도 negative로 이해', neg.includes('제주도'));
          check('T6 "제주도에서 뭐 하고 싶어?"류 없음', !findNegativeStanceAsInterest(r.response, ['제주도']));
          break;
      }
      check(`${c.id.split(' ')[0]} ${c.id.split(' ')[1]} 물음표 최대 1개`, q <= 1);
    }
  }

  console.log('\n==== [B] 호출/검증 통계 ====');
  console.log(`  응답 ${stats.total}건 · 수정(repair) ${stats.repaired} · 재생성 ${stats.regenerated} · fallback ${stats.fallback} · GPT 호출(분석+생성) ${stats.calls}`);
}

async function main() {
  partA();
  if (process.env.OPENAI_API_KEY) {
    await partB(Number(process.argv[2] ?? 1) || 1);
  } else {
    console.log('\n(OPENAI_API_KEY 없음 — [B] 실제 GPT 테스트는 건너뜀)');
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n==== 합계: ${results.length - failed.length}/${results.length} PASS ====`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL: ${f.label}${f.detail ? ` — ${f.detail}` : ''}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
