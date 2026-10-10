
// 1차 수정 (2026-09) — "사용자가 방금 무엇을 했는가(질문/요청/토로…)"와 "무엇에 대해 어떤 입장인가"를
// 응답 엔진까지 잃어버리지 않고 전달하기 위한 최소 모듈.
//
// 새 GPT 호출을 만들지 않는다. 값 자체는 이미 매 발화마다 돌고 있는 analysis 호출(lib/analysis.ts)이
// 함께 뽑고, 이 파일은 그 값을 (1) 형식 검증 (2) 원문 대조 (3) 누락 시 규칙 기반 보정만 한다.
// 거대한 intent 시스템이 아니다 — 응답이 "먼저 답해야 하는가"를 결정하기 위한 최소 분류다.
import { isExplicitReminderRequest } from '@/lib/intervention/commitmentSchedule';

export type UtteranceIntent =
  | 'question' // "어디 가야 되냐"
  | 'request' // "이거 정리 좀 해줘"
  | 'opinion_request' // "너라면 어떻게 생각해?"
  | 'vent' // "회사 진짜 답답하다"
  | 'statement' // "20만 원짜리 옷 샀어"
  | 'reminder_request' // "토요일 아침에 갈 건데 그때 알려줘"
  | 'information_request' // "제주도 항공권 얼마야?"
  | 'mixed'; // 이야기 + 질문이 섞인 긴 발화

export const UTTERANCE_INTENTS: UtteranceIntent[] = [
  'question',
  'request',
  'opinion_request',
  'vent',
  'statement',
  'reminder_request',
  'information_request',
  'mixed',
];

export type Stance = 'positive' | 'negative' | 'neutral' | 'uncertain';
export const STANCES: Stance[] = ['positive', 'negative', 'neutral', 'uncertain'];

export interface StanceItem {
  target: string; // 발화에 등장한 대상 (예: "제주도")
  stance: Stance; // 그 대상에 대한 사용자의 입장
  quote: string | null; // 그 입장이 드러난 원문 구간 (원문에 실제로 있을 때만)
}

export interface Understanding {
  utterance_intent: UtteranceIntent;
  user_question: string | null; // 사용자가 던진 질문/요청 원문 구간 (원문에 실제로 있을 때만)
  stances: StanceItem[];
}

// 응답이 "먼저 답/확인"해야 하는 의도인가. mixed는 실제 질문 구간이 잡혔을 때만.
export function intentNeedsAnswer(intent: UtteranceIntent | null | undefined, userQuestion: string | null | undefined): boolean {
  switch (intent) {
    case 'question':
    case 'request':
    case 'opinion_request':
    case 'information_request':
    case 'reminder_request':
      return true;
    case 'mixed':
      return !!userQuestion;
    default:
      return false;
  }
}

// ---- 원문 대조 ----------------------------------------------------------------------------

