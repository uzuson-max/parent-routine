
//
// STEP 5-1 — Answerability Evaluation Set (평가용 데이터. 앱 코드에서 import하지 않는다.)
//
// 목적: 참견이 응답을 읽은 사용자가 "그래서 나는 뭐라고 대답하면 되는 거지?"라고 느끼는지를
// 규칙으로 측정할 수 있도록, 사람이 판정해 둔 기준 사례 모음. isQuestionNotAnswerable()과
// 기존 validateResponse()를 이 세트에 돌려 비교한다 (scripts/eval-answerability.ts).
//
// 판정 기준 (사람이 붙인 값):
// - expected: 이 응답을 사용자에게 내보내도 되는가 (PASS / FAIL). 답변 가능성만이 아니라 추측·기억 왜곡 등 전체 기준.
// - answerability: "무엇에 답해야 하는지" 3초 안에 알 수 있는가. isQuestionNotAnswerable()이 맞혀야 하는 값은 이것뿐이다.
//     ANSWERABLE / NOT_ANSWERABLE / NO_QUESTION(질문이 없는 반응형 응답 — 물음표가 없다는 이유로 실패시키면 안 됨)
// - obviousness: NOT_ANSWERABLE일 때만. OBVIOUS = 보수적인 규칙으로도 잡아야 하는 것, SUBTLE = 규칙으로 잡기 어려워 지금은 놓쳐도 되는 것.
// - failure_types: expected=FAIL인 이유. 답변 가능성(NOT_ANSWERABLE)과 추측(UNGROUNDED_ASSUMPTION)을 구분해서 적는다.

export type AnswerabilityCategory =
  | 'A_UNANSWERABLE' // 명백히 답하기 어려운 질문
  | 'B_SHORT_ANSWERABLE' // 짧지만 답하기 쉬운 질문 (짧다는 이유로 실패시키면 안 됨)
  | 'C_MEMORY' // 과거 기억을 활용한 질문
  | 'D_INFERENCE' // 추측이 섞인 질문
  | 'E_REAL_LOG' // 실제 운영 로그 (voice_entries, 2026-09-23)
  | 'F_NO_QUESTION'; // 질문 없는 반응형 응답 (물음표 없음 ≠ 실패)

export type FailureType =
  | 'NOT_ANSWERABLE' // 무엇에 답해야 하는지 불명확
  | 'UNGROUNDED_ASSUMPTION' // 사용자가 말하지 않은 성향/습관/감정을 추측해서 사실처럼 말함
  | 'MEMORY_NOT_GROUNDED' // "예전에 ~라고 했잖아"의 내용이 실제 memory와 다름
  | 'PREMISE_MISMATCH' // 질문 대상은 명확하지만 전제가 사용자 상황과 어긋남 (실제 로그에서 사용자가 "질문이 이상하다"고 지적)
  | 'SYSTEM_LEAK'; // 시스템 상태(STT 실패 등)가 대화 내용으로 새어 나옴

export interface AnswerabilityCase {
  id: string;
  response: string;
  expected: 'PASS' | 'FAIL';
  category: AnswerabilityCategory;
  /** 사람이 읽었을 때 왜 PASS/FAIL인지 한 줄 설명 */
  reason: string;
  failure_types: FailureType[];
  answerability: 'ANSWERABLE' | 'NOT_ANSWERABLE' | 'NO_QUESTION';
  obviousness?: 'OBVIOUS' | 'SUBTLE';
  has_explicit_target: boolean;
  has_single_question_target: boolean;
  uses_ambiguous_pronoun: boolean;
  contains_inference: boolean;
  contains_memory_claim: boolean;
  /** 이 응답을 만들 때 실제로 존재한다고 가정한 memory_units.content (없으면 null) */
  memory?: string | null;
  /** 실제 로그: 응답 직전/직후 사용자 발화 */
  context?: { user_before?: string; user_after?: string; note?: string };
  /** 기존 validateResponse()에 넣을 때의 가정. 기본값: 물음표 있으면 QUESTION, 없으면 CASUAL / memory 연결 없음 */
  validator_input?: { strategy?: string; memory_linked?: boolean };
}

