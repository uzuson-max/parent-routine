import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { analyzeTranscript } from "@/lib/aiAnalysis";
import { transcribeAudio } from "@/lib/stt";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audioUrl } = body;

    if (!audioUrl) {
      console.error("[journal POST] audioUrl missing from request body:", body);
      return NextResponse.json({ success: false, error: "audioUrl is required" }, { status: 400 });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("voice_entries")
      .insert({ audio_url: audioUrl, call_state: "created" })
      .select()
      .single();

    if (insertError) {
      console.error("[journal POST] INSERT failed:", insertError.message, insertError.details);
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    console.log("[journal POST] inserted voice_entries row:", inserted.id);

    try {
      const transcript = await transcribeAudio(audioUrl);
      const analysis = await analyzeTranscript(transcript);

      const { error: updateError } = await supabase
        .from("voice_entries")
        .update({ transcript, analysis, call_message: analysis.callout })
        .eq("id", inserted.id);

      if (updateError) {
        console.error("[journal POST] analysis UPDATE failed:", updateError.message);
      }
    } catch (analysisErr: any) {
      // 분석 실패해도 entryId는 있으므로 사용자 흐름은 계속 진행되게 함
      console.error("[journal POST] STT/analysis step failed:", analysisErr.message);
    }

    return NextResponse.json({ entryId: inserted.id, hookReady: true });
  } catch (e: any) {
    console.error("[journal POST] unexpected error:", e.message, e.stack);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("voice_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("[journal GET] SELECT failed:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("[journal GET] unexpected error:", e.message);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
