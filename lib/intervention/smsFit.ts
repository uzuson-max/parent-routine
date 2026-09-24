
import { composeSms, smsByteLength, logSms, SMS_TARGET_BYTES } from '@/lib/solapi';

// ============================================================================
// 자동 개입 메시지를 "SMS 90바이트 이하"로 맞추는 단계. dispatch.deliverPush()가 Solapi 호출 직전에 부른다.
//
// 생성 엔진(interventionEngine / memoryCallbackEngine / insightEngine)은 프롬프트로 짧게 쓰도록 유도하지만
// AI 출력은 믿지 않는다. 여기서 실제 바이트를 재고, 넘으면 아래 순서로 줄인다. 문자열을 바이트 경계에서
// 잘라내는(substring/slice) 방식은 쓰지 않는다 — 항상 "문장 단위" 또는 "다시 써서" 줄인다.
//
//   1) 공백/줄바꿈 정리, 이모지 제거, 같은 문장 반복 제거
//   2) 머리말("참견이 등장.") 떼기 — 본문만으로 들어가면 그걸로 끝
//   3) GPT로 같은 의미·같은 말투를 유지한 채 다시 짧게 쓰기 (최대 2회, 매번 바이트 재검사)
//   4) 마지막 수단: 문장 하나(질문 문장 우선)만 남기기
//   5) 그래도 안 되면 null → 호출부는 발송하지 않는다 (LMS로 절대 새지 않음)
// ============================================================================

// 생성 프롬프트용 길이 규칙. LLM은 바이트를 셀 수 없어서 "한글 글자 수"로 환산해 준다(한글 1자=2바이트).
// hasHeader=true면 "참견이 등장.\n\n"(16바이트)이 앞에 붙으므로 본문 예산이 줄어든다.
const HEADER_EXAMPLE = '참견이 등장.';
export function smsLengthRule(hasHeader: boolean): string {
  const budget = SMS_TARGET_BYTES - (hasHeader ? smsByteLength(`${HEADER_EXAMPLE}\n\n`) : 0);
  const targetChars = Math.floor(budget / 2) - 2; // 여유분
  const maxChars = Math.floor(budget / 2);
  return `[SMS 길이 규칙 — 가장 중요]
- 이 문자는 한국 SMS로 나간다. 90바이트(한글 1자=2바이트, 영문/숫자/공백=1바이트)를 넘으면 장문(LMS)이 되어 안 된다.
- 본문은 공백 포함 한글 ${targetChars}자 안팎, 절대 ${maxChars}자를 넘기지 마라.
- 인사, 설명, 부연, 꾸밈말을 빼라. 같은 뜻을 두 번 말하지 마라. 길어질 것 같으면 맥락을 덧붙이지 말고 문장을 지워라.
- 질문 하나를 중심으로, 짧은 문장 1~2개. 이모지와 줄바꿈은 쓰지 마라.
- 짧아도 알림 문구처럼 딱딱하면 안 된다. 과거에 한 말을 지금으로 툭 가져오는 참견이 말투는 유지해라.
  좋은 예(베끼지 마라): "그때 말한 거, 아직도 생각나?" / "그 얘기, 어떻게 됐어?"`;
}

export interface FittedSms {
  body: string;
  header: string | null;
  bytes: number;
  steps: string[]; // 어떤 단계를 거쳤는지 (로그/테스트용)
}

export type SmsCompressor = (text: string, maxChars: number) => Promise<string | null>;

// 이모지/픽토그램/변형선택자/ZWJ 제거 (EUC-KR SMS에서 깨지고 바이트만 먹는다).
// es5 타깃이라 \p{..}/u 플래그 대신 서로게이트 쌍과 주요 기호 블록을 직접 지정한다.
const EMOJI_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF\uFE0F\u200D\u20E3]/g;

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?…~]+[.!?…~]*/g) ?? [];
  return parts.map((p) => p.trim()).filter(Boolean);
}

function normalizeBody(text: string): string {
  const flat = text.replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim();
  const seen: string[] = [];
  for (const s of splitSentences(flat)) {
    const key = s.replace(/[.!?…~\s]/g, '');
    if (key && seen.some((x) => x.replace(/[.!?…~\s]/g, '') === key)) continue;
    seen.push(s);
  }
  return seen.join(' ').trim() || flat;
}

function fits(body: string, header: string | null): boolean {
  return composeSms(body, header).type === 'SMS';
}

function result(body: string, header: string | null, steps: string[]): FittedSms {
  return { body, header, bytes: composeSms(body, header).bytes, steps };
}

