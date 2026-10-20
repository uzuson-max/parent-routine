
// 1차 수정 (2026-09) — 응답 생성이 검증을 끝내 통과하지 못했을 때의 "마지막 안전장치".
//
// 예전 buildDeterministicFallback()은 transcript.includes('제주도') 같은 키워드로 고정 문장을 골랐다.
// 그래서 "제주도 가기도 싫고 어디 가야 되냐"에 "제주도에서 제일 해보고 싶은 게 뭐야?"가, "토요일 9시 출발하니까
// 알려줘"에 "지금은 뭐가 제일 걸려?"가 나갔다(운영 DB에서 확인). 그 함수는 제거했다.
//
// 이제 두 가지 도구를 제공한다 (둘 다 GPT를 다시 부르지 않는다):
//   tryRepair()         — 생성된 응답의 실패 사유가 "고칠 수 있는 형식 문제"뿐일 때(질문 2개 이상, anchor 인용 불일치)
//                         초과 질문 문장만 걷어내고 원문에 없는 anchor는 폐기한 뒤, validator를 "그대로 다시" 통과시킨다.
//                         validator를 완화하지 않는다 — 수정본이 모든 규칙을 통과해야만 쓴다. 문장은 LLM이 쓴 그대로다.
//   buildIntentFallback() — 그래도 안 되면 발화 의도 / 사용자 질문 원문 / 입장(stance) / anchor를 근거로 만든 안전 문장.
import type {
  ConversationOpportunity,
  ResponseResult,
  ValidationContext,
  ValidationFailureReason,
} from '@/lib/response/responsetypes';
import { detectTruncatedAnchorHead, extractExplicitOptions, validateResponse } from '@/lib/response/responsevalidator';
import { SOFT_VALIDATION_REASONS } from '@/lib/response/responsetypes';
import {
  detectClosingSignal,
  detectQuestionRequest,
  intentNeedsAnswer,
  isGroundedIn,
  negativeTargets,
  normalizeLoose,
  StanceItem,
} from '@/lib/response/understanding';

type OmittedFields = 'validation_passed' | 'validation_failure_reason' | 'regeneration_count' | 'closes_conversation' | 'repeated_memory_detected' | 'fallback_used';
type GeneratedResult = Omit<ResponseResult, OmittedFields>;

export interface FallbackCandidate {
  result: GeneratedResult;
  reasons: ValidationFailureReason[];
}

// 코드로 고쳐도 의미가 바뀌지 않는 형식 문제만. 나머지(질문 무시, 부정 뒤집기, 기억 오용 등)는 고치지 않고 버린다.
const REPAIRABLE: ReadonlySet<ValidationFailureReason> = new Set<ValidationFailureReason>([
  'TOO_MANY_QUESTIONS',
  'ANCHOR_NOT_IN_TRANSCRIPT',
  // 2026-10-19 — 종료 턴에 붙은 질문 문장만 걷어낸다. 남는 문장이 없거나 불완전하면 수정하지 않는다(재생성으로).
  'CLOSING_SIGNAL_WITH_QUESTION',
]);

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?？~])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function bigramOverlap(a: string, b: string): number {
  const na = normalizeLoose(a);
  const nb = normalizeLoose(b);
  if (na.length < 2 || nb.length < 2) return 0;
  let hit = 0;
  for (let i = 0; i < na.length - 1; i++) if (nb.includes(na.slice(i, i + 2))) hit++;
  return hit;
}

// 2026-10-19 — "A야? 아니면 B야?"처럼 뒤 질문이 선택지 접속어로 시작하면 두 질문은 하나의 양자택일이다.
// 하나를 지우면 선택지가 사라지므로, 앞 질문의 물음표를 쉼표로 바꿔 한 문장으로 합친다 ("A야, 아니면 B야?").
// 단어는 한 글자도 바꾸지 않는다 — 문장부호만 바뀐다.
// 2차(2026-10-20) — "라면 하나만 먹은 거야? 뭐랑 같이 먹은 거야?"처럼 접속어 없이도 대비("…만")가 있고 같은 어미로
// 끝나는 인접 질문 쌍도 같은 방식으로 합친다. 1차에서는 이런 쌍을 "거절"했는데, 같은 어미라는 이유만으로
// 정상 축약까지 거절해 fallback으로 떨어지는 문제가 실측에서 나왔다 → 거절 대신 합치기, 그리고 대비 표지가 있을 때만.
const ALTERNATIVE_HEAD = /^(아니면|아님|혹은|또는)(\s|$)/;
const CONTRAST_MARK = /[가-힣]만\s|둘\s*중/;
function questionEnding(s: string): string {
  return s.replace(/[\s?？.!~…ㅋㅎ]+$/g, '').slice(-2);
}
function isContrastPair(a: string, b: string): boolean {
  const ea = questionEnding(a);
  return ea.length === 2 && ea === questionEnding(b) && (CONTRAST_MARK.test(a) || CONTRAST_MARK.test(b));
}
function mergeAlternativeQuestions(sentences: string[]): string[] {
  const out: string[] = [];
  for (const s of sentences) {
    const prev = out[out.length - 1];
    if (prev && /[?？]\s*$/.test(prev) && /[?？]/.test(s) && (ALTERNATIVE_HEAD.test(s) || isContrastPair(prev, s))) {
      out[out.length - 1] = `${prev.replace(/[?？]\s*$/, ',')} ${s}`;
    } else {
      out.push(s);
    }
  }
  return out;
}

