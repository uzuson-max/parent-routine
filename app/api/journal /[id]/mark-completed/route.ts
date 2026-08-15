import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  await supabase.from("voice_entries").update({ call_state: "completed" }).eq("id", params.id);
  return NextResponse.json({ success: true });
}
