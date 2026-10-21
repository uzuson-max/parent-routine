
// responseEngine.ts에서 옮겨온 rule-based response validation (2026-09 구조 분리).
// 규칙·정규식·패턴 문자열·함수 로직은 원본과 동일하다 — 파일 위치만 바뀌었다.
// 의존 방향: responseTypes ← responseValidator ← responseEngine (이 파일은 responseEngine을 import하지 않는다).
import type {
  ResponseResult,
  ValidationContext,
  ValidationFailureReason,
  ValidationResult,
} from '@/lib/response/responsetypes';
import { WORTHY_MEMORY_RELATIONS } from '@/lib/response/responsetypes';
import {
  detectClosingSignal,
  detectQuestionRequest,
  intentNeedsAnswer,
  isGroundedIn,
  normalizeLoose,
  UtteranceIntent,
} from '@/lib/response/understanding';

// ---- Validation 내부 유틸 ----

// 완벽한 NLP 문장 분리를 구현하지 않는다 — STEP 6은 "명백한 실패"만 잡는 것이 목적이므로,
// 한국어 문장 종결부호(. ! ? ？ ~) 뒤를 기준으로 한 단순 분리로 충분하다.
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?？~])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function normalizeForMatch(s: string): string {
  return s.trim().replace(/[?？.!~\s]+$/g, '');
}

function normalizeForRepeatCheck(s: string): string {
  return s.replace(/[\s.,!?？~]/g, '');
}

const GENERIC_QUESTION_PATTERNS = [
  '더 이야기해줄래',
  '말해줄래',
  '어떻게 생각해',
  '그래서 어떻게 생각해',
  '왜',
  '왜 그런 거야',
  '무슨 일이야',
  '어때',
  '괜찮아',
  '어떻게 하고 싶어',
  '앞으로 어떻게 할 거야',
  '무슨 생각이 들어',
  '더 자세히 말해줘',
];

// "질문 문장 앞에 현재 상황을 구체적으로 설명하지 않고, generic question만 단독으로 존재하면
// FAIL한다"(스펙 8절) — 즉 응답이 정확히 한 문장이고, 그 문장 자체가 generic 패턴과 완전히
// 일치할 때만 실패시킨다. 앞에 구체적인 문장이 붙어 있으면(=STEP 5의 "빈칸" 구조를 이미 지킨
// 경우) 실패시키지 않는다.
function isGenericQuestion(response: string): boolean {
  const sentences = splitSentences(response);
  if (sentences.length !== 1) return false;
  const normalized = normalizeForMatch(sentences[0]);
  return GENERIC_QUESTION_PATTERNS.some((p) => normalizeForMatch(p) === normalized);
}

const CLOSING_PATTERNS = [
  '힘내',
  '화이팅',
  '응원할게',
  '잘 될 거야',
  '잘할 수 있을 거야',
  '좋은 하루 보내',
  '잘 자',
  '좋겠다',
  '대단하다',
  '멋지다',
  '괜찮아',
  '충분히 잘하고 있어',
  '잘하고 있어',
];

// 응답에 물음표(빈칸)가 하나라도 있으면 애초에 "닫힌" 응답이 아니다. 물음표가 없고, 마지막
// 문장이 closing 패턴과 정확히 일치할 때만 FAIL한다(스펙 9절 — "단어 하나가 포함되었다고
// 실패시키지 않는다").
export function isClosingResponse(response: string): boolean {
  if (/[?？]/.test(response)) return false;
  const sentences = splitSentences(response);
  if (sentences.length === 0) return false;
  const last = normalizeForMatch(sentences[sentences.length - 1]);
  return CLOSING_PATTERNS.some((p) => normalizeForMatch(p) === last);
}

const GENERIC_ENCOURAGEMENT_PATTERNS = [
  '그럴 수 있어',
  '괜찮아',
  '힘내',
  '잘할 수 있을 거야',
  '충분히 잘하고 있어',
  '응원할게',
];

// 응답을 이루는 문장 전부가 generic encouragement 패턴뿐이고, 현재 상황에 대한 구체적인 언급이
// 하나도 없을 때만 FAIL한다. "구체적인 현재 상황 + 반응/관찰 + (필요하면) 빈칸" 구조가 있으면
// 통과한다(스펙 10절).
function isGenericEncouragement(response: string): boolean {
  const sentences = splitSentences(response);
  if (sentences.length === 0) return false;
  return sentences.every((s) => {
    const normalized = normalizeForMatch(s);
    return GENERIC_ENCOURAGEMENT_PATTERNS.some((p) => normalizeForMatch(p) === normalized);
  });
}

// 2026-10-21 — RULE 30 GENERIC_TAIL.
// 마지막 문장 "하나"만 본다. 아래를 모두 만족할 때만 true — 공감 자체를 막는 규칙이 아니다.
//   ① 문장이 2개 이상(꼬리를 걷어내도 본문이 남는다 — 한 문장짜리는 기존 RULE 6/7 담당)
//   ② 마지막 문장에 물음표가 없고, 과거 기억을 가리키는 표현이 없다(기억 문장은 건드리지 않는다)
//   ③ 마지막 문장이 평가·바람형 어미로 끝난다
//   ④ 사용자가 같은 표현을 직접 쓰지 않았다(되받기 허용)
//   ⑤ 그 문장 본문이 사용자 원문과 거의 겹치지 않는다(원문 디테일을 담은 문장은 구체적이라 본다)
//   ⑥ (안전성 점검) 본문 자체가 내용 없음 — 지시어로 앞 말을 되받거나("그걸/그게") 막연한 다짐어("극복/열심히/잘 되")뿐이거나
//      거의 비어 있다. 어미만 보고 지우지 않는다: 행동·정보("우산 챙겨 가면")가 있으면 유지한다.
//   ⑦ (안전성 점검) 아픔·어려움에 대한 배려("빨리 나으시면", "푹 쉬었으면")는 유지한다.
const GENERIC_TAIL_RE =
  /(좋겠어|좋겠다|좋겠네|바라|바랄게|응원할게|응원해|중요한\s*(거야|거지|걸|것\s*같아)|중요해|자연스러운\s*(거야|거지|것\s*같아|일이야)|자연스러워|좋은\s*생각이네|좋은\s*생각이야|멋지다|멋져|대단하다|대단해|잘\s*될\s*거야|잘할\s*수\s*있을\s*거야)$/;