// 2차 — "크림라면? 근데 그거 맛있어?"의 "크림라면?"은 질문이 아니라 되받아치는 감탄이다(서술어 없는 짧은 한 덩어리).
// 이런 조각은 물음표를 느낌표로 바꿔 질문 개수에서 뺀다. 의문사("왜?", "뭐?")로 된 조각은 진짜 질문이라 건드리지 않는다.
const ECHO_FRAGMENT = /^[가-힣A-Za-z0-9]{1,8}[?？]$/;
const WH_WORD = /(왜|뭐|뭔|어디|언제|누구|누가|어떻게|어때|몇|무슨|어느)/;
const PREDICATE_END = /(야|어|니|냐|까|지|래|요|나|가|고|데|게|해|돼|네|대)[?？]$/;
function demoteEchoFragments(sentences: string[]): string[] {
  const qCount = sentences.filter((s) => /[?？]/.test(s)).length;
  if (qCount < 2) return sentences;
  // 작업 A — "라면이야?", "17만원이야?"처럼 서술어 어미로 끝나는 짧은 문장은 되받아치기가 아니라 진짜 질문이다(실측 테스트에서
  // "라면이야? 떡볶이야?"가 "라면이야! 떡볶이야!"로 바뀌어 선택 질문이 사라짐). 어미로 끝나는 조각은 감탄으로 바꾸지 않는다.
  return sentences.map((s) => (ECHO_FRAGMENT.test(s) && !WH_WORD.test(s) && !PREDICATE_END.test(s) ? s.replace(/[?？]$/, '!') : s));
}

// 2026-10-19 — 문장을 걷어낸 결과를 승인해도 되는가. 의미를 망가뜨리는 축약은 승인하지 않는다.
//   ① 남은 문장이 없음
//   ② 지워진 문장 바로 뒤에 있던 문장이 접속어("아니면/그럼/근데/그래서"…)나 지시어("그거/그건/거기"…)로
//      시작해서, 앞 문장 없이는 무슨 말인지 모르게 됨
// 2차 — 1차의 ③(같은 어미 인접 질문이면 거절)은 삭제했다. 대비 표지가 있는 쌍은 위에서 합치고, 나머지는 정상 축약으로 본다.
const DANGLING_HEAD = /^(아니면|아님|혹은|또는|그럼|그러면|근데|그런데|그래서|그니까|그러니까|그리고|그래도|그거|그건|그게|그걸|거기|그때|걔|그 사람)(\s|$|[,.?？!])/;
function isSafeSelection(before: string[], kept: string[]): boolean {
  if (kept.length === 0) return false;
  let k = 0;
  let prevRemoved = false;
  for (const s of before) {
    if (k < kept.length && kept[k] === s) {
      if (prevRemoved && DANGLING_HEAD.test(s)) return false;
      prevRemoved = false;
      k++;
    } else {
      prevRemoved = true;
    }
  }
  return true;
}
export function isSafeReduction(original: string, reduced: string, transcript?: string | null): boolean {
  // 작업 A — reduceQuestions()와 같은 전처리(반문 → 느낌표)를 해야 같은 문장끼리 비교된다.
  const before = demoteDetailRestatements(demoteEchoFragments(mergeAlternativeQuestions(splitSentences(original))), extractKeyDetails(transcript));
  return isSafeSelection(before, splitSentences(reduced));
}

