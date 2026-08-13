interface CallParams {
  routineId: string;
  phoneNumber: string;
  message: string;
  statusCallbackPath?: string; // 기본값: routines용 webhook
}

export async function sendRoutineCall({
  routineId, phoneNumber, message,
  statusCallbackPath = '/api/webhook/call-status',
}: CallParams) {
  const client = twilio(requireEnv('TWILIO_ACCOUNT_SID'), requireEnv('TWILIO_AUTH_TOKEN'));
  const baseUrl = requireEnv('APP_BASE_URL');
  const fromNumber = requireEnv('TWILIO_PHONE_NUMBER');
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
