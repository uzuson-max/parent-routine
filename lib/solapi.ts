
import { SolapiMessageService } from 'solapi';

// Solapi는 발신/수신 번호를 국내 로컬 형식(01012345678, +82나 -없이)으로 요구한다.
// 기존 Twilio 쪽(normalizePhoneNumber)은 반대로 +82 국제 형식을 만들어서 서로 호환되지 않는다.
// 저장된 값이 "+8210..." 형태든 "010..." 형태든 전부 이 함수로 로컬 형식으로 통일한다.
function toSolapiLocalNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('82')) {
    return '0' + digits.slice(2);
  }
  if (digits.startsWith('0')) {
    return digits;
  }
  return '0' + digits;
}

function getClient(): SolapiMessageService {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('Solapi credentials missing (SOLAPI_API_KEY / SOLAPI_API_SECRET)');
  }
  return new SolapiMessageService(apiKey, apiSecret);
}

// ---- 최종 메시지 조립 (발송 직전, 딱 한 곳) ------------------------------------------------
//
// "참견이 등장." 중복 원인: SMS는 90바이트(한글 약 45자)까지다. 그보다 길면 Solapi가 자동으로 LMS로
// 바꾸는데, LMS에 subject(제목)를 안 넣으면 "본문 앞 40바이트"를 제목으로 자동 채운다.
// 우리는 본문 첫 줄에 "참견이 등장."을 넣고 있었으므로 → 제목 "참견이 등장." + 본문 "참견이 등장.\n\n..."
// 이 되어 휴대폰에 두 번 보였다. ("[Web발신]"은 통신사 표시라 앱에서 건드리지 않는다.)
//
// 해결: 헤더(스탬프)와 본문을 따로 받아서, 짧으면 SMS 본문 첫 줄에 한 번, 길면 LMS 제목에 한 번만 넣는다.

export const SMS_MAX_BYTES = 90;
// 운영 목표치 — 90에 딱 붙이지 않고 여유를 둔다 (프롬프트/축약 단계가 이 값을 목표로 삼는다).
export const SMS_TARGET_BYTES = 85;
const LMS_SUBJECT_MAX_BYTES = 40;
const DEFAULT_LMS_SUBJECT = '참견이';

// 한 글자(코드포인트)의 SMS 바이트. 통신사/Solapi SMS·LMS 판정은 EUC-KR 기준(ASCII 1, 한글 2)이다.
// 판정이 애매한 것은 전부 "더 크게" 센다 — 우리 계산이 Solapi보다 작게 나오면 LMS가 새지만,
// 크게 나오면 문장이 조금 더 짧아질 뿐이라 안전하다.
//   - 줄바꿈(\n)            : 2 (발송 시 CRLF로 바뀌는 경우 대비)
//   - \r                    : 0 (\r\n은 위의 \n 하나로 2바이트 처리)
//   - ASCII(영문/숫자/공백)  : 1
//   - 그 외 BMP(한글/한자/특수문자/전각 기호) : 2
//   - BMP 밖(대부분의 이모지, 서로게이트 쌍) : 4 (EUC-KR에 없는 문자라 보수적으로)
// 문자열 .length(UTF-16 코드 유닛 수)나 UTF-8 바이트(한글 3)는 절대 쓰지 않는다.
function charSmsBytes(codePoint: number): number {
  if (codePoint === 0x0a) return 2;
  if (codePoint === 0x0d) return 0;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0xffff) return 2;
  return 4;
}

// tsconfig target이 es5라 문자열 for...of(코드포인트 순회)를 쓸 수 없어 서로게이트 쌍을 직접 합친다.
function forEachCodePoint(text: string, fn: (cp: number, raw: string) => boolean | void): void {
  for (let i = 0; i < text.length; i++) {
    const hi = text.charCodeAt(i);
    if (hi >= 0xd800 && hi <= 0xdbff && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        const cp = (hi - 0xd800) * 0x400 + (lo - 0xdc00) + 0x10000;
        if (fn(cp, text.substr(i, 2)) === false) return;
        i++;
        continue;
      }
    }
    if (fn(hi, text.charAt(i)) === false) return;
  }
}

export function smsByteLength(text: string): number {
  let bytes = 0;
  forEachCodePoint(text, (cp) => {
    bytes += charSmsBytes(cp);
  });
  return bytes;
}

// LMS 제목(40바이트) 전용. 일반 개입 메시지 본문을 자르는 데는 절대 쓰지 않는다.
function truncateBytes(text: string, maxBytes: number): string {
  let out = '';
  let bytes = 0;
  forEachCodePoint(text, (cp, raw) => {
    const b = charSmsBytes(cp);
    if (bytes + b > maxBytes) return false;
    out += raw;
    bytes += b;
  });
  return out;
}

