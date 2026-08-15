import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabase } from "@/lib/supabase";
import { generateCallout } from "@/lib/aiAnalysis";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { phoneNumber, minutesDelay } = await request.json();
  const delay = Number(minutesDelay) || 0;

  // 예약(3분/10분 뒤): pending으로 저장, cron이 나중에 집행 (Task는 아직 이 경로 미완성 상태 유지)
  if (delay > 0) {
    const scheduledAt = new Date(Date.now() + delay * 60 * 1000).toISOString();
    await supabase
      .from("voice_entries")
      .update({ phone_number: phoneNumber, call_state: "pending", scheduled_at: scheduledAt })
      .eq("id", params.id);
    return NextResponse.json({ callState: "pending", scheduledAt });
  }

  // "지금 전화하기" (delay === 0)
  await supabase.from("voice_entries").update({ phone_number: phoneNumber }).eq("id", params.id);

  const twilioConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);

  // Plan A: Twilio 실제 발신 시도
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

      await supabase.from("voice_entries").update({ call_state: "ringing", call_sid: call.sid }).eq("id", params.id);
      return NextResponse.json({ callState: "ringing", callSid: call.sid });
    } catch (e: any) {
      console.error("Twilio call failed, falling back to TTS:", e.message);
      // Twilio 설정은 있지만 실제 발신 실패 → 아래 Plan B로 이어짐
    }
  }

  // Plan B: 실제 전화 연동이 없거나 실패 → 브라우저 내 TTS 재생용 팩폭 멘트를 즉시 생성
  const { data: entry } = await supabase.from("voice_entries").select("*").eq("id", params.id).single();

  const callout =
    entry?.ai_callout ||
    (await generateCallout({
      userSpeech: entry?.transcript || "",
      contradictions: entry?.contradictions || [],
      intensity: "low",
    }));

  await supabase.from("voice_entries").update({ ai_callout: callout, call_state: "fallback_ready" }).eq("id", params.id);

  return NextResponse.json({ callState: "fallback_ready", callout });
}
