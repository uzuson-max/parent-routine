import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entryId")!;

  const formData = await request.formData();
  const twilioStatus = formData.get("CallStatus") as string; // Twilio 원시 상태

  // call_status: Twilio 원시 값 그대로 저장
  // call_state: 우리 앱 흐름 상태로 매핑 (completed/no_answer/failed만 프론트가 폴링에서 감지)
  const stateMap: Record<string, string> = {
    completed: "completed",
    "no-answer": "no_answer",
    failed: "failed",
    busy: "failed",
    canceled: "failed",
  };

  await supabase
    .from("voice_entries")
    .update({ call_status: twilioStatus, call_state: stateMap[twilioStatus] ?? "ringing" })
    .eq("id", entryId);

  return new Response(null, { status: 200 });
}
