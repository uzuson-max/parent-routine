import { getSupabaseClient } from "@/lib/supabase";
import { updateUserMemory } from "@/lib/memoryEngine";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entryId")!;

  const formData = await request.formData();
  const callStatus = formData.get("CallStatus") as string;
  const callDuration = formData.get("CallDuration") as string;

  const supabase = getSupabaseClient();
  const { data: entry } = await supabase
    .from("journal_entries")
    .update({ call_status: callStatus, call_duration: Number(callDuration) || null })
    .eq("id", entryId)
    .select()
    .single();

  if (entry && callStatus === "completed") {
    await updateUserMemory(entry.user_id);
  }

  return new Response(null, { status: 200 });
}
