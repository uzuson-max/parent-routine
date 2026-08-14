import { NextResponse } from "next/server";
import db from "@/lib/supabase"; // 또는 프로젝트의 db 연결 파일 경로
import { analyzeTranscript } from "@/lib/aiAnalysis";
// 기존 STT 함수가 있는 위치에 맞게 수정하세요 (예: "@/lib/aiAnalysis" 등)

export async function POST(req) {
  try {
    const { userId, audioUrl } = await req.json();

    // 임시로 STT 및 분석 처리 (기존 인프라에 맞게 함수 연결)
    // const transcript = await transcribeAudio(audioUrl);
    const transcript = "오늘도 핑계를 대며 미루었다."; 
    const analysis = await analyzeTranscript(transcript);

    const { data, error } = await db
      .from("journal_entries")
      .insert([
        {
          user_id: userId,
          audio_url: audioUrl,
          transcript: transcript,
          excuses: analysis.excuses,
          intentions: analysis.intentions,
          contradictions: analysis.contradictions,
          ai_callout: analysis.ai_callout_seed,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ entryId: data.id, hookReady: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
