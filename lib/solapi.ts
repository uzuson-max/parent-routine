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

/**
 * SMS를 Solapi로 발송한다. lib/twilio.ts의 sendPenaltySms(toPhone, message)를 대체한다.
 * 발신번호(SOLAPI_SENDER_NUMBER)는 Solapi에 사전 등록·승인된 번호여야 한다 (미등록 시 발송 실패).
 */
export async function sendSolapiSms(toPhone: string, message: string): Promise<void> {
  const senderNumber = process.env.SOLAPI_SENDER_NUMBER;
  if (!senderNumber) {
    throw new Error('SOLAPI_SENDER_NUMBER 환경변수가 없습니다 (발신번호 등록 후 설정 필요)');
  }

  const messageService = getClient();

  const result = await messageService.send({
    to: toSolapiLocalNumber(toPhone),
    from: toSolapiLocalNumber(senderNumber),
    text: message,
  });

  const failedCount = (result as any)?.count?.registeredFailed ?? 0;
  if (failedCount > 0) {
    throw new Error(`Solapi 접수 실패 (registeredFailed=${failedCount})`);
  }
}
