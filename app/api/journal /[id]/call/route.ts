import { NextResponse } from "next/server";
import twilio from "twilio";
import { getSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { phoneNumber } = await request.json();
  const supabase = getSupabaseClient();

  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  const call = await twilioClient.calls.create({
    to: phoneNumber,
    from: process.env.TWILIO_FROM_NUMBER!,
    url: `${process.env.BASE_URL}/api/webhook/twilio/voice?entryId=${params.id}`,
    statusCallback: `${process.env.BASE_URL}/api/webhook/twilio/status?entryId=${params.id}`,
    statusCallbackEvent: ["completed"],
  });

  await supabase.from("journal_entries").update({ call_status: "ringing", call_sid: call.sid }).eq("id", params.id);

  return NextResponse.json({ callStatus: "ringing", callSid: call.sid });
}