// 질문 문장이 여러 개면 하나만 남긴다. question_target과 가장 많이 겹치는 질문(동점이면 앞의 것)부터 시도하고,
// 질문이 아닌 문장(답/반응)은 전부 순서대로 유지한다.
// 2차 — 1순위 후보를 남기면 문장이 불완전해지는 경우(②) 바로 거절하지 않고 다음 후보를 시도한다.
//        모든 후보가 불완전하면 null (→ 재생성). 양자택일·대비 쌍은 먼저 합치고, 되받아치는 감탄 조각은 질문에서 뺀다.
// 작업 A (2026-10-20) — 축약 때 원문 핵심 디테일 보존.
// "핵심 디테일" = 사용자 원문과 응답에 "둘 다" 나오는 숫자 / 한글 수량("세 번") / 영문 이름 / 명시적 선택지("라면 먹을까 떡볶이 먹을까").
// 축약 전 응답에 있던 이 디테일이 축약 후에 하나라도 사라지면 그 후보는 쓰지 않는다(다음 후보 → 없으면 축약 거절).
// 일반 명사("발표", "고양이")는 디테일로 보지 않는다 — 오탐(정상 축약 거절) 위험 때문이며, 그만큼 못 잡는 손실이 남는다.
const DETAIL_PATTERNS: RegExp[] = [
  /[0-9０-９]+(?:[.,][0-9]+)?/g,
  /(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무)\s?(?:번|개|명|마리|살|시간|달|주|학기|잔|권|벌|장|판|그릇|곳|군데)/g,
  /[A-Za-z]{2,}/g,
];
export function extractKeyDetails(transcript: string | null | undefined): string[] {
  if (!transcript) return [];
  const out = new Set<string>();
  for (const re of DETAIL_PATTERNS) for (const m of transcript.match(new RegExp(re.source, 'g')) ?? []) out.add(m.replace(/\s+/g, ''));
  for (const o of extractExplicitOptions(transcript)) out.add(o);
  return Array.from(out);
}
function detailsIn(text: string, details: string[]): string[] {
  const t = normalizeLoose(text);
  return details.filter((d) => t.includes(normalizeLoose(d)));
}

// 작업 A — "발표를 3번이나 다시 했다고?"처럼 사용자 말을 되받아 확인하는 반문(…다고?/…라고?/…다니?)이 원문 디테일을 담고 있으면,
// 질문이 아니라 반응으로 보고 물음표를 느낌표로 바꾼다(질문이 2개 이상일 때만, 의문사가 있으면 건드리지 않는다). 단어는 그대로다.
const RESTATEMENT_END = /(다고|라고|다니|냐고)\s*[?？]$/;
function demoteDetailRestatements(sentences: string[], details: string[]): string[] {
  const qCount = sentences.filter((s) => /[?？]/.test(s)).length;
  if (qCount < 2 || details.length === 0) return sentences;
  return sentences.map((s) =>
    RESTATEMENT_END.test(s) && !WH_WORD.test(s) && detailsIn(s, details).length > 0 ? s.replace(/[?？]$/, '!') : s
  );
}

export function reduceQuestions(text: string, questionTarget: string | null, transcript?: string | null): string | null {
  const details = extractKeyDetails(transcript);
  const sentences = demoteDetailRestatements(demoteEchoFragments(mergeAlternativeQuestions(splitSentences(text))), details);
  const qIdx = sentences.map((s, i) => (/[?？]/.test(s) ? i : -1)).filter((i) => i >= 0);
  if (qIdx.length <= 1) return sentences.join(' ');
  // 축약 전 응답에 실제로 있던 원문 디테일 — 이건 축약 후에도 전부 남아 있어야 한다.
  const required = detailsIn(text, details);
  const scored = qIdx.map((i, order) => ({ i, order, score: questionTarget ? bigramOverlap(questionTarget, sentences[i]) : 0 }));
  scored.sort((x, y) => y.score - x.score || x.order - y.order);
  for (const { i: keep } of scored) {
    const kept = sentences.filter((_, i) => !qIdx.includes(i) || i === keep);
    if (!isSafeSelection(sentences, kept)) continue;
    if (detailsIn(kept.join(' '), required).length < required.length) continue;
    return kept.join(' ');
  }
  return null;
}

// 기존 export 유지(scripts/test-response-v1.ts가 쓴다). 안전한 축약이 없으면 1순위 후보를 그대로 돌려준다 —
// 실제 수정 경로(tryRepair)는 reduceQuestions()를 쓰고, null이면 수정하지 않는다.
export function keepOneQuestion(text: string, questionTarget: string | null): string {
  const safe = reduceQuestions(text, questionTarget);
  if (safe !== null) return safe;
  const sentences = demoteEchoFragments(mergeAlternativeQuestions(splitSentences(text)));
  const qIdx = sentences.map((s, i) => (/[?？]/.test(s) ? i : -1)).filter((i) => i >= 0);
  return sentences.filter((_, i) => !qIdx.includes(i) || i === qIdx[0]).join(' ');
}

