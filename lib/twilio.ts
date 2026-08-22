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
    console.error('Twilio 발신 실패:', err.message);
    return { success: false, error: err.message };
  }
}

export async function sendPenaltySms(penaltyPhone: string, userPhone: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio credentials missing');
  }
  const client = twilio(accountSid, authToken);
  const to = normalizePhoneNumber(penaltyPhone);
  await client.messages.create({
    to,
    from: fromNumber,
    body: `[긴급] 사용자님이 오늘도 핑계를 대며 기상에 실패했습니다. 벌칙 수행을 독려해 주세요.`,
  });
}