const TAIL_PAST_REFERENCE = /(저번에|예전에|지난번|전에|그때|했잖아|했었|했던|다며|라며|다더니|라더니)/;
const TAIL_CONTENT_OVERLAP_MIN = 3;
const TAIL_CARE_RE = /(나으|나아|낫|회복|쾌차|무사|건강|아프|안\s*아|다치|조심|푹|편히|쉬|잠\s*좀|자고|덜\s*힘)/;
const TAIL_GENERIC_BODY_RE = /(^(그|이)(걸|게|거|건|런|렇게)(\s|$))|극복|이겨내|해내|이뤄|이루|노력|힘내|잘\s*(되|풀|해|하|할|될)|열심히|꾸준히|계속|앞으로도/;
const TAIL_EMPTY_BODY_MAX = 4;
function tailBigramOverlap(a: string, b: string): number {
  const na = normalizeLoose(a);
  const nb = normalizeLoose(b);
  if (na.length < 2 || nb.length < 2) return 0;
  let hit = 0;
  for (let i = 0; i < na.length - 1; i++) if (nb.includes(na.slice(i, i + 2))) hit++;
  return hit;
}
export function isGenericTail(response: string, transcript: string | null | undefined): boolean {
  const sentences = splitSentences(response);
  if (sentences.length < 2) return false;
  const last = sentences[sentences.length - 1];
  if (/[?？]/.test(last) || TAIL_PAST_REFERENCE.test(last)) return false;
  const core = last.replace(/[\s.!~…ㅋㅎ]+$/g, '');
  const m = core.match(GENERIC_TAIL_RE);
  if (!m) return false;
  const t = normalizeLoose(transcript ?? '');
  if (t && t.includes(normalizeLoose(m[0]).slice(0, 2))) return false;
  const body = core.slice(0, core.length - m[0].length);
  if (t && tailBigramOverlap(body, t) >= TAIL_CONTENT_OVERLAP_MIN) return false;
  if (TAIL_CARE_RE.test(body)) return false;
  return normalizeLoose(body).length <= TAIL_EMPTY_BODY_MAX || TAIL_GENERIC_BODY_RE.test(body.trim());
}

// MEMORY_REFERENCE 전략인데 memory_unit_id_used가 없는데도 "전에/예전에/저번에 ~했잖아" 식으로
// 과거 사실을 확정적으로 언급하는, 명백한 경우만 잡는다. 자연어를 완벽하게 판정하려 하지 않는다
// (스펙 17절 — "명백한 경우만 검사한다").
function mentionsPastMemoryLikePhrase(response: string): boolean {
  return /(전에|예전에|저번에).{0,30}(했잖아|말했잖아|그랬잖아)/.test(response);
}

// ---- Opportunity NONE 탈출구 차단 유틸 (2026-09-28) ----
//
// "이 발화는 물고 늘어질 구체적인 디테일이 있는가"만 판정한다. anchor를 새로 만들거나 고르지 않는다 —
// 그건 generation(GPT)의 몫이고, 여기서는 "구체적인데 NONE으로 빠진 건 이상하다"를 잡아 재생성만 유도한다.
// 명백한 신호만 본다(오탐으로 모든 발화에 opportunity를 강제하지 않는 게 우선). 발화 길이만으로는 판정하지 않는다.
//
// 조사 "도"는 신호에서 뺐다 — 거의 모든 문장에 조사로 들어가서, 넣으면 사실상 "모든 발화 강제"가 된다.
const SPECIFIC_DETAIL_SIGNALS: { label: string; pattern: RegExp }[] = [
  // 숫자 (아라비아 숫자 — 금액·횟수·기간 대부분이 여기 걸린다)
  { label: 'number', pattern: /[0-9０-９]/ },
  // 한글 수사 + 단위 ("두 번", "세 마리", "몇 달")
  {
    label: 'counted_quantity',
    pattern: /(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|몇)\s?(번|개|명|마리|살|시간|달|주|학기|잔|권|벌|장|판|그릇|곳|군데)/,
  },
  // 한글 금액/기간 ("만 원", "삼 학기")
  { label: 'amount', pattern: /(십|백|천|만|억)\s?원|[일이삼사오육칠팔구십]\s?(학기|개월|년차)/ },
  // 변화 표현 (V1 확정 2026-09-28) — "너무/처음/결국/막상/원래"는 흔한 토로·서술 어휘라 신호에서 뺐다
  // ("요즘 너무 피곤해", "처음엔 괜찮았는데" 같은 추상 발화가 FAIL하던 false positive).
  { label: 'change_marker', pattern: /아직|벌써|갑자기|하필|유독|(^|\s)또(\s|$)/ },
  // 미완료 / 멈춤 / 어긋남
  {
    label: 'unfinished_or_mismatch',
    pattern: /(안|못)\s?했|(안|못)\s?하고|려고\s?했는데|줄\s?알았|는데도|접었|그만뒀|그만 뒀|포기했|미뤘|취소했|까먹|잊어버렸|놓쳤/,
  },
  // 동물 (V1 확정) — 단독으로 strong signal. 일반 관계어(친구/엄마/동생 등)는 단독으로 발동하지 않도록 신호에서 뺐다.
  // "고양이가 소파를 다 긁어놨어", "고양이 때문에 잠을 못 잤어" 같은 실제 사건을 놓치지 않는 게 우선이고,
  // 그 대가로 "고양이가 좋더라" 같은 감상도 걸린다(검증된 잔여 FP).
  { label: 'animal', pattern: /고양이|강아지/ },
  // 영문 고유명사/브랜드 (2글자 이상)
  { label: 'latin_name', pattern: /[A-Za-z]{2,}/ },
];

// 공백 제외 이 길이 미만이면 신호가 있어도 강제하지 않는다 ("또 라면" 같은 한마디).
const SPECIFIC_DETAIL_MIN_LENGTH = 8;

// 이 규칙을 적용하는 발화 의도. 질문/부탁 계열은 "먼저 답"이 우선이라 제외한다.
const OPPORTUNITY_REQUIRED_INTENTS = new Set(['statement', 'mixed', 'vent']);

// 원문에서 발견된 구체성 신호 라벨 목록 (없으면 빈 배열). 테스트/로그용으로 export.
export function detectSpecificDetails(transcript: string): string[] {
  if (!transcript) return [];
  if (transcript.replace(/\s/g, '').length < SPECIFIC_DETAIL_MIN_LENGTH) return [];
  return SPECIFIC_DETAIL_SIGNALS.filter((s) => s.pattern.test(transcript)).map((s) => s.label);
}

// ---- RULE 19 — 숫자 tail anchor가 앞 대상을 잘라먹은 경우 (2026-09-29) ----
//
// 실제 확인된 두 실패만 잡는 최소 안전장치다(anchor 품질 시스템이 아니다):
//   "지난주에 제주도 항공권을 17만원에 봤어." → anchor "17만원에 봤어"  → response에서 "항공권"이 사라짐
//   "회사에서 발표를 3번이나 다시 했어."      → anchor "3번이나 다시 했어" → response에서 "발표"가 사라짐
// anchor가 숫자/수량으로 시작하고, 원문에서 바로 앞 어절이 을/를로 끝나면 그 어절(잘린 대상)을 돌려준다.
// 원문 위치를 정확히 못 찾거나 문장 구조가 애매하면 판단하지 않는다(null).

