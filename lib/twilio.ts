import twilio from 'twilio';

interface CallParams {
  routineId: string;
  phoneNumber: string;
  message: string;
  statusCallbackPath?: string;
}

// 환경변수 체크를 안전하게 해주는 함수
function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

// 전화번호 정규화 함수 (국내 번호 기준 예외처리)
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
  statusCallbackPath = '/api/webhook/call-status',
}: CallParams) {
  const client = twilio(getEnv('TWILIO_ACCOUNT_SID'), getEnv('TWILIO_AUTH_TOKEN'));
  const baseUrl = getEnv('APP_BASE_URL');
  const fromNumber = process.env.TWILIO_FROM_NUMBER || getEnv('TWILIO_PHONE_NUMBER');
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
  const client = twilio(getEnv('TWILIO_ACCOUNT_SID'), getEnv('TWILIO_AUTH_TOKEN'));
  const fromNumber = process.env.TWILIO_FROM_NUMBER || getEnv('TWILIO_PHONE_NUMBER');
  const to = normalizePhoneNumber(penaltyPhone);

  await client.messages.create({
    to,
    from: fromNumber,
    body: `[긴급] 사용자님이 오늘도 핑계를 대며 기상에 실패했습니다. 벌칙 수행을 독려해 주세요.`,
  });
}