// 공백/문장부호/따옴표 차이는 무시하고 비교한다 (STT 원문을 그대로 옮겼는지 보는 게 목적).
export function normalizeLoose(s: string): string {
  return s.replace(/[\s.,!?？~…·"'“”‘’「」()\[\]\-]/g, '');
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

// quote가 transcript 안에 "실제로" 있는가. 1순위는 정규화 후 부분 문자열.
// 모델이 조사 하나 정도 바꿔 옮긴 경우까지 폐기하지 않도록, 2글자 조각의 90% 이상이 원문에 있으면 인정한다.
export function isGroundedIn(quote: string | null | undefined, transcript: string): boolean {
  if (!quote) return false;
  const q = normalizeLoose(quote);
  const t = normalizeLoose(transcript);
  if (!q || !t) return false;
  if (t.includes(q)) return true;
  const grams = bigrams(q);
  if (grams.length < 4) return false; // 너무 짧은 quote는 정확히 일치할 때만 인정
  const hit = grams.filter((g) => t.includes(g)).length;
  return hit / grams.length >= 0.9;
}

// ---- 규칙 기반 보정 (GPT 값이 없거나 형식이 틀렸을 때만 쓴다) ------------------------------

const OPINION_RE = /(너라면|니가\s*보기엔|네가\s*보기엔|어떻게\s*생각해|어떤\s*것\s*같아|어떨\s*것\s*같아|괜찮을까|나을까|할까\s*말까)/;
const INFO_RE = /(얼마|몇\s*시|몇\s*개|어디서|언제\s*(해|열|문)|뭐야\?|방법|알아\?)/;
const QUESTION_END_RE = /([?？]|냐|니|까|나요|죠|지)\s*[.!~]*\s*$/;

function heuristicIntent(transcript: string): UtteranceIntent {
  const t = transcript.trim();
  if (isExplicitReminderRequest(t) && /(그때|아침|저녁|시에|요일|내일|모레|주말)/.test(t)) return 'reminder_request';
  if (OPINION_RE.test(t)) return 'opinion_request';
  if (INFO_RE.test(t) && QUESTION_END_RE.test(t)) return 'information_request';
  if (QUESTION_END_RE.test(t)) return t.length > 80 ? 'mixed' : 'question';
  return 'statement';
}

// 참견이에게 직접 의견을 묻는 문장(명백한 경우만). "어떻게 생각해?" 바로 앞 질문까지 함께 돌려준다.
// 다른 사람이 한 말을 옮기는 경우("…어떻게 생각해 이렇게 말을 했어", "…할까 말까 고민된다 이렇게")는 제외한다.
// "할까 말까 / 나을까 / 괜찮을까"는 혼잣말 고민에도 흔해서 여기서는 쓰지 않는다(heuristicIntent에는 그대로 있다).
const DIRECT_OPINION_RE = /(너라면|니가\s*보기엔|네가\s*보기엔|참견이라면|어떻게\s*생각해|어떤\s*것\s*같아|어떨\s*것\s*같아)/g;
const REPORTED_SPEECH_RE = /^\s*[?？.!~]*\s*(이렇게|라고|하고|하면|했어|했더니|말을|물어보)/;

export function findDirectOpinionRequest(transcript: string): string | null {
  if (!transcript) return null;
  const re = new RegExp(DIRECT_OPINION_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(transcript)) !== null) {
    const matchEnd = m.index + m[0].length;
    if (REPORTED_SPEECH_RE.test(transcript.slice(matchEnd, matchEnd + 14))) continue;
    // 매치가 든 문장 끝까지("너라면" → "너라면 어떻게 생각해")
    const rest = transcript.slice(matchEnd).search(/[.!?？~]/);
    const end = rest === -1 ? transcript.length : matchEnd + rest;
    // 바로 앞 문장(질문)까지 포함: "수달로 메인 캐릭터를 바꿀까? 어떻게 생각해"
    const before = transcript.slice(0, m.index);
    const boundaries: number[] = [];
    const bre = /[.!?？~]\s*/g;
    let b: RegExpExecArray | null;
    while ((b = bre.exec(before)) !== null) boundaries.push(b.index + b[0].length);
    // 매치 바로 앞이 문장 끝이면(…바꿀까? 어떻게 생각해) 그 앞 문장부터, 아니면 매치가 든 문장 처음부터.
    const back = /[.!?？~]\s*$/.test(before) ? 2 : 1;
    const start = boundaries.length >= back ? boundaries[boundaries.length - back] : 0;
    let quote = transcript.slice(start, end).trim();
    // 앞 문장이 길게 이어진 말이면 뒤쪽만(질문 바로 앞 부분) 남긴다 — 원문 그대로의 연속 구간이다.
    if (quote.length > 70) quote = quote.slice(quote.length - 70).replace(/^\S*\s/, '');
    const tail = transcript.slice(end).match(/^\s*[?？]/);
    return tail ? `${quote}?` : quote;
  }
  return null;
}

function cleanText(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/^["'“”‘’「」]+|["'“”‘’「」]+$/g, '').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * analysis GPT가 돌려준 원시 값(parsed)을 검증된 Understanding으로 바꾼다. 절대 던지지 않는다.
 * - utterance_intent: 목록에 없는 값이면 규칙 기반 추정으로 대체
 * - user_question: 원문에 실제로 없는 문장이면 폐기 (모델이 "그럴듯한 질문"을 지어내는 것 방지)
 * - stances: target이 원문에 없으면 폐기, quote가 원문에 없으면 quote만 null
 */
export function normalizeUnderstanding(parsed: any, transcript: string): Understanding {
  const rawIntent = parsed?.utterance_intent;
  let utterance_intent: UtteranceIntent = UTTERANCE_INTENTS.includes(rawIntent) ? rawIntent : heuristicIntent(transcript);

  const q = cleanText(parsed?.user_question);
  let user_question = q && isGroundedIn(q, transcript) ? q : null;

  // 2026-10-11 — 참견이에게 직접 의견을 물었는데("수달로 메인 캐릭터 바꿀까? 어떻게 생각해?") 분석이
  // statement/vent로 분류하면, 응답이 의견 없이 "왜 바꾸고 싶어?"로 되묻는다. 명백한 직접 의견 요청만 보정한다.
  if (utterance_intent === 'statement' || utterance_intent === 'vent') {
    const asked = findDirectOpinionRequest(transcript);
    if (asked) {
      utterance_intent = 'opinion_request';
      if (!user_question) user_question = asked;
    }
  }

  const stances: StanceItem[] = [];
  const rawStances = Array.isArray(parsed?.stances) ? parsed.stances : [];
  for (const s of rawStances) {
    const target = cleanText(s?.target, 40);
    if (!target || !STANCES.includes(s?.stance)) continue;
    if (!normalizeLoose(transcript).includes(normalizeLoose(target))) continue;
    const quote = cleanText(s?.quote);
    stances.push({ target, stance: s.stance, quote: quote && isGroundedIn(quote, transcript) ? quote : null });
    if (stances.length >= 8) break;
  }

  return { utterance_intent, user_question, stances };
}

export function negativeTargets(stances: StanceItem[] | null | undefined): string[] {
  return (stances ?? []).filter((s) => s.stance === 'negative').map((s) => s.target);
}

export const STANCE_LABEL: Record<Stance, string> = {
  positive: '긍정/끌림',
  negative: '부정/싫음',
  neutral: '중립/언급만',
  uncertain: '고민 중/애매',
};