// anchor 맨 앞의 숫자/수량 표현. 한글 수사는 "이번", "일단" 같은 일반 단어와 헷갈리지 않도록
// 큰 단위(십/백/천/만/억)가 들어간 금액·수이거나, 고유어 수사 + 단위일 때만 인정한다.
const NUMERIC_HEAD =
  /^(?:[0-9０-９]|[일이삼사오육칠팔구]?[십백천만억][일이삼사오육칠팔구십백천만억]*\s?(?:원|번|개|명|학기|개월|년|잔|시간|살|마리)|(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|몇)\s?(?:번|개|명|마리|살|시간|달|주|학기|잔|권|벌|장|판|그릇|곳|군데))/;

const EDGE_PUNCT = /^[\s"'“”‘’「」.,!?？~…]+|[\s"'“”‘’「」.,!?？~…]+$/g;

// 반환값: 잘린 대상 어절(예: "항공권을", "발표를") 또는 null.
export function detectTruncatedAnchorHead(anchorQuote: string | null | undefined, transcript: string | null | undefined): string | null {
  if (!anchorQuote || !transcript) return null;
  const anchor = anchorQuote.replace(EDGE_PUNCT, '').replace(/\s+/g, ' ');
  if (!anchor || !NUMERIC_HEAD.test(anchor)) return null;

  const text = transcript.replace(/\s+/g, ' ');
  const idx = text.indexOf(anchor);
  if (idx <= 0) return null; // 원문에서 정확한 위치를 못 찾았거나 문장 맨 앞이면 판단하지 않는다
  if (text.indexOf(anchor, idx + 1) !== -1) return null; // 같은 구간이 두 번 나오면 애매 → 판단하지 않는다
  if (text[idx - 1] !== ' ') return null; // 어절 중간에서 시작한 anchor는 애매 → 판단하지 않는다

  const before = text.slice(0, idx - 1);
  const prevWord = before.slice(before.lastIndexOf(' ') + 1);
  // 문장부호로 끊긴 경우("항공권을, 17만원에")나 한글/영숫자가 아닌 어절은 애매 → 판단하지 않는다
  if (!/^[가-힣A-Za-z0-9]{2,}$/.test(prevWord)) return null;
  return /[을를]$/.test(prevWord) ? prevWord : null;
}

// "항공권을" → "항공권". response 쪽은 조사 차이를 허용하기 위해 핵심 어절만 본다.
function truncatedHeadCore(head: string): string {
  return head.replace(/[을를]$/, '');
}

// ---- 1차 수정 규칙 유틸 ----

// 응답의 모든 문장이 질문인가 ("제주도에서 제일 해보고 싶은 게 뭐야?" 처럼 되묻기만 한 응답).
export function isQuestionOnlyResponse(response: string): boolean {
  const sentences = splitSentences(response);
  if (sentences.length === 0) return false;
  return sentences.every((s) => /[?？]\s*$/.test(s));
}

// reminder_request 응답이 "무엇을 언제 알려달라는지"를 실제로 받아서 확인했는가.
// 알려달라는 행위 자체를 언급했거나, 사용자 질문 원문과 2글자 조각이 2개 이상 겹치면 인정한다.
// ("지금은 뭐가 제일 걸려?" 같은 generic 되묻기를 잡기 위한 최소 검사)
export function acknowledgesReminder(response: string, userQuestion: string | null | undefined): boolean {
  if (/(알려|그때|챙겨|잊지\s*않|까먹지\s*않|말해\s*줄|찔러)/.test(response)) return true;
  if (!userQuestion) return false;
  const r = normalizeLoose(response);
  const q = normalizeLoose(userQuestion);
  let hit = 0;
  for (let i = 0; i < q.length - 1; i++) if (r.includes(q.slice(i, i + 2))) hit++;
  return hit >= 2;
}

// 원하는/관심 있는 것처럼 묻거나 권하는 표현
const DESIRE_MARKERS = /(하고\s*싶|가고\s*싶|해\s*보고\s*싶|보고\s*싶|먹고\s*싶|좋아|관심|끌려|끌리|어때|뭐\s*하|뭐\s*할|가\s*볼|가\s*봐|추천)/;
// 부정을 유지하고 있다는 표시 (이게 있으면 부정 대상을 언급해도 괜찮다)
const NEGATION_MARKERS = /(싫|말고|빼|안\s*가|안\s*갈|제외|아니야|아닌|별로|없|말자|패스)/;

// 사용자가 싫다고 한 대상을, 부정 표시 없이 "원하는 것"처럼 묻거나 권한 문장이 있는가.
export function findNegativeStanceAsInterest(response: string, negativeTargets: string[]): string | null {
  if (!negativeTargets || negativeTargets.length === 0) return null;
  for (const sentence of splitSentences(response)) {
    const ns = normalizeLoose(sentence);
    for (const target of negativeTargets) {
      const nt = normalizeLoose(target);
      if (!nt || !ns.includes(nt)) continue;
      if (DESIRE_MARKERS.test(sentence) && !NEGATION_MARKERS.test(sentence)) return sentence;
    }
  }
  return null;
}

function isRepeatedQuestion(previous: string, current: string): boolean {
  if (!previous || !current) return false;
  return normalizeForRepeatCheck(previous) === normalizeForRepeatCheck(current);
}

// 같은 memory_unit_id를 연속으로 다시 쓰면서, 문장까지 사실상 동일한(한쪽이 다른 쪽을 거의
// 그대로 포함하는) 명백한 반복만 잡는다. 완전히 다른 각도로 다시 꺼낸 경우(예: 새로운 현재
// 상황과 새롭게 연결한 경우)는 이 함수가 true를 반환하지 않는다 — 그건 STEP 5가 이미 권장하는
// "다른 각도" 접근이지 반복이 아니기 때문이다(스펙 16절).
function hasNearIdenticalWording(a: string, b: string): boolean {
  const na = normalizeForRepeatCheck(a);
  const nb = normalizeForRepeatCheck(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= 6 && longer.includes(shorter);
}

// STEP 7 — REPEATED_MEMORY(RULE 13)와 완전히 동일한 조건을 재사용 가능한 함수로 뽑아낸 것이다.
// 새로운 판정 로직이 아니다. validateResponse()의 RULE 13과 generateResponse()의
// repeated_memory_detected 로깅이 이 함수 하나를 공유하므로, 두 곳의 판정이 어긋날 수 없다.
export function computeRepeatedMemoryDetected(
  memoryUnitIdUsed: number | null,
  response: string,
  previousResponse: ValidationContext['previousResponse']
): boolean {
  return (
    previousResponse !== null &&
    memoryUnitIdUsed !== null &&
    previousResponse.memoryUnitIdUsed === memoryUnitIdUsed &&
    hasNearIdenticalWording(previousResponse.response, response)
  );
}

// STEP 6 — rule-based validation 본체. 새 GPT 호출을 전혀 하지 않는다. 이미 만들어진
// ResponseResult(validation 3개 필드 제외)와 이번 턴의 context(후보 memory id 집합, 직전 턴
// 정보)만으로 판정한다. 한 응답에서 여러 규칙이 동시에 위반될 수 있으므로 실패 사유는 배열로
// 전부 모은다(스펙 3절 — "가능하면 모든 failure reason을 수집한다").
type ValidatedFields = 'response' | 'response_strategy' | 'question_present' | 'memory_unit_id_used' | 'memory_relevance' | 'conversation_opportunity' | 'answered_user_question';
type ValidatedResult = Pick<ResponseResult, ValidatedFields>;

export function validateResponse(result: ValidatedResult, context: ValidationContext): ValidationResult {
  const reasons: ValidationFailureReason[] = [];
  const response = typeof result.response === 'string' ? result.response : '';

  // RULE 1 — EMPTY_RESPONSE
  if (response.trim().length === 0) {
    reasons.push('EMPTY_RESPONSE');
  }

  const sentences = splitSentences(response);
  const questionMarkCount = (response.match(/[?？]/g) ?? []).length;
  const hasQuestionMark = questionMarkCount > 0;

  // RULE 2 — RESPONSE_TOO_LONG
  if (sentences.length >= 6 || response.length > 500) {
    reasons.push('RESPONSE_TOO_LONG');
  }

  // RULE 3 — TOO_MANY_QUESTIONS
  if (questionMarkCount >= 2) {
    reasons.push('TOO_MANY_QUESTIONS');
  }

  // RULE 4 — QUESTION_STRATEGY_WITHOUT_QUESTION
  if (result.response_strategy === 'QUESTION' && result.question_present !== true && !hasQuestionMark) {
    reasons.push('QUESTION_STRATEGY_WITHOUT_QUESTION');
  }

  // RULE 5 — GENERIC_QUESTION
  if (isGenericQuestion(response)) {
    reasons.push('GENERIC_QUESTION');
  }

  // 2026-10-19 — 사용자가 지금 대화를 마치려는 말("먼저 잘게")을 했는가 / 질문을 해달라고 했는가.
  // 원문만 보고 결정적으로 판정한다(명백한 경우만). transcript가 없는 예전 호출은 둘 다 false → 기존 동작 그대로.
  const closingSignal = detectClosingSignal(context.transcript);
  const questionRequested = detectQuestionRequest(context.transcript);

  // RULE 6 — CLOSING_RESPONSE
  // 2026-10-19 — 사용자가 대화를 마치려는 턴에서는 "잘 자." 같은 닫는 말이 정답이다. 그때만 적용하지 않는다.
  if (!closingSignal && isClosingResponse(response)) {
    reasons.push('CLOSING_RESPONSE');
  }

  // RULE 7 — GENERIC_ENCOURAGEMENT
  if (isGenericEncouragement(response)) {
    reasons.push('GENERIC_ENCOURAGEMENT');
  }

  // RULE 30 — GENERIC_TAIL (2026-10-21). 구체적인 반응 뒤에 "~하면 좋겠어" / "그게 중요한 걸" 같은 내용 없는
  // 평가·바람 문장으로 정리하는 꼬리. 대화를 마치려는 턴(closingSignal)에는 적용하지 않는다.
  if (!closingSignal && isGenericTail(response, context.transcript ?? null)) {
    reasons.push('GENERIC_TAIL');
  }

  // RULE 8 — MEMORY_RELEVANCE_MISMATCH (스펙 11절의 5개 조건 전부)
  // P0 — + 실제로 쓴 기억의 relation이 "꺼낼 가치가 있는 관계"(WORTHY_MEMORY_RELATIONS)여야 한다.
  //      same_topic_only("오늘 식물 물 줬다" ↔ "식물 키우는 게 재밌다")는 관련은 있어도 꺼내지 않는다.
  //      relation이 없는 예전 형식 객체(테스트 등)는 이 추가 검사를 건너뛴다.
  if (result.memory_unit_id_used !== null) {
    const id = result.memory_unit_id_used;
    const usedItem = result.memory_relevance.find((r) => r.memory_unit_id === id && r.relevance === 'YES');
    const relevanceYes = usedItem !== undefined;
    const validId = context.validMemoryUnitIds.has(id);
    const oppMatches =
      result.conversation_opportunity.source === 'memory' &&
      result.conversation_opportunity.strength === 'STRONG' &&
      result.conversation_opportunity.memory_unit_id === id;
    const relationWorthy = !usedItem?.relation || WORTHY_MEMORY_RELATIONS.has(usedItem.relation);
    if (!validId || !relevanceYes || !oppMatches || !relationWorthy) {
      reasons.push('MEMORY_RELEVANCE_MISMATCH');
    }
  }

  // RULE 9 — OPPORTUNITY_MEMORY_MISMATCH (스펙 12절 Case A~D)
  if (result.memory_unit_id_used !== null) {
    const opp = result.conversation_opportunity;
    if (
      opp.type === 'none' || // Case A
      opp.strength === 'WEAK' || // Case B
      opp.strength === 'NONE' ||
      opp.source === 'current_turn' || // Case C
      opp.source === 'none' // Case D
    ) {
      reasons.push('OPPORTUNITY_MEMORY_MISMATCH');
    }
  }

  // RULE 10 — CURRENT_TURN_MEMORY_MISMATCH (스펙 13절)
  if (result.memory_unit_id_used !== null && result.conversation_opportunity.source === 'current_turn') {
    reasons.push('CURRENT_TURN_MEMORY_MISMATCH');
  }

  // RULE 11 — INVALID_MEMORY_REFERENCE (스펙 14절 — string으로 온 id를 number로 자동 변환해서
  // 통과시키지 않는다. typeof 체크 자체가 그 방어다.)
  if (result.memory_unit_id_used !== null) {
    if (
      typeof result.memory_unit_id_used !== 'number' ||
      !context.validMemoryUnitIds.has(result.memory_unit_id_used)
    ) {
      reasons.push('INVALID_MEMORY_REFERENCE');
    }
  }

  // RULE 12 — REPEATED_QUESTION (스펙 15절)
  if (context.previousResponse && isRepeatedQuestion(context.previousResponse.response, response)) {
    reasons.push('REPEATED_QUESTION');
  }

  // RULE 13 — REPEATED_MEMORY (스펙 16절 — 같은 memory_unit_id + 명백히 동일한 문장일 때만)
  // STEP 7에서 computeRepeatedMemoryDetected()로 뽑아낸 것과 동일한 조건이다.
  if (computeRepeatedMemoryDetected(result.memory_unit_id_used, response, context.previousResponse)) {
    reasons.push('REPEATED_MEMORY');
  }

  // RULE 14 — STRATEGY_OUTPUT_MISMATCH (스펙 17절 — MEMORY_REFERENCE의 명백한 불일치만 검사한다.
  // QUESTION 불일치는 이미 RULE 4가 QUESTION_STRATEGY_WITHOUT_QUESTION으로 잡는다.)
  if (
    result.response_strategy === 'MEMORY_REFERENCE' &&
    result.memory_unit_id_used === null &&
    mentionsPastMemoryLikePhrase(response)
  ) {
    reasons.push('STRATEGY_OUTPUT_MISMATCH');
  }

  // RULE 15 — QUESTION_NOT_ANSWERED (1차 수정). 사용자가 질문/부탁/의견 요청을 했는데
  // (a) 모델 스스로 답하지 않았다고 보고했거나, (b) 응답이 질문 문장으로만 이루어져 있으면 실패.
  // reminder_request는 "토요일 아침에 알려달라는 거지?" 같은 확인 질문 하나가 정상 응답이므로 (b) 대신
  // "요청을 받아서 확인했는가"(acknowledgesReminder)를 본다.
  if (context.utteranceIntent) {
    const needs = intentNeedsAnswer(context.utteranceIntent as UtteranceIntent, context.userQuestion ?? null);
    if (needs) {
      const selfReportedNo = result.answered_user_question === false;
      const notAnswered =
        context.utteranceIntent === 'reminder_request'
          ? !acknowledgesReminder(response, context.userQuestion)
          : isQuestionOnlyResponse(response);
      // 2026-10-19 — 사용자가 "질문 하나 해줘"처럼 질문 자체를 요청했으면, 질문을 던지는 게 곧 답이다.
      // 이때는 질문만으로 된 응답을 막지 않고, 대신 실제로 질문을 했는지(물음표)만 본다. 모델 자기 보고는 보지 않는다.
      if (questionRequested) {
        if (!hasQuestionMark) reasons.push('QUESTION_NOT_ANSWERED');
      } else if (selfReportedNo || notAnswered) {
        reasons.push('QUESTION_NOT_ANSWERED');
      }
    }
  }

  // RULE 16 — NEGATIVE_STANCE_AS_INTEREST (1차 수정). "제주도는 싫고" → "제주도에서 뭐 하고 싶어?" 같은 뒤집기.
  if (context.negativeTargets && findNegativeStanceAsInterest(response, context.negativeTargets)) {
    reasons.push('NEGATIVE_STANCE_AS_INTEREST');
  }

  // RULE 17 — ANCHOR_NOT_IN_TRANSCRIPT (1차 수정). anchor_quote는 원문 복사여야 한다.
  // 원문에 없는 "그럴듯한 주제"를 붙잡았다고 기록하는 것을 막는다.
  const anchorQuote = result.conversation_opportunity?.anchor_quote ?? null;
  if (context.transcript && anchorQuote && !isGroundedIn(anchorQuote, context.transcript)) {
    reasons.push('ANCHOR_NOT_IN_TRANSCRIPT');
  }

  // RULE 18 — SPECIFIC_CURRENT_TURN_WITHOUT_OPPORTUNITY (2026-09-28).
  // statement/mixed/vent 발화에 구체적인 디테일(숫자·금액·변화/강조 표현·미완료·특정 대상 등)이 있는데
  // opportunity를 none으로 냈으면 실패 → 기존 재생성 1회 경로로 넘어가 "다시 골라보게" 한다.
  // source='current_turn'인데 type='none'으로 온 경우도 사실상 none이라 같이 본다.
  // 구체성 신호가 없는 추상적 발화("그냥 요즘 좀 그렇다")는 none을 그대로 허용한다.
  // 2026-10-19 — 대화를 마치려는 턴에는 디테일을 붙잡으라고 재생성시키지 않는다(재생성이 질문을 붙여 대화를 늘린다).
  if (!closingSignal && context.transcript && context.utteranceIntent && OPPORTUNITY_REQUIRED_INTENTS.has(context.utteranceIntent)) {
    const opp = result.conversation_opportunity;
    const effectivelyNone = !opp || opp.source === 'none' || opp.type === 'none';
    if (effectivelyNone && detectSpecificDetails(context.transcript).length > 0) {
      reasons.push('SPECIFIC_CURRENT_TURN_WITHOUT_OPPORTUNITY');
    }
  }

  // RULE 19 — ANCHOR_TRUNCATED_HEAD (2026-09-29).
  // 숫자/수량으로 시작하는 anchor가 원문의 바로 앞 대상(…을/를)을 잘랐고, 최종 response에서도 그 대상이
  // 사라졌을 때만 실패 → 기존 재생성 1회 경로. response에 대상이 살아 있으면(조사 차이 허용) 통과한다.
  const truncatedHead = detectTruncatedAnchorHead(result.conversation_opportunity?.anchor_quote, context.transcript);
  if (truncatedHead) {
    const core = normalizeLoose(truncatedHeadCore(truncatedHead));
    if (core && !normalizeLoose(response).includes(core)) {
      reasons.push('ANCHOR_TRUNCATED_HEAD');
    }
  }

  // RULE 23 — CLOSING_SIGNAL_WITH_QUESTION (2026-10-19).
  // 사용자가 대화를 마치려는데, 답해야 할 질문/부탁도 없고 질문을 해달라고 하지도 않았는데 질문을 붙였다.
  // 답해야 할 질문이 있는 턴("먼저 잘게. 근데 내일 비 와?")은 기존 RULE 15가 다룬다 — 이 규칙은 건드리지 않는다.
  if (closingSignal && hasQuestionMark && !questionRequested) {
    const mustAnswer = context.utteranceIntent
      ? intentNeedsAnswer(context.utteranceIntent as UtteranceIntent, context.userQuestion ?? null)
      : false;
    if (!mustAnswer) reasons.push('CLOSING_SIGNAL_WITH_QUESTION');
  }

  // ---- 2026-10-20 (2차) — 1차 실측(LIVE) 회귀 대응 ----
  // RULE 24 — UNCONFIRMED_REMINDER_PROMISE (HARD). 응답 엔진은 알림이 실제로 예약됐는지 알 수 없다:
  // reminder는 사용자가 확인 화면에서 확정해야 commitment_memory에 저장되고(confirmCommitment), 그 결과는 이 경로로 들어오지 않는다.
  // 그래서 "알려달라"는 이번 턴에서만, 물음표 없는 약속 문장("그때 알려줄게!")을 막는다. 확인 질문("그때 알려달라는 거지?")은 통과.
  if (context.utteranceIntent === 'reminder_request' && findUnconfirmedReminderPromise(response)) {
    reasons.push('UNCONFIRMED_REMINDER_PROMISE');
  }

  // RULE 25 — EMOTION_PRESUMED (SOFT). 사용자가 말하지 않은 "지난 감정"을 단정("놀랐겠다", "힘들었겠다").
  // 사용자가 그 감정을 직접 말했으면("답답했어" → "답답했겠다") 통과. 사건 자체에 대한 반응("놀라운 일이네")은 대상이 아니다.
  if (context.transcript && findPresumedEmotion(response, context.transcript)) {
    reasons.push('EMOTION_PRESUMED');
  }

  // RULE 26 — CHOICE_DROPPED (SOFT). 사용자가 "A 먹을까 B 먹을까"처럼 직접 낸 선택지를 응답이 하나도 언급하지 않았다.
  // 둘 다 반복하라는 규칙이 아니다 — 최소 하나라도 이름으로 붙잡으면 통과("떡볶이 쪽이 나아 보여").
  if (context.transcript) {
    const options = extractExplicitOptions(context.transcript);
    if (options.length >= 2 && !options.some((o) => normalizeLoose(response).includes(normalizeLoose(o)))) {
      reasons.push('CHOICE_DROPPED');
    }
  }

  // RULE 27 — MEMORY_WISH_AS_PLAN (SOFT). 실제로 쓴 기억의 원문이 바람/가정("~하면 ~하고 싶다")인데 응답이 "계획/하기로 했다"로 말함.
  // 원문을 받을 수 있을 때(context.memoryTexts)만 검사한다. 기억 내용 자체의 정확성(장소·대상이 맞는지)은 검사하지 않는다.
  if (result.memory_unit_id_used !== null && context.memoryTexts) {
    const memText = context.memoryTexts[result.memory_unit_id_used];
    if (memText && isWishAsPlan(memText, response)) reasons.push('MEMORY_WISH_AS_PLAN');
  }

  // ---- 작업 B (2026-10-20) — 의견 요청 턴에서만 검사한다. 다른 대화에는 의견을 요구하지 않는다. ----
  // RULE 28 — OPINION_NOT_GIVEN (SOFT): 판단·추천 표현이 하나도 없다. 예) "20만 원은 진짜 부담스럽네. … 나도 한 번 해보고 싶긴 한데, 고민이네."
  // RULE 29 — FIRST_PERSON_PRONOUN (SOFT): 참견이가 "나도/내가/나라면"으로 자기 얘기를 한다(대명사 규칙 위반).
  if (context.utteranceIntent === 'opinion_request') {
    if (!hasOpinionJudgment(response)) reasons.push('OPINION_NOT_GIVEN');
    if (findFirstPersonPronoun(response)) reasons.push('FIRST_PERSON_PRONOUN');
  }

  // ---- 2026-10-11 기억 선택 실패 3종 (SOFT — SOFT_VALIDATION_REASONS 참고) ----
  // 실데이터(2026-10-08~11)에서 확인된 실패만 잡는다. 기억을 "쓰라고" 강제하지 않는다 —
  // (a) 판단을 건너뛴 것, (b) 스스로 고른 기억을 버린 것, (c) 꺼낼 가치가 있다고 스스로 판정한 기억을 두고
  // 말하지 않은 기분/생각을 캐물은 것. 셋 다 모델 자신의 판단과 출력이 어긋난 경우다.
  const candidateCount = context.validMemoryUnitIds.size;
  const needsAnswerNow = context.utteranceIntent
    ? intentNeedsAnswer(context.utteranceIntent as UtteranceIntent, context.userQuestion ?? null)
    : false;

  // RULE 20 — MEMORY_RELEVANCE_SKIPPED: 후보가 있는데 하나도 판정하지 않았다.
  // 예) "공간 계약한 지 벌써 2년" + 후보 1·2위 "11월 말이면 2년인데 만족스럽지 못한 결과치" → memory_relevance=[]
  if (candidateCount > 0 && result.memory_relevance.length === 0) {
    reasons.push('MEMORY_RELEVANCE_SKIPPED');
  }

  // RULE 21 — SELECTED_MEMORY_NOT_USED: opportunity로 기억을 STRONG하게 골라놓고 response에선 안 썼다.
  // 예) "돈 모아야 돼 식물샵 하고 싶거든" → source=memory(107) 선택 → response는 "게으름이 아니라 잠시 멈춘 거 아닐까?"
  const opp = result.conversation_opportunity;
  if (opp && opp.source === 'memory' && opp.strength === 'STRONG' && result.memory_unit_id_used === null) {
    reasons.push('SELECTED_MEMORY_NOT_USED');
  }

  // RULE 22 — FEELING_TARGET_OVER_MEMORY: 질문/부탁 턴이 아니고, 꺼낼 가치가 있는 관계(worthy relation)로 판정한
  // 기억이 있는데 opportunity는 기억이 아닌 쪽에서 "기분/느낌/생각"을 묻는 걸로 골랐다.
  // 감정 질문 자체를 금지하는 규칙이 아니다 — worthy 기억이 없으면 이 규칙은 아무것도 하지 않는다.
  if (!needsAnswerNow && opp && opp.source !== 'memory' && isFeelingTarget(opp.question_target)) {
    const hasWorthyMemory = result.memory_relevance.some(
      (r) => r.relevance === 'YES' && !!r.relation && WORTHY_MEMORY_RELATIONS.has(r.relation)
    );
    if (hasWorthyMemory) reasons.push('FEELING_TARGET_OVER_MEMORY');
  }

  return { passed: reasons.length === 0, reasons };
}

// ---- 2026-10-20 (2차) 검사 유틸 — 전부 "명백한 경우만" 잡는다 ----

// 예약을 끝낸 것처럼 약속하는 표현 (물음표로 끝나는 문장 = 제안/확인 질문은 제외)
const REMINDER_PROMISE_RE =
  /(알려\s*줄게|알려\s*드릴게|챙겨\s*줄게|깨워\s*줄게|문자\s*할게|전화\s*할게|연락\s*할게|알람\s*(맞춰|설정해|해)\s*(놨|놓을게|둘게|줄게|뒀)|예약\s*(했어|해\s*놨|해\s*둘게|해\s*뒀))/;
export function findUnconfirmedReminderPromise(response: string): string | null {
  for (const s of splitSentences(response)) {
    if (/[?？]\s*$/.test(s)) continue;
    if (REMINDER_PROMISE_RE.test(s)) return s;
  }
  return null;
}

// "지난 감정" 추정형(과거형 + 겠다/겠네/겠어/겠지). 현재형 추측("힘들겠다")은 상황 평가에 가까워 잡지 않는다(오탐 위험).
// 각 감정은 사용자가 원문에서 직접 말했는지 볼 어간을 함께 갖는다.
const PRESUMED_EMOTIONS: { re: RegExp; stem: RegExp }[] = [
  { re: /놀랐겠/, stem: /놀라|놀랐|놀람|깜짝/ },
  { re: /힘들었겠/, stem: /힘들|힘드/ },
  { re: /고생했겠/, stem: /고생/ },
  { re: /속상했겠/, stem: /속상/ },
  { re: /서운했겠/, stem: /서운/ },
  { re: /섭섭했겠/, stem: /섭섭/ },
  { re: /피곤했겠/, stem: /피곤/ },
  { re: /지쳤겠/, stem: /지치|지쳐|지쳤/ },
  { re: /외로웠겠/, stem: /외로/ },
  { re: /무서웠겠/, stem: /무서|무섭/ },
  { re: /불안했겠/, stem: /불안/ },
  { re: /당황했겠/, stem: /당황/ },
  { re: /짜증났겠/, stem: /짜증/ },
  { re: /화났겠/, stem: /화나|화났|화가/ },
  { re: /답답했겠/, stem: /답답/ },
  { re: /긴장했겠/, stem: /긴장/ },
  { re: /억울했겠/, stem: /억울/ },
];
export function findPresumedEmotion(response: string, transcript: string): string | null {
  for (const e of PRESUMED_EMOTIONS) {
    const m = response.match(e.re);
    if (m && !e.stem.test(transcript)) return m[0];
  }
  return null;
}

// "라면 먹을까 떡볶이 먹을까" → ["라면", "떡볶이"]. 같은 꼴(…ㄹ까)이 두 번 이상 나올 때만 선택지로 본다.
const OPTION_RE = /(\S+?)(?:을|를|에|로|으로)?\s+(?:먹을까|갈까|할까|살까|볼까|입을까|탈까|고를까)/g;
const OPTION_STOP = new Set(['뭐', '뭘', '어디', '그냥', '이거', '저거', '그거', '뭐라도', '좀', '또', '다시']);
export function extractExplicitOptions(transcript: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(OPTION_RE.source, 'g');
  while ((m = re.exec(transcript)) !== null) {
    const w = m[1].replace(/^[,.\s]+|[,.\s]+$/g, '');
    if (w.length >= 1 && !OPTION_STOP.has(w) && !out.includes(w)) out.push(w);
  }
  return out;
}

// 기억 원문이 바람/가정이고(확정 표지 없음), 응답이 그걸 계획·결정·약속으로 말했는가.
const WISH_MARK = /(싶|면\s*좋겠|하면|될까|볼까|까\s*생각)/;
const PLAN_MARK_IN_MEMORY = /(하기로|할\s*거|할거|예정|계획|약속|정했)/;
const PLAN_WORD_IN_RESPONSE = /(계획|하기로\s*(했|한)|예정이|약속(했|한))/;
export function isWishAsPlan(memoryText: string, response: string): boolean {
  return WISH_MARK.test(memoryText) && !PLAN_MARK_IN_MEMORY.test(memoryText) && PLAN_WORD_IN_RESPONSE.test(response);
}

// ---- 작업 B 유틸 ----
// 판단·추천 표현 (잠정적 의견 포함). "대세인 것 같아", "부담스럽네"처럼 관찰·감상만 있는 문장은 판단으로 보지 않는다.
const OPINION_JUDGMENT_RES: RegExp[] = [
  /(좋을|나을|낫|괜찮을|충분할|아까울|비쌀|비싼|무리일|별로일|나쁘지\s*않을|아닐|과할|부족할|애매할)\s*(것|거)\s*같/,
  /(는|은)\s*(게|것이|편이)\s*(좋|낫|나아|나을|괜찮)/,
  /(할|볼|가볼|해볼|고민해볼|생각해볼|들어볼)\s*만(해|하|한|은)/,
  /(쪽이|편이)\s*(나아|낫|좋|더\s*나|맞)|나아\s*보여|낫겠|나을\s*듯|좋을\s*듯|추천/,
  /(안\s*가도|안\s*해도|굳이\s*안|가도\s*될|해도\s*될|안\s*가는\s*게|안\s*하는\s*게)/,
  // 짧은 단정형 판단("GPT로 충분해", "20만 원이면 패스", "비추")
  /(충분해|충분하지|아까워|아깝다|과해|패스|비추|말리고\s*싶|권하고\s*싶|가\s*봐도\s*(돼|괜찮)|해\s*봐도\s*(돼|괜찮))/,
];
export function hasOpinionJudgment(response: string): boolean {
  return OPINION_JUDGMENT_RES.some((re) => re.test(response));
}
// 금지된 1인칭. 따옴표 안(사용자 말 인용)은 보지 않는다.
const FIRST_PERSON_RE = /(^|[\s,.!?~])(나는|나도|내가|나라면|나한테|나랑|난|내\s*생각엔?)(?=[\s,.!?~]|$)/;
export function findFirstPersonPronoun(response: string): string | null {
  const unquoted = response.replace(/["“][^"”]*["”]|['‘][^'’]*['’]/g, ' ');
  const m = unquoted.match(FIRST_PERSON_RE);
  return m ? m[2] : null;
}

// question_target이 사건·결정·행동이 아니라 "기분/느낌/생각" 자체를 묻는가.
// 예) "고양이랑 밖에 나가면 어떤 기분인지", "시간이 이렇게 빠르게 지나간 것에 대한 생각"
const FEELING_TARGET_RE = /(기분|느낌|느꼈|느끼|감정|심정|마음이|에\s*대한\s*생각|든\s*생각|어떤\s*생각|생각이\s*드)/;
export function isFeelingTarget(questionTarget: string | null | undefined): boolean {
  return !!questionTarget && FEELING_TARGET_RE.test(questionTarget);
}

// ==================================================
// STEP 5-1 (초안) — Answerability: "사용자가 무엇에 답해야 하는지 모르는 질문" 탐지
// ==================================================
// ⚠️ 아직 validateResponse()에서 호출하지 않는다. scripts/eval-answerability.ts의 평가 세트로
// 오탐(false positive)이 0인지 확인하면서 다듬은 뒤에, 별도 단계에서 연결 여부를 결정한다.
//
// 설계 원칙 — "명백한 경우만" 잡는 보수적인 detector:
// - 문장 길이, 지시어 존재, "어때" 포함, 물음표 유무만으로는 절대 실패시키지 않는다.
// - 질문 문장이 (연결어·지시어를 걷어내면) "평가형 서술어"나 "꼬리 주제어"만 남는 경우,
//   또는 "궁금하다" 앞에 궁금한 대상이 없는 경우만 본다.
// - 그마저도 같은 문장의 앞 절이나 바로 앞 문장이 대상을 제공하면 통과시킨다
//   (예: "예전에 아메리카노 매일 마신다고 했잖아. 요즘도 그래?"). 앞 내용이 "~것 같던데" 같은
//   추측이면 대상을 제공한 것으로 보지 않는다 (가리키는 것이 사용자의 말이 아니라 모델의 추측이므로).

export type UnanswerablePattern =
  | 'PRONOUN_EVALUATIVE' // "그거 어때?", "그건 어떤 것 같아?", "그거 아직도 그래?"
  | 'BARE_TOPIC_TAIL' // "그래서 요즘은?", "그건?"
  | 'EMPTY_CURIOSITY'; // "그게 궁금한데?", "좀 궁금하네.", "회사 얘기 들으니까 좀 궁금한데?"

export interface UnanswerableDetection {
  pattern: UnanswerablePattern;
  sentence: string;
}

const ANSWERABILITY_LEADING_CONNECTORS = ['그래서', '근데', '그럼', '그러면', '아무튼', '암튼', '그리고', '그래도'];
const ANSWERABILITY_DEMONSTRATIVES = [
  '그런 건', '그런 거', '그런 게', '그런건', '그런거', '그런게',
  '그거', '그건', '그게', '그것', '이거', '이건', '이게', '저거', '저건',
];
const ANSWERABILITY_EVALUATIVE_PREDICATES = [
  '어때', '어떤 것 같아', '어떤 거 같아', '어떻게 생각해', '어떤 느낌이야',
  '아직도 그래', '요즘도 그래', '여전히 그래', '지금도 그래',
];
const ANSWERABILITY_BARE_TOPICS = ['그건', '그거는', '그게', '이건', '요즘은', '지금은', '그다음은', '그 다음은', '너는', '넌', '그런 건'];
const ANSWERABILITY_FILLERS = ['좀', '조금', '되게', '진짜', '그냥', '뭔가', '괜히', '살짝', '약간'];
// 앞 내용이 이렇게 끝나면 "대상을 제공했다"고 보지 않는다 — 사용자의 말이 아니라 사용자에 대한 모델의
// 추측/관찰("~것 같던데", "~보니까")이기 때문. "~것 같은데"(모델이 주제에 대한 자기 의견을 말한 뒤 묻는 경우,
// 예: "영향이 클 것 같은데, 어떻게 생각해?")는 질문 대상이 문장에 드러나 있으므로 여기에 넣지 않는다
// (실제 운영 응답에서 오탐으로 확인됨).
const ANSWERABILITY_SPECULATIVE_ENDING = /(것 같던데|거 같던데|던데|보니까|보니)$/;
// "궁금하다" 앞이 이렇게 끝나면 그건 궁금한 "대상"이 아니라 "계기"다 (예: "회사 얘기 들으니까 좀 궁금한데").
const ANSWERABILITY_REASON_ENDING = /(니까|는데|던데|보니|어서|아서|해서|길래)$/;
const ANSWERABILITY_CURIOUS_TAIL = /^(.*?)\s*궁금(한데|하네|해|하다|했어|해져|하긴 해|하긴 하네)?$/;

function normalizeAnswerabilityClause(s: string): string {
  return s
    .replace(/[ㅋㅎㅠㅜ]+/g, ' ')
    .replace(/[?？.!~…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingConnectors(s: string): string {
  let out = s;
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of ANSWERABILITY_LEADING_CONNECTORS) {
      if (out === c) return '';
      if (out.startsWith(c + ' ')) {
        out = out.slice(c.length + 1).trim();
        changed = true;
      }
    }
  }
  return out;
}

function stripLeadingDemonstrative(s: string): { rest: string; hadDemonstrative: boolean } {
  for (const d of ANSWERABILITY_DEMONSTRATIVES) {
    if (s === d) return { rest: '', hadDemonstrative: true };
    if (s.startsWith(d + ' ')) return { rest: s.slice(d.length + 1).trim(), hadDemonstrative: true };
  }
  return { rest: s, hadDemonstrative: false };
}

function stripTrailingFillers(s: string): string {
  let out = s;
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of ANSWERABILITY_FILLERS) {
      if (out === f) return '';
      if (out.endsWith(' ' + f)) {
        out = out.slice(0, out.length - f.length - 1).trim();
        changed = true;
      }
    }
  }
  return out;
}

// 앞 내용(같은 문장의 앞 절 → 없으면 바로 앞 문장)이 질문의 대상을 제공하는가.
function hasGroundedAntecedent(beforeInSentence: string, previousSentence: string | null): boolean {
  const antecedent = normalizeAnswerabilityClause(beforeInSentence) || normalizeAnswerabilityClause(previousSentence ?? '');
  if (!antecedent) return false;
  return !ANSWERABILITY_SPECULATIVE_ENDING.test(antecedent);
}

export function detectUnanswerableQuestion(response: string): UnanswerableDetection | null {
  if (typeof response !== 'string') return null;
  const sentences = splitSentences(response);

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const isQuestion = /[?？]/.test(sentence);
    const clauses = sentence.split(/[,，]/);
    const lastClauseRaw = clauses[clauses.length - 1];
    const beforeInSentence = clauses.slice(0, -1).join(',');
    const previousSentence = i > 0 ? sentences[i - 1] : null;
    const clause = stripLeadingConnectors(normalizeAnswerabilityClause(lastClauseRaw));

    // 패턴 3 — "궁금하다"로 끝나는데 궁금한 대상이 없다 (물음표 유무와 무관).
    const curious = clause.match(ANSWERABILITY_CURIOUS_TAIL);
    if (curious) {
      const head = stripTrailingFillers(curious[1].trim());
      const { rest, hadDemonstrative } = stripLeadingDemonstrative(head);
      if (head && ANSWERABILITY_REASON_ENDING.test(head)) {
        return { pattern: 'EMPTY_CURIOSITY', sentence };
      }
      if ((head === '' || (hadDemonstrative && rest === '')) && !hasGroundedAntecedent(beforeInSentence, previousSentence)) {
        return { pattern: 'EMPTY_CURIOSITY', sentence };
      }
      continue;
    }

    // 패턴 1·2는 물음표가 있는 질문 문장만 본다 (질문이 없는 반응형 응답은 판정 대상이 아니다).
    if (!isQuestion) continue;

    // 패턴 1 — (지시어) + 평가형 서술어만 남는 질문.
    const { rest } = stripLeadingDemonstrative(clause);
    if (ANSWERABILITY_EVALUATIVE_PREDICATES.includes(rest) && !hasGroundedAntecedent(beforeInSentence, previousSentence)) {
      return { pattern: 'PRONOUN_EVALUATIVE', sentence };
    }

    // 패턴 2 — 주제어(은/는)만 남고 무엇을 묻는지 생략된 꼬리 질문.
    if (ANSWERABILITY_BARE_TOPICS.includes(clause) && !hasGroundedAntecedent(beforeInSentence, previousSentence)) {
      return { pattern: 'BARE_TOPIC_TAIL', sentence };
    }
  }
  return null;
}

export function isQuestionNotAnswerable(response: string): boolean {
  return detectUnanswerableQuestion(response) !== null;
}
