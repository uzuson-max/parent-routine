import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ANALYSIS_ENABLED = !!process.env.OPENAI_API_KEY; // ← ANTHROPIC_API_KEY에서 변경

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
    if (ANALYSIS_ENABLED) {
      try {
        const { transcribeAudio } = await import("@/lib/stt");
        const { analyzeTranscript } = await import("@/lib/aiAnalysis");
        const transcript = await transcribeAudio(audioUrl);
        const analysis = await analyzeTranscript(transcript);
        await supabase
          .from("voice_entries")
          .update({ transcript, analysis, call_message: analysis.callout })
          .eq("id", inserted.id);
      } catch (analysisErr: any) {
        console.error("[journal POST] STT/analysis step failed:", analysisErr.message);
      }
    } else {
      // OPENAI_API_KEY 없을 때: 분석 건너뛰고 임시 멘트로 대체
      await supabase
        .from("voice_entries")
        .update({ call_message: "오늘도 미루기만 하네. 나중에 진짜 얘기하자." })
        .eq("id", inserted.id);
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