// 2026-10-19 — 종료 턴에서 질문 문장만 걷어낸다 (평서문은 그대로).
function dropQuestions(text: string): string {
  return splitSentences(text)
    .filter((s) => !/[?？]/.test(s))
    .join(' ');
}

// 2026-10-21 (D) — 기억을 썼다고 표시된 응답(memory_unit_id_used)에서 문장을 걷어낼 때, 걷어낸 문장이 그 기억을 담고 있었을
// 가능성이 조금이라도 있으면 수정하지 않는다(→ 엔진의 기존 재생성 경로). 실측: R08 — 기억이 든 질문 문장이 지워졌는데
// memory_unit_id_used=171은 그대로 남았다.
// "기억 문장이 남았는가"를 정확히 판정할 방법은 없다(같은 뜻을 다른 말로 쓸 수 있다). 그래서 이 검사는 한 방향으로만 쓴다:
// 의심되면 수정을 "거절"할 뿐, 기억 표시를 지우거나 본문을 고치지 않는다. 오판의 비용은 불필요한 재생성 1회다.
// 의심 기준: 걷어낸 문장이 ① 과거 발화를 가리키는 표현을 쓰거나 ② 기억 원문/요약과 2글자 조각이 3개 이상 겹치거나
// ③ 기억 원문을 받을 수 없는 경우(판단 불가 → 보수적으로 거절).
const PAST_REFERENCE = /(저번에|예전에|지난번|전에|그때|했잖아|했었|했던|다며|라며|다더니|라더니|다던|라던|다고\s*했|라고\s*했|했다며|하던)/;
const MEMORY_OVERLAP_MIN = 3;
function droppedSentences(original: string, repaired: string): string[] {
  const kept = new Set(splitSentences(repaired).map((s) => normalizeLoose(s)));
  return splitSentences(original).filter((s) => {
    const n = normalizeLoose(s);
    // 문장부호만 바뀐 경우(양자택일 합치기 "A야? 아니면 B야?" → "A야, 아니면 B야?", 되받아치기 "?" → "!")는 지운 게 아니다.
    return !kept.has(n) && !normalizeLoose(repaired).includes(n);
  });
}
function mayDropMemory(original: string, repaired: string, memoryText: string | undefined): boolean {
  const dropped = droppedSentences(original, repaired);
  if (dropped.length === 0) return false;
  if (!memoryText) return true;
  return dropped.some((s) => PAST_REFERENCE.test(s) || bigramOverlap(s, memoryText) >= MEMORY_OVERLAP_MIN);
}

export function tryRepair(
  c: FallbackCandidate,
  ctx: ValidationContext
): { result: GeneratedResult; anchorDiscarded: boolean } | null {
  if (c.reasons.length === 0 || !c.reasons.every((r) => REPAIRABLE.has(r))) return null;

  let opp: ConversationOpportunity = c.result.conversation_opportunity;
  let anchorDiscarded = false;
   if (c.reasons.includes('ANCHOR_NOT_IN_TRANSCRIPT')) {
    opp = { ...opp, anchor_quote: null, anchor_fact: null };
    anchorDiscarded = true;
  }
  const response = c.reasons.includes('CLOSING_SIGNAL_WITH_QUESTION')
    ? dropQuestions(c.result.response)
    : reduceQuestions(c.result.response, opp.question_target, ctx.transcript ?? null);
  // 2026-10-19 — 형식(물음표 개수)을 맞추려고 의미를 망가뜨린 축약은 쓰지 않는다.
  if (response === null || (response !== c.result.response && !isSafeReduction(c.result.response, response, ctx.transcript ?? null))) return null;
  // (D) 기억을 쓴 응답에서 기억이 든 문장을 지웠을 수 있으면 수정하지 않는다 — memory_unit_id_used와 본문이 어긋나는 것을 막는다.
  const usedMemoryId = c.result.memory_unit_id_used;
  if (usedMemoryId !== null && response !== c.result.response && mayDropMemory(c.result.response, response, ctx.memoryTexts?.[usedMemoryId])) {
    return null;
  }
  const repaired: GeneratedResult = {
    ...c.result,
    response,
    conversation_opportunity: opp,
    question_present: /[?？]/.test(response),
  };
  // 수정본도 validator를 그대로 통과해야 한다 (규칙 완화 없음). 단 SOFT 사유는 수정 대상이 아니므로
  // 여기서도 통과/실패 판정에서 뺀다 — 엔진이 SOFT 사유를 따로 다룬다(lib/responseEngine.ts).
  const after = validateResponse(repaired, ctx).reasons.filter((r) => !SOFT_VALIDATION_REASONS.has(r));
  return after.length === 0 ? { result: repaired, anchorDiscarded } : null;
}

