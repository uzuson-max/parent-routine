import twilio from 'twilio';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}가 설정되지 않았습니다.`);
  }
  return value;
}

interface CallParams {
  routineId: string;
  phoneNumber: string;
  message: string;
}

export async function sendRoutineCall({ routineId, phoneNumber, message }: CallParams) {
  const client = twilio(
    requireEnv('TWILIO_ACCOUNT_SID'),
    requireEnv('TWILIO_AUTH_TOKEN')
  );

  const baseUrl = requireEnv('APP_BASE_URL');
  const fromNumber = requireEnv('TWILIO_PHONE_NUMBER');

  // 트라이얼 계정이 웹훅 설정을 막아두었으므로, URL을 명시적으로 강제 주입합니다.
  const twimlUrl = `${baseUrl}/api/twiml/call-script?msg=${encodeURIComponent(message)}`;

  try {
    const call = await client.calls.create({
      to: phoneNumber,
      from: fromNumber,
      url: twimlUrl, // 이 부분이 트라이얼 기본 안내 대신 우리 서버를 바라보게 강제합니다.
      statusCallback: `${baseUrl}/api/webhook/call-status?routineId=${routineId}`,
      statusCallbackEvent: ['completed', 'no-answer', 'busy', 'failed'],
    });
    return { success: true, sid: call.sid };
  } catch (err: any) {
    console.error('Twilio 발신 실패:', err.message);
    return { success: false, error: err.message };
  }
}
