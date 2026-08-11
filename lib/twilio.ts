import twilio from 'twilio';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경변수 ${name}가 설정되지 않았습니다.`);
  return value;
}

function normalizePhoneNumber(raw: string): string {
  const digitsOnly = raw.replace(/[^0-9+]/g, '');
  if (digitsOnly.startsWith('+')) return digitsOnly;
  if (digitsOnly.startsWith('82')) return `+${digitsOnly}`;
  if (digitsOnly.startsWith('0')) return `+82${digitsOnly.slice(1)}`;
  return `+82${digitsOnly}`;
}

interface CallParams {
  routineId: string;
  phoneNumber: string;
  message: string;
}

export async function sendRoutineCall({ routineId, phoneNumber, message }: CallParams) {
  const client = twilio(requireEnv('TWILIO_ACCOUNT_SID'), requireEnv('TWILIO_AUTH_TOKEN'));
  const baseUrl = requireEnv('APP_BASE_URL');
  const fromNumber = requireEnv('TWILIO_PHONE_NUMBER');
  const toNumber = normalizePhoneNumber(phoneNumber);

  try {
    const call = await client.calls.create({
      to: toNumber,
      from: fromNumber,
      url: `${baseUrl}/api/twiml/call-script?msg=${encodeURIComponent(message)}`,
      statusCallback: `${baseUrl}/api/webhook/call-status?routineId=${routineId}`,
      statusCallbackEvent: ['completed', 'no-answer', 'busy', 'failed'],
    });
    return { success: true, sid: call.sid };
  } catch (err: any) {
    console.error('Twilio 발신 실패:', err.message);
    return { success: false, error: err.message };
  }
}
