import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio") as File | null;

    if (!audio) {
      console.error("[upload-audio] no file received in formData");
      return NextResponse.json({ success: false, error: "audio file missing" }, { status: 400 });
    }

    const fileName = `${crypto.randomUUID()}.webm`;
    const arrayBuffer = await audio.arrayBuffer();

    const { data, error: uploadError } = await supabase.storage
      .from("voice-recordings") // Supabase Storage 버킷 이름 — 아래 확인사항 참고
      .upload(fileName, arrayBuffer, { contentType: "audio/webm" });

    if (uploadError) {
      console.error("[upload-audio] Supabase Storage upload failed:", uploadError.message);
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from("voice-recordings").getPublicUrl(data.path);

    return NextResponse.json({ audioUrl: publicUrlData.publicUrl });
  } catch (e: any) {
    console.error("[upload-audio] unexpected error:", e.message, e.stack);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
