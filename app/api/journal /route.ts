import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { analyzeTranscript } from "@/lib/aiAnalysis";
import { transcribeAudio } from "@/lib/stt";

// 녹음 업로드 → 저장 → STT → 분석 → analysis(jsonb)/call_message 갱신
export async function POST(request: NextRequest) {
  const { audioUrl } = await request.json();

  const { data: inserted, error: insertError } = await supabase
    .from("voice_entries")
    .insert({ audio_url: audioUrl, call_state: "created" })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
  }

  try {
    const transcript = await transcribeAudio(audioUrl);
    const analysis = await analyzeTranscript(transcript);

    await supabase
      .from("voice_entries")
      .update({
        transcript,
        analysis, // { excuses, intentions, contradictions, callout }
        call_message: analysis.callout,
      })
      .eq("id", inserted.id);
  } catch (e: any) {
    console.error("analysis failed:", e.message);
  }

  return NextResponse.json({ entryId: inserted.id, hookReady: true });
}

export async function GET(request: NextRequest) {
  const { data, error } = await supabase
    .from("voice_entries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
