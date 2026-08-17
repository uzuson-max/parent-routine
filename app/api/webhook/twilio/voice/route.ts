import twilio from "twilio";
import { getSupabaseClient } from "@/lib/supabase";
import { buildCallOpening } from "@/lib/memoryEngine";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entryId")!;

  const supabase = getSupabaseClient();
  
  // 💡 1. journal_entries -> voice_entries 로 테이블명 변경 반영
  const { data: entry } = await supabase.from("voice_entries").select("*").eq("id", entryId).single();

  // 💡 2. entry.user_id -> entry.user_phone 으로 필드명 변경 반영
  const { opening_line, intensity } = await buildCallOpening(entry.user_phone, entry);

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: ["speech"],
    action: `/api/webhook/twilio/voice/turn2?entryId=${entryId}&intensity=${intensity}`,
    speechTimeout: "auto",
    language: "ko-KR",
  });
  gather.say({ language: "ko-KR" }, `${opening_line} 왜 그랬는지 한번 말해봐.`);
  twiml.say({ language: "ko-KR" }, "말 안 하는 것도 답이네. 다음엔 진짜로 해보자.");

  return new Response(twiml.toString(), { headers: { "Content-Type": "text/xml" } });
}
