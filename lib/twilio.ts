import twilio from 'twilio';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}가 설정되지 않았습니다.`);
  }
  return value;
}

const client = twilio(
  requireEnv('TWILIO_ACCOUNT_SID'),
  requireEnv('TWILIO_AUTH_TOKEN')
);

interface CallParams {
  routineId: string;
  phoneNumber: string;
  message: string;
}

export async function sendRoutineCall({ routineId, phoneNumber, message }: CallParams) {
  const baseUrl = requireEnv('APP_BASE_URL');
  const fromNumber = requireEnv('TWILIO_PHONE_NUMBER');

  try {
    const call = await client.calls.create({
      to: phoneNumber,
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