export interface ComposedSms {
  type: 'SMS' | 'LMS';
  subject?: string;
  text: string;
  bytes: number; // text의 SMS 바이트 (smsByteLength 기준)
}

/** 90바이트를 넘는 메시지를 SMS 전용 경로로 보내려 할 때 던진다 — Solapi 호출 전에 막힌다. */
export class SmsTooLongError extends Error {
  constructor(public readonly bytes: number) {
    super(`SMS 90바이트 초과(${bytes}B) — LMS 전환을 막기 위해 발송하지 않음`);
    this.name = 'SmsTooLongError';
  }
}

// 운영 환경에서는 사용자 메시지 본문을 로그에 남기지 않는다 (바이트/타입만).
// 본문까지 보고 싶으면 개발 환경이거나 SMS_DEBUG_LOG=1 일 때만.
function shouldLogSmsBody(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.SMS_DEBUG_LOG === '1';
}

export function logSms(tag: string, lines: Record<string, string | number | boolean | null | undefined>, body?: string) {
  const parts = [`[${tag}]`];
  for (const k of Object.keys(lines)) parts.push(`${k}: ${lines[k]}`);
  if (body !== undefined && shouldLogSmsBody()) parts.push(`message: ${body}`);
  console.log(parts.join('\n'));
}

/**
 * header: "참견이 등장." 같은 캐릭터 스탬프(선택). body: 실제 내용.
 * 본문에 헤더를 미리 붙여서 넘기지 말 것 — 조립은 여기서만 한다.
 */
export function composeSms(body: string, header?: string | null): ComposedSms {
  const cleanBody = body.trim();
  const cleanHeader = header?.trim() || null;

  // 방어: GPT가 본문 첫머리에 헤더 문구를 또 써버린 경우 한 번 제거한다.
  const bodyWithoutEcho =
    cleanHeader && cleanBody.startsWith(cleanHeader) ? cleanBody.slice(cleanHeader.length).trim() : cleanBody;

  const smsText = cleanHeader ? `${cleanHeader}\n\n${bodyWithoutEcho}` : bodyWithoutEcho;
  const smsBytes = smsByteLength(smsText);
  if (smsBytes <= SMS_MAX_BYTES) {
    return { type: 'SMS', text: smsText, bytes: smsBytes };
  }
  return {
    type: 'LMS',
    subject: truncateBytes(cleanHeader ?? DEFAULT_LMS_SUBJECT, LMS_SUBJECT_MAX_BYTES),
    text: bodyWithoutEcho,
    bytes: smsByteLength(bodyWithoutEcho),
  };
}

/**
 * SMS를 Solapi로 발송한다. 기존 호출부(sendSolapiSms(phone, message))와 호환된다 —
 * 헤더가 필요한 경우만 options.header를 넘긴다.
 *
 * 기본값은 "SMS 전용": 조립 결과가 90바이트를 넘으면 Solapi를 부르지 않고 SmsTooLongError를 던진다.
 * (자동 LMS 전환 방지의 마지막 방어선. 길이 맞추기는 호출부 — 개입 메시지는 intervention/smsFit.ts — 의 몫)
 * 정말 긴 문자를 의도적으로 보내야 하는 별도 기능만 options.allowLms=true로 LMS를 허용한다.
 * 발신번호(SOLAPI_SENDER_NUMBER)는 Solapi에 사전 등록·승인된 번호여야 한다 (미등록 시 발송 실패).
 */
export async function sendSolapiSms(
  toPhone: string,
  message: string,
  options: { header?: string | null; allowLms?: boolean; logTag?: string } = {}
): Promise<ComposedSms> {
  const senderNumber = process.env.SOLAPI_SENDER_NUMBER;
  if (!senderNumber) {
    throw new Error('SOLAPI_SENDER_NUMBER 환경변수가 없습니다 (발신번호 등록 후 설정 필요)');
  }

  const composed = composeSms(message, options.header);
  const tag = options.logTag ?? 'Solapi SMS';

  if (composed.type === 'LMS' && !options.allowLms) {
    logSms(tag, { 'blocked: message exceeded 90 bytes': composed.bytes, type: 'LMS(차단)' }, composed.text);
    throw new SmsTooLongError(composed.bytes);
  }
  logSms(tag, { bytes: composed.bytes, type: composed.type }, composed.text);

  const messageService = getClient();

  const result = await messageService.send({
    to: toSolapiLocalNumber(toPhone),
    from: toSolapiLocalNumber(senderNumber),
    type: composed.type,
    text: composed.text,
    ...(composed.subject ? { subject: composed.subject } : {}),
  });

  const failedCount = (result as any)?.count?.registeredFailed ?? 0;
  if (failedCount > 0) {
    throw new Error(`Solapi 접수 실패 (registeredFailed=${failedCount})`);
  }
  return composed;
}
