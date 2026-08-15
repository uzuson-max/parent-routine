// CallingScreen이 폴링으로 call_status를 확인할 때 씀
import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("journal_entries").select("*").eq("id", params.id).single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
