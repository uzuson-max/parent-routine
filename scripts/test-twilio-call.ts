import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function testCall(toNumber: string, message: string) {
  try {
    const call = await client.calls.create({
      to: toNumber,
      from: process.env.TWILIO_FROM_NUMBER!,
      twiml: `<Response><Say language="ko-KR">${message}</Say></Response>`,
    });
    console.log("[testCall] SUCCESS. Call SID:", call.sid, "status:", call.status);
  } catch (e: any) {
    console.error("[testCall] FAILED.");
    console.error("code:", e.code, "message:", e.message, "moreInfo:", e.moreInfo);
  }
}

testCall(process.env.TEST_PHONE_NUMBER!, "테스트 전화입니다.");
