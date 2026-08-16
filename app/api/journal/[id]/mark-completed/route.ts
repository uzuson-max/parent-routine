import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { error } = await supabase
      .from("voice_entries")
      .update({ call_state: "completed" })
      .eq("id", params.id);

    if (error) {
      console.error("[journal/[id]/mark-completed POST] UPDATE failed:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[journal/[id]/mark-completed POST] unexpected error:", e.message);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
