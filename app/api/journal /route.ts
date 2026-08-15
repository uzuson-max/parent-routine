import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { analyzeTranscript } from "@/lib/aiAnalysis";
import { transcribeAudio } from "@/lib/stt";

// Task 1: 녹음 업로드 → STT → 분석 → DB 저장
export async function POST(request: NextRequest) {
  const { userId, audioUrl } = await request.json();

  // 1단계: 오디오 URL만이라도 먼저 저장 (STT/분석이 실패해도 데이터는 남도록)
  const { data: inserted, error: insertError } = await supabase
    .from("voice_entries")
    .insert({ user_id: userId, audio_url: audioUrl, call_state: "created" })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
  }

  // 2단계: STT + 분석 (여기서 실패해도 entryId는 이미 있으니 사용자 흐름은 안 끊김)
  try {
    const transcript = await transcribeAudio(audioUrl);
    const analysis = await analyzeTranscript(transcript);

    await supabase
      .from("voice_entries")
      .update({
        transcript,
        excuses: analysis.excuses,
        intentions: analysis.intentions,
        contradictions: analysis.contradictions,
        ai_callout: analysis.ai_callout_seed,
      })
      .eq("id", inserted.id);
  } catch (e: any) {
    // 분석 실패해도 entryId는 반환 — 프론트는 계속 다음 단계로 진행 가능
    console.error("analysis failed:", e.message);
  }

  return NextResponse.json({ entryId: inserted.id, hookReady: true });
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const { data, error } = await supabase
    .from("voice_entries")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
