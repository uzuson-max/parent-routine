import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function sendRoutineCall({ routineId, phoneNumber, message }: { routineId: string, phoneNumber: string, message: string }) {
  return await client.calls.create({
    twiml: `<Response><Say language="ko-KR">${message}</Say></Response>`,
    to: phoneNumber,
    from: process.env.TWILIO_PHONE_NUMBER,
  });
}
