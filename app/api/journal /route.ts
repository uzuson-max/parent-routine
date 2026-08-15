import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { analyzeTranscript } from "@/lib/aiAnalysis";
import { transcribeAudio } from "@/lib/stt"; // 기존 STT 인프라 재사용

// 녹음 업로드 → STT → 분석 → 저장
export async function POST(request: NextRequest) {
  const { userId, audioUrl } = await request.json();
  const supabase = getSupabaseClient();

  const transcript = await transcribeAudio(audioUrl);
  const analysis = await analyzeTranscript(transcript);

  const { data, error } = await supabase
    .from("journal_entries")
    .insert({
      user_id: userId,
      audio_url: audioUrl,
      transcript,
      excuses: analysis.excuses,
      intentions: analysis.intentions,
      contradictions: analysis.contradictions,
      ai_callout: analysis.ai_callout_seed,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ entryId: data.id, hookReady: true });
}

// 히스토리 조회
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