// ---- 의도 기반 안전 문장 --------------------------------------------------------------------

function hasBatchim(word: string): boolean {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function withTopic(word: string): string {
  return `${word}${hasBatchim(word) ? '은' : '는'}`;
}

function shorten(s: string, max = 28): string {
  const t = s.trim().replace(/[.!?？~]+$/, '');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 10 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function whenLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000); // KST
  const h = k.getUTCHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const min = k.getUTCMinutes() ? ` ${k.getUTCMinutes()}분` : '';
  return `${WEEKDAYS[k.getUTCDay()]}요일 ${ampm} ${h12}시${min}`;
}

export function buildIntentFallback(
  transcript: string,
  analysis: any,
  anchorQuote: string | null
): string {
  const intent: string | null = analysis?.utterance_intent ?? null;
  const userQuestion: string | null = analysis?.user_question ?? null;
  const stances: StanceItem[] = Array.isArray(analysis?.stances) ? analysis.stances : [];
  const neg = negativeTargets(stances);
  const grounded = anchorQuote && isGroundedIn(anchorQuote, transcript) ? anchorQuote : null;
  // 2차 — 숫자로 시작하는 anchor가 앞 대상을 잘라먹었으면("17만원에 봤어" ← "항공권을") 그 어절을 되살려 인용한다.
  // 원문에 실제로 있는 바로 앞 어절만 붙인다(새 말을 만들지 않는다).
  const head = grounded ? detectTruncatedAnchorHead(grounded, transcript) : null;
  const anchor = grounded && head ? `${head} ${grounded.trim()}` : grounded;
  const closing = detectClosingSignal(transcript);

  // 2026-10-19 — 질문을 해달라는 요청이면, 질문 하나를 던지는 게 곧 답이다 ("다시 물어봐 줄래?"로 떠넘기지 않는다).
  if (detectQuestionRequest(transcript)) {
    return '그럼 하나만. 요즘 제일 자주 떠오르는 생각이 뭐야?';
  }

  // 2026-10-19 — 대화를 마치려는 말에는, 답해야 할 질문이 없으면 짧게 받아주고 끝낸다(질문 금지).
  if (closing && !intentNeedsAnswer(intent as any, userQuestion)) {
    return /(잘게|잘래|자러|잘\s*거야|자야|굿\s*나잇|굿밤)/.test(transcript) ? '응, 잘 자.' : '응, 나중에 또 얘기해.';
  }

  if (intent === 'reminder_request') {
    const when = whenLabel(analysis?.commitment_due_at);
    return when ? `${when} 그거, 그때 알려달라는 거지?` : '그거 몇 시쯤 알려주면 돼?';
  }

  if (intentNeedsAnswer(intent as any, userQuestion)) {
    const negPart = neg.length > 0 ? `${withTopic(neg.join(', '))} 빼고 보는 거 알아. ` : '';
    const qPart = userQuestion ? `"${shorten(userQuestion)}" 이거 제대로 답하고 싶은데` : '방금 물어본 거 제대로 답하고 싶은데';
    return `${negPart}${qPart} 생각이 잠깐 엉켰어. 한 번만 다시 물어봐 줄래?`;
  }

  if (intent === 'vent') {
    return anchor ? `"${shorten(anchor)}"… 그 말 나올 만한 하루였나 보네.` : '오늘 진짜 그 정도였나 보네.';
  }

  // 2차 — 일반 이야기 fallback은 기준(b441092) 문구로 되돌렸다. 1차의 "…이 말이 제일 귀에 남네." / "응, 들었어."는
  // 실측에서 원문 일부만 인용하거나 핵심 대상을 놓쳐 어색했다(고양이 털·항공권 사례). 기준 문구는 원문 인용 + 질문 하나이고,
  // 감정이나 과거 사실을 새로 만들지 않는다. (종료 발화·질문 요청 fallback은 위에서 먼저 처리되므로 영향 없음)
  return anchor ? `"${shorten(anchor)}" 이 부분이 제일 걸리네. 어쩌다 그렇게 된 거야?` : '방금 그 얘기, 어쩌다 나온 거야?';
}

export const STT_FAILED_TRANSCRIPT = '(음성 변환 실패)';
export const STT_FAILED_RESPONSE = '방금 소리가 잘 안 들렸어. 한 번만 다시 말해줄래?';
