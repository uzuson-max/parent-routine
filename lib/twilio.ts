import twilio from 'twilio';

interface CallParams {
  routineId: string;
  phoneNumber: string;
  message: string;
  statusCallbackPath?: string;
}

function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '+82' + cleaned.slice(1);
  }
  return cleaned;
}

export async function sendRoutineCall({
  routineId,
  phoneNumber,
  message,
  statusCallbackPath = '/api/webhook/voice-call-status',
}: CallParams) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const baseUrl = process.env.APP_BASE_URL;
  const fromNumber = process.env.TWILIO_FROM_NUMBER; // ← 이 이름 하나로 통일. TWILIO_PHONE_NUMBER 폴백 제거.

  console.log("=== TWILIO DEBUG ===");
  console.log("accountSid length:", accountSid ? accountSid.length : 0);
  console.log("authToken length:", authToken ? authToken.length : 0);
  console.log("fromNumber:", fromNumber);
  console.log("baseUrl:", baseUrl);

  if (!accountSid || !authToken) {
    console.error('Twilio 인증 정보(ACCOUNT_SID 또는 AUTH_TOKEN)가 설정되지 않았습니다.');
    return { success: false, error: 'Twilio credentials missing' };
  }
  if (!fromNumber) {
    console.error('TWILIO_FROM_NUMBER가 설정되지 않았습니다.');
    return { success: false, error: 'TWILIO_FROM_NUMBER missing' };
  }
  if (!baseUrl) {
    console.error('APP_BASE_URL이 설정되지 않았습니다.');
    return { success: false, error: 'APP_BASE_URL missing' };
  }

  const client = twilio(accountSid, authToken);
  const toNumber = normalizePhoneNumber(phoneNumber);

  try {
    const call = await client.calls.create({
      to: toNumber,
      from: fromNumber,
      url: `${baseUrl}/api/twiml/call-script?msg=${encodeURIComponent(message)}`,
      statusCallback: `${baseUrl}${statusCallbackPath}?routineId=${routineId}`,
      statusCallbackEvent: ['completed', 'no-answer', 'busy', 'failed'],
    });
    return { success: true, sid: call.sid };
  } catch (err: any) {
    // err.message만으로는("Policy evaluation failed" 같은 경우) 원인을 못 찾는다 —
    // Twilio Node SDK의 RestException은 code(트윌로 에러 코드, 예: 21216)와
    // moreInfo(그 코드 설명 문서 링크)를 같이 들고 있어서, 로그에 같이 남겨야
    // Twilio 콘솔/문서에서 바로 원인을 찾을 수 있다.
    console.error('Twilio 발신 실패:', {
      message: err.message,
      code: err.code,
      status: err.status,
      moreInfo: err.moreInfo,
    });
    return { success: false, error: err.message, code: err.code, moreInfo: err.moreInfo };
  }
}

export async function sendPenaltySms(toPhone: string, message: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio credentials missing');
  }
  const client = twilio(accountSid, authToken);
  const to = normalizePhoneNumber(toPhone);
  await client.messages.create({
    to,
    from: fromNumber,
    body: message,
  });
}
