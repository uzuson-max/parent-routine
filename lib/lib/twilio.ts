import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

interface CallParams {
  routineId: string;
  phoneNumber: string;
  message: string;
}

export async function sendRoutineCall({ routineId, phoneNumber, message }: CallParams) {
  const baseUrl = process.env.APP_BASE_URL;

  try {
    const call = await client.calls.create({
      to: phoneNumber,
      from: process.env.TWILIO_NUMBER as string,
      url: `${baseUrl}/api/twiml/call-script?routineId=${routineId}&msg=${encodeURIComponent(message)}`,
      statusCallback: `${baseUrl}/api/webhook/call-status?routineId=${routineId}`,
      statusCallbackEvent: ['completed', 'no-answer', 'busy', 'failed'],
    });
    return { success: true, sid: call.sid };
  } catch (err: any) {
    console.error('Twilio 발신 실패:', err.message);
    return { success: false, error: err.message };
  }
}
