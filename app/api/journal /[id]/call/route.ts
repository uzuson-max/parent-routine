import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabase } from "@/lib/supabase";
import { generateCallout } from "@/lib/aiAnalysis";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { phoneNumber, minutesDelay } = await request.json();
    const delay = Number(minutesDelay) || 0;

    if (!phoneNumber) {
      console.error("[journal/[id]/call POST] phoneNumber missing");
      return NextResponse.json({ success: false, error: "phoneNumber is required" }, { status: 400 });
    }

    // 예약(3분/10분 뒤)
    if (delay > 0) {
      const scheduledAt = new Date(Date.now() + delay * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("voice_entries")
        .update({ user_phone: phoneNumber, call_state: "pending", scheduled_at: scheduledAt })
        .eq("id", params.id);

      if (error) {
        console.error("[journal/[id]/call POST] schedule UPDATE failed:", error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ callState: "pending", scheduledAt });
    }

    // "지금 전화하기"
    await supabase.from("voice_entries").update({ user_phone: phoneNumber }).eq("id", params.id);

    const twilioConfigured = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
    );

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

        await supabase
          .from("voice_entries")
          .update({ call_state: "ringing", call_status: call.status })
          .eq("id", params.id);

        return NextResponse.json({ callState: "ringing" });
      } catch (e: any) {
        console.error("[journal/[id]/call POST] Twilio call failed, falling back to TTS:", e.message);
      }
    }

    // Plan B: 브라우저 TTS 폴백
    const { data: entry, error: fetchError } = await supabase
      .from("voice_entries")
      .select("*")
      .eq("id", params.id)
      .single();

    if (fetchError) {
      console.error("[journal/[id]/call POST] entry fetch failed:", fetchError.message);
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
    }

    const callout =
      entry?.call_message ||
      (await generateCallout({
        userSpeech: entry?.transcript || "",
        contradictions: entry?.analysis?.contradictions || [],
        intensity: "low",
      }));

    await supabase
      .from("voice_entries")
      .update({ call_message: callout, call_state: "fallback_ready" })
      .eq("id", params.id);

    return NextResponse.json({ callState: "fallback_ready", callout });
  } catch (e: any) {
    console.error("[journal/[id]/call POST] unexpected error:", e.message, e.stack);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