/** 헤더가 있으면 헤더 포함으로, 안 되면 헤더를 뗀 채로 들어가는지 본다. */
function tryFit(body: string, header: string | null, steps: string[], step: string): FittedSms | null {
  if (!body) return null;
  if (header && fits(body, header)) return result(body, header, [...steps, step]);
  if (fits(body, null)) return result(body, null, [...steps, header ? `${step}+drop_header` : step]);
  return null;
}

export async function fitInterventionSms(
  body: string,
  header: string | null | undefined,
  compress: SmsCompressor = compressWithGpt
): Promise<FittedSms | null> {
  const h = header?.trim() || null;
  const original = body.trim();

  // 0) 원문 그대로
  if (fits(original, h)) return result(original, h, ['original']);

  const originalBytes = composeSms(original, h).bytes;
  logSms('Intervention SMS', { 'message exceeded 90 bytes': '', originalBytes, action: 'retrying compression...' });

  // 1) 정리 + 2) 머리말 떼기
  const cleaned = normalizeBody(original);
  const steps: string[] = ['normalize'];
  const afterClean = tryFit(cleaned, h, [], 'normalize');
  if (afterClean) return afterClean;

  // 3) GPT 재작성 — 머리말 없이 본문만으로 들어갈 길이를 목표로 한다.
  const maxChars = Math.floor(SMS_TARGET_BYTES / 2) - 2;
  let current = cleaned;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const rewritten = await compress(current, attempt === 1 ? maxChars : maxChars - 8);
    if (!rewritten) break;
    const candidate = normalizeBody(rewritten);
    const hit = tryFit(candidate, h, steps, `gpt_compress#${attempt}`);
    logSms('Intervention SMS', { compressAttempt: attempt, bytes: smsByteLength(candidate), ok: !!hit });
    if (hit) return hit;
    current = candidate;
  }

  // 4) 문장 하나만 남기기 (질문 문장 우선, 뒤쪽 문장 우선). 문장 중간은 자르지 않는다.
  const sentences = splitSentences(cleaned).concat(current !== cleaned ? splitSentences(current) : []);
  const ordered = sentences
    .filter((s) => /[?？]$/.test(s))
    .reverse()
    .concat(sentences.filter((s) => !/[?？]$/.test(s)).reverse());
  for (const s of ordered) {
    const hit = tryFit(s, h, steps, 'keep_one_sentence');
    if (hit) return hit;
  }

  // 5) 포기 — 호출부는 보내지 않는다.
  logSms('Intervention SMS', { 'still exceeded 90 bytes after compression': composeSms(current, null).bytes, action: 'not sent' });
  return null;
}

// ---- 기본 축약기: 기존 엔진들과 같은 방식(gpt-4o-mini, JSON 응답)으로 한 번 다시 쓰게 한다 ----
async function compressWithGpt(text: string, maxChars: number): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const prompt = `너는 "참견이"다. 사용자의 과거 말을 지금으로 툭 가져와 참견하는, 기억력 좋은 친구 같은 캐릭터.
아래 문자 초안이 SMS(90바이트) 한도를 넘었다. 같은 의미와 참견이 말투(반말, 질문형/혼잣말형)를 유지한 채 더 짧게 다시 써라.

초안: "${text}"

규칙:
- 공백 포함 한글 ${maxChars}자 이하. 넘으면 실패다.
- 줄이는 순서: 인사/꾸밈말 삭제 → 반복 삭제 → 문장 압축 → 짧은 표현으로 교체 → 부연 삭제 → 마지막엔 질문의 핵심만.
- 초안에 없는 사실(시간, 결과, 상황)을 새로 만들지 마라. 사용자가 지금 뭘 하는지 추측하지 마라.
- 명령형("해", "잊지 마"), 존댓말, 알림/상담사 말투 금지. 이모지·줄바꿈 금지. "참견이 등장." 같은 머리말 쓰지 마라.
- 문장을 중간에서 끊지 말고, 완결된 문장으로 써라.
예: "지금쯤 준비하고 있을 시간인데 혹시 아직 이불 속에 있진 않겠지?" → "혹시 아직 이불 속?"

반드시 JSON으로만 답해: { "message": "..." }`;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');
    return typeof parsed.message === 'string' && parsed.message.trim() ? parsed.message.trim() : null;
  } catch (err: any) {
    console.error('[smsFit] GPT 축약 실패:', err?.message ?? err);
    return null;
  }
}