export const ANSWERABILITY_CASES: AnswerabilityCase[] = [
  // ─────────────── A. 명백히 답하기 어려운 질문 ───────────────
  { id: 'A01', response: '그거 어때?', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '"그거"가 무엇인지 문장 어디에도 없어서 무엇을 평가해야 하는지 모름',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: true, contains_inference: false, contains_memory_claim: false },
  { id: 'A02', response: '어떤 것 같아?', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '평가할 대상 자체가 없음',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'A03', response: '그래서 요즘은?', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '"요즘은" 뒤에 무엇을 묻는지(기분? 일? 그 일?)가 생략됨',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'A04', response: '그건?', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '대상도 질문 내용도 없는 꼬리 질문',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: true, contains_inference: false, contains_memory_claim: false },
  { id: 'A05', response: '그게 궁금한데?', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '"그게"가 무엇인지 없이 궁금하다고만 함',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: true, contains_inference: false, contains_memory_claim: false },
  { id: 'A06', response: '그거 아직도 그래?', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '"그거"와 "그래" 둘 다 가리키는 대상이 문장에 없음',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: true, contains_inference: false, contains_memory_claim: false },
  { id: 'A07', response: '그런 건 어때?', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '"그런 건"이 무엇인지 없음',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: true, contains_inference: false, contains_memory_claim: false },
  { id: 'A08', response: '가기 싫은 게 회사인지, 회사 가는 버전의 너인지 궁금하네.', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '선택지처럼 보이지만 "회사 가는 버전의 너"가 추상적이라 뭐라고 답해야 할지 모름 (현재 프롬프트의 "좋은 예")',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'SUBTLE',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: false, contains_inference: true, contains_memory_claim: false },
  { id: 'A09', response: '좀 궁금하네.', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '무엇이 궁금한지 없음',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'A10', response: '요즘은?', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '"요즘은" 뒤 질문 내용 생략',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'A11', response: '이거 어때?', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '"이거"가 무엇인지 없음',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: true, contains_inference: false, contains_memory_claim: false },
  { id: 'A12', response: '그건 어떤 것 같아?', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '"그건"이 무엇인지 없고 평가 기준도 없음',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: true, contains_inference: false, contains_memory_claim: false },
  { id: 'A13', response: '회사 얘기 들으니까 좀 궁금한데?', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '"회사 얘기"는 계기일 뿐, 회사의 무엇이 궁금한지(대상)가 없음',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'A14', response: '어떻게 생각해?', expected: 'FAIL', category: 'A_UNANSWERABLE',
    reason: '무엇에 대한 생각인지 없음',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },

  // ─────────────── B. 짧지만 답하기 쉬운 질문 (절대 오탐하면 안 됨) ───────────────
  { id: 'B01', response: '그 카페 아직도 가?', expected: 'PASS', category: 'B_SHORT_ANSWERABLE',
    reason: '"그"가 있지만 대상(카페)이 명시됨 — 예/아니오로 바로 답 가능',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'B02', response: '요즘도 아메리카노 매일 마셔?', expected: 'PASS', category: 'B_SHORT_ANSWERABLE',
    reason: '대상(아메리카노)과 질문(매일 마시는지)이 명확',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'B03', response: '제주도 한 달 살기 생각, 아직 있어?', expected: 'PASS', category: 'B_SHORT_ANSWERABLE',
    reason: '쉼표 앞에 대상이 명시되고 뒤는 예/아니오 질문',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'B04', response: '그 식물 계속 키우고 있어?', expected: 'PASS', category: 'B_SHORT_ANSWERABLE',
    reason: '대상(식물) 명시 — 짧아도 답이 명확 (다만 실제 대화에선 E01처럼 전제가 어긋날 수 있음)',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'B05', response: '요즘도 그 노래 들어?', expected: 'PASS', category: 'B_SHORT_ANSWERABLE',
    reason: '대상(노래) 명시',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'B06', response: '네가 요즘 뭘 좋아하는지 궁금한데.', expected: 'PASS', category: 'B_SHORT_ANSWERABLE',
    reason: '"궁금하다"로 끝나지만 궁금한 대상(요즘 좋아하는 것)이 명시됨',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'B07', response: '크림라면이면 뭐랑 같이 먹었어?', expected: 'PASS', category: 'B_SHORT_ANSWERABLE',
    reason: '같이 먹은 것 하나만 말하면 됨',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'B08', response: '고양이는 지금 괜찮아?', expected: 'PASS', category: 'B_SHORT_ANSWERABLE',
    reason: '대상(고양이)과 질문(괜찮은지) 명확',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'B09', response: '원래 그렇게 먹어, 아니면 오늘만 그런 거야?', expected: 'PASS', category: 'B_SHORT_ANSWERABLE',
    reason: '"그렇게"는 사용자가 방금 말한 먹는 방식을 가리키고, 둘 중 하나를 고르면 됨 (지시어가 있다고 실패시키면 안 되는 사례)',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'B10', response: '몸은 좀 어때?', expected: 'PASS', category: 'B_SHORT_ANSWERABLE',
    reason: '"어때"가 있지만 대상(몸)이 명시됨 ("어때"가 있다고 실패시키면 안 되는 사례)',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },

  // ─────────────── C. 과거 기억을 활용한 질문 ───────────────
  { id: 'C01', response: '예전에 제주도에서 한 달 살아보고 싶다고 했잖아. 아직도 그 생각 있어?', expected: 'PASS', category: 'C_MEMORY',
    reason: '실제 memory 내용 그대로 + 현재 여부를 묻는 질문 하나 (목표 구조)',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: true,
    memory: '제주도에서 한 달 살아보고 싶다', validator_input: { strategy: 'MEMORY_REFERENCE', memory_linked: true } },
  { id: 'C02', response: '전에 그 카페 자주 간다고 했잖아. 요즘도 가?', expected: 'PASS', category: 'C_MEMORY',
    reason: '앞 문장이 대상을 제공하므로 "요즘도 가?"가 짧아도 명확',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: true,
    memory: '회사 근처 카페에 자주 간다', validator_input: { strategy: 'MEMORY_REFERENCE', memory_linked: true } },
  { id: 'C03', response: '예전에 아메리카노 매일 마신다고 했잖아. 요즘도 그래?', expected: 'PASS', category: 'C_MEMORY',
    reason: '"요즘도 그래?"는 A06과 같은 지시형이지만 앞 문장이 가리키는 대상을 명시함 (문맥 없는 규칙이면 오탐하는 핵심 사례)',
    failure_types: [], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: true,
    memory: '요즘 아메리카노를 매일 마신다', validator_input: { strategy: 'MEMORY_REFERENCE', memory_linked: true } },
  { id: 'C04', response: '예전에 네가 카페를 좋아한다고 했잖아. 요즘도 그래?', expected: 'FAIL', category: 'C_MEMORY',
    reason: '질문은 명확하지만 memory는 "자주 간다"일 뿐 "좋아한다"고 말한 적 없음 (답변 가능성 문제가 아니라 기억 왜곡)',
    failure_types: ['MEMORY_NOT_GROUNDED'], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: true, contains_memory_claim: true,
    memory: '회사 근처 카페에 자주 간다', validator_input: { strategy: 'MEMORY_REFERENCE', memory_linked: true } },
  { id: 'C05', response: '너 원래 사람 많은 곳 싫어하잖아. 요즘도 그래?', expected: 'FAIL', category: 'C_MEMORY',
    reason: '"원래 ~잖아"로 성향을 일반화 — 그런 memory가 없음 (답은 가능하지만 추측을 사실처럼 말함)',
    failure_types: ['UNGROUNDED_ASSUMPTION', 'MEMORY_NOT_GROUNDED'], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: true, contains_memory_claim: true,
    memory: null, validator_input: { strategy: 'QUESTION', memory_linked: false } },

  // ─────────────── D. 추측이 섞인 질문 (답변 가능성과 추측을 구분) ───────────────
  { id: 'D01', response: '카페에 자주 가는 것 같던데, 그거 어때?', expected: 'FAIL', category: 'D_INFERENCE',
    reason: '"~것 같던데"는 추측이고, "그거"는 그 추측을 가리켜서 무엇을 평가할지도 불명확 → 두 문제 모두',
    failure_types: ['UNGROUNDED_ASSUMPTION', 'NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: true, contains_inference: true, contains_memory_claim: false },
  { id: 'D02', response: '요즘 회사가 답답한 것 같던데, 왜 그런 것 같아?', expected: 'FAIL', category: 'D_INFERENCE',
    reason: '질문 대상(회사가 답답한 이유)은 명확하지만 "답답한 것 같다"는 전제가 추측 → 답변 가능성이 아니라 UNGROUNDED 문제',
    failure_types: ['UNGROUNDED_ASSUMPTION'], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: true, contains_memory_claim: false },
  { id: 'D03', response: '너 원래 사람 많은 데 싫어하는 편이잖아. 맞아?', expected: 'FAIL', category: 'D_INFERENCE',
    reason: '예/아니오로 답은 가능하지만 성향을 추측으로 단정 → UNGROUNDED 문제',
    failure_types: ['UNGROUNDED_ASSUMPTION'], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: true, contains_memory_claim: true },
  { id: 'D04', response: '네가 요즘 아메리카노를 매일 마시는지 궁금해하는 걸 보니까, 카페에 자주 가는 것 같던데. 그거 어때?', expected: 'FAIL', category: 'D_INFERENCE',
    reason: '처음 요청서의 "좋지 않은 예" — 추측 전제 + 대상 없는 "그거 어때?"',
    failure_types: ['UNGROUNDED_ASSUMPTION', 'NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: true, contains_inference: true, contains_memory_claim: false },
  { id: 'D05', response: '요즘 카페 자주 가는 것 같던데, 그건?', expected: 'FAIL', category: 'D_INFERENCE',
    reason: '추측 전제 + 무엇을 묻는지 생략된 꼬리 질문',
    failure_types: ['UNGROUNDED_ASSUMPTION', 'NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'OBVIOUS',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: true, contains_inference: true, contains_memory_claim: false },

  // ─────────────── E. 실제 운영 로그 (voice_entries, 2026-09-23, 검증 기능 배포 이후 3건 전부) ───────────────
  { id: 'E01', response: '고사리 새순 올라오는 거 보니까 진짜 기분 좋겠네! 그 식물들 키우는 거 계속 해볼 생각이야?', expected: 'FAIL', category: 'E_REAL_LOG',
    reason: '질문 대상(식물 계속 키울지)은 명확하지만, 이미 키우고 있는 사람에게 "계속 해볼 생각이냐"는 전제가 어긋남 — 사용자가 바로 "질문이 이상하다"고 지적 (프롬프트가 금지한 정보수집형 질문이기도 함)',
    failure_types: ['PREMISE_MISMATCH'], answerability: 'ANSWERABLE',
    has_explicit_target: true, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: true, contains_memory_claim: false,
    context: {
      user_before: '앞으로 어떤 식물을 키우고 싶냐라는 건 사실 딱히 엄청 뭔가 목표가 있거나 한 건 아니야 왜냐면 난 그냥 식물이 좋은 거라서 뭐 비싼 식물을 키우고 싶은 마음도 없고 그냥 지금 키우고 있는 고사리들 러너 나와서 그거 옮겨 심었는데 … 새로운 새순들 올라오는게 …',
      user_after: '아니 근데 계속 해볼 생각이라고 물어보기엔 내가 그냥 식물을 키우는건데 식물을 계속 키울거냐는게 뭔가 질문이 이상하다 식물이 있고 키우고 있으니까 그냥 계속 키우겠지 그렇지 않아? …',
      note: '1차 생성 TOO_MANY_QUESTIONS → 재생성 통과. 기존 validator는 이 응답을 통과시켰음',
    } },
  { id: 'E02', response: '지금은 뭐가 제일 걸려?', expected: 'FAIL', category: 'E_REAL_LOG',
    reason: '무엇에 대해 "걸리는" 걸 묻는지 영역이 없음(고정 fallback) — 직전 발화의 지적("질문이 이상하다")과 새 화제(알바·추석 선물)를 모두 무시',
    failure_types: ['NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'SUBTLE',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false,
    context: {
      user_before: '아니 근데 계속 해볼 생각이라고 물어보기엔 … 질문이 이상하다 … 아무튼 그래서 오늘 좀 알바도 끝났는데 요즘 알바는 되게 시간을 뺄 때 일하는 알바들한테도 추석이라고 무슨 …',
      note: '1차·재생성 모두 TOO_MANY_QUESTIONS → deterministic fallback("지금은 뭐가 제일 걸려?")',
    } },
  { id: 'E03', response: '음성 변환이 실패했구나. 무슨 일이 있었던 거야?', expected: 'FAIL', category: 'E_REAL_LOG',
    reason: 'STT 실패라는 시스템 상태가 대화 내용이 됨 — 사용자는 "무슨 일"에 답할 게 없음',
    failure_types: ['SYSTEM_LEAK', 'NOT_ANSWERABLE'], answerability: 'NOT_ANSWERABLE', obviousness: 'SUBTLE',
    has_explicit_target: false, has_single_question_target: true, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false,
    context: { user_before: '(음성 변환 실패)', note: '1차 EMPTY_RESPONSE → 재생성 통과. 근본 해결은 STT 실패 시 LLM 호출 자체를 막는 것 (P0-3)' } },

  // ─────────────── F. 질문 없는 반응형 응답 (물음표가 없다고 실패시키면 안 됨) ───────────────
  { id: 'F01', response: '와, 그건 진짜 놀랐겠다.', expected: 'PASS', category: 'F_NO_QUESTION',
    reason: '질문 없이 반응만 하는 응답 — 답변 가능성 판정 대상이 아님 ("그건"이 있어도 질문이 아님)',
    failure_types: [], answerability: 'NO_QUESTION',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: true, contains_inference: false, contains_memory_claim: false },
  { id: 'F02', response: '참은 게 아니라 그냥 미룬 거네.', expected: 'PASS', category: 'F_NO_QUESTION',
    reason: '짧은 되받아치기 — 질문이 아님',
    failure_types: [], answerability: 'NO_QUESTION',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
  { id: 'F03', response: '그래도 별일 없이 지나가서 다행이다.', expected: 'PASS', category: 'F_NO_QUESTION',
    reason: '질문 없이 한마디로 마무리하는 반응형',
    failure_types: [], answerability: 'NO_QUESTION',
    has_explicit_target: false, has_single_question_target: false, uses_ambiguous_pronoun: false, contains_inference: false, contains_memory_claim: false },
];
