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

const SMS_MAX_BYTES = 90;
const LMS_SUBJECT_MAX_BYTES = 40;
const DEFAULT_LMS_SUBJECT = '참견이';

// 통신사 기준(EUC-KR) 바이트 수 근사: ASCII 1바이트, 그 외(한글/이모지 등) 2바이트.
export function smsByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    bytes += text.charCodeAt(i) <= 0x7f ? 1 : 2;
  }
  return bytes;
}

function truncateBytes(text: string, maxBytes: number): string {
  let out = '';
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const b = text.charCodeAt(i) <= 0x7f ? 1 : 2;
    if (bytes + b > maxBytes) break;
    out += text[i];
    bytes += b;
  }
  return out;
}

export interface ComposedSms {
  type: 'SMS' | 'LMS';
  subject?: string;
  text: string;
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
  if (smsByteLength(smsText) <= SMS_MAX_BYTES) {
    return { type: 'SMS', text: smsText };
  }
  return {
    type: 'LMS',
    subject: truncateBytes(cleanHeader ?? DEFAULT_LMS_SUBJECT, LMS_SUBJECT_MAX_BYTES),
    text: bodyWithoutEcho,
  };
}

/**
 * SMS/LMS를 Solapi로 발송한다. 기존 호출부(sendSolapiSms(phone, message))와 호환된다 —
 * 헤더가 필요한 경우만 options.header를 넘긴다.
 * 발신번호(SOLAPI_SENDER_NUMBER)는 Solapi에 사전 등록·승인된 번호여야 한다 (미등록 시 발송 실패).
 */
export async function sendSolapiSms(
  toPhone: string,
  message: string,
  options: { header?: string | null } = {}
): Promise<ComposedSms> {
  const senderNumber = process.env.SOLAPI_SENDER_NUMBER;
  if (!senderNumber) {
    throw new Error('SOLAPI_SENDER_NUMBER 환경변수가 없습니다 (발신번호 등록 후 설정 필요)');
  }

  const composed = composeSms(message, options.header);
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
