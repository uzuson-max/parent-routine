
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
import { validateResponse } from '@/lib/response/responsevalidator';
import { intentNeedsAnswer, isGroundedIn, negativeTargets, normalizeLoose, StanceItem } from '@/lib/response/understanding';

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

// 질문 문장이 여러 개면 하나만 남긴다. question_target과 가장 많이 겹치는 질문(동점이면 앞의 것)을 남기고,
// 질문이 아닌 문장(답/반응)은 전부 순서대로 유지한다.
export function keepOneQuestion(text: string, questionTarget: string | null): string {
  const sentences = splitSentences(text);
  const qIdx = sentences.map((s, i) => (/[?？]/.test(s) ? i : -1)).filter((i) => i >= 0);
  if (qIdx.length <= 1) return text;
  let keep = qIdx[0];
  if (questionTarget) {
    let best = -1;
    for (const i of qIdx) {
      const score = bigramOverlap(questionTarget, sentences[i]);
      if (score > best) {
        best = score;
        keep = i;
      }
    }
  }
  return sentences.filter((_, i) => !qIdx.includes(i) || i === keep).join(' ');
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
  const response = keepOneQuestion(c.result.response, opp.question_target);
  const repaired: GeneratedResult = {
    ...c.result,
    response,
    conversation_opportunity: opp,
    question_present: /[?？]/.test(response),
  };
  // 수정본도 validator를 그대로 통과해야 한다 (규칙 완화 없음).
  return validateResponse(repaired, ctx).passed ? { result: repaired, anchorDiscarded } : null;
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
  const anchor = anchorQuote && isGroundedIn(anchorQuote, transcript) ? anchorQuote : null;

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

  return anchor ? `"${shorten(anchor)}" 이 부분이 제일 걸리네. 어쩌다 그렇게 된 거야?` : '방금 그 얘기, 어쩌다 나온 거야?';
}

export const STT_FAILED_TRANSCRIPT = '(음성 변환 실패)';
export const STT_FAILED_RESPONSE = '방금 소리가 잘 안 들렸어. 한 번만 다시 말해줄래?';
