import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabase } from "@/lib/supabase";
import { generateCallout } from "@/lib/aiAnalysis";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { phoneNumber, minutesDelay } = await request.json();
  const delay = Number(minutesDelay) || 0;

  // 예약(3분/10분 뒤)
  if (delay > 0) {
    const scheduledAt = new Date(Date.now() + delay * 60 * 1000).toISOString();
    await supabase
      .from("voice_entries")
      .update({ user_phone: phoneNumber, call_state: "pending", scheduled_at: scheduledAt })
      .eq("id", params.id);
    return NextResponse.json({ callState: "pending", scheduledAt });
  }

  // "지금 전화하기"
  await supabase.from("voice_entries").update({ user_phone: phoneNumber }).eq("id", params.id);

  const twilioConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);

  // Plan A: Twilio 실제 발신
  if (twilioConfigured) {
    try {
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const call = await twilioClient.calls.create({
        to: phoneNumber,
        from: process.env.TWILIO_FROM_NUMBER!,
        url: `${process.env.BASE_URL}/api/webhook/twilio/voice?entryId=${params.id}`,
        statusCallback: `${process.env.BASE_URL}/api/webhook/twilio/status?entryId=${params.id}`,
        statusCallbackEvent: ["completed"],
      });

      // call_sid 저장할 컬럼이 없으므로 call_status에 Twilio 원시 상태를 기록
      await supabase.from("voice_entries").update({ call_state: "ringing", call_status: call.status }).eq("id", params.id);
      return NextResponse.json({ callState: "ringing" });
    } catch (e: any) {
      console.error("Twilio call failed, falling back to TTS:", e.message);
    }
  }

  // Plan B: 브라우저 TTS 폴백
  const { data: entry } = await supabase.from("voice_entries").select("*").eq("id", params.id).single();

  const callout =
    entry?.call_message ||
    (await generateCallout({
      userSpeech: entry?.transcript || "",
      contradictions: entry?.analysis?.contradictions || [],
      intensity: "low",
    }));

  await supabase.from("voice_entries").update({ call_message: callout, call_state: "fallback_ready" }).eq("id", params.id);

  return NextResponse.json({ callState: "fallback_ready", callout });
}
