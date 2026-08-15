// app/api/journal/[id]/call/route.ts
import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { phoneNumber, minutesDelay } = await request.json();
  const delay = Number(minutesDelay) || 0;

  // "지금"인 경우: 바로 발신
  if (delay === 0) {
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const call = await twilioClient.calls.create({
      to: phoneNumber,
      from: process.env.TWILIO_FROM_NUMBER!,
      url: `${process.env.BASE_URL}/api/webhook/twilio/voice?entryId=${params.id}`,
      statusCallback: `${process.env.BASE_URL}/api/webhook/twilio/status?entryId=${params.id}`,
      statusCallbackEvent: ["completed"],
    });

    await supabase
      .from("voice_entries")
      .update({ phone_number: phoneNumber, call_state: "ringing", call_sid: call.sid })
      .eq("id", params.id);

    return NextResponse.json({ callState: "ringing", callSid: call.sid });
  }

  // 예약 발신: scheduled_at을 미래로 설정, call_state는 'pending'
  // 실제 발신은 기존 app/api/cron/call/route.ts (Vercel Cron)가 scheduled_at 지난 pending 건을 찾아 집행
  const scheduledAt = new Date(Date.now() + delay * 60 * 1000).toISOString();

  await supabase
    .from("voice_entries")
    .update({ phone_number: phoneNumber, call_state: "pending", scheduled_at: scheduledAt })
    .eq("id", params.id);

  return NextResponse.json({ callState: "pending", scheduledAt });
}
