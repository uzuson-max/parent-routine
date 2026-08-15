import twilio from "twilio";
import { getSupabaseClient } from "@/lib/supabase";
import { generateCallout } from "@/lib/aiAnalysis";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entryId")!;
  const intensity = url.searchParams.get("intensity")!;

  const formData = await request.formData();
  const userSpeech = (formData.get("SpeechResult") as string) ?? "";

  const supabase = getSupabaseClient();
  const { data: entry } = await supabase.from("journal_entries").select("*").eq("id", entryId).single();

  const callout = await generateCallout({ userSpeech, contradictions: entry.contradictions ?? [], intensity });
  await supabase.from("journal_entries").update({ ai_callout: callout }).eq("id", entryId);

  const twiml = new VoiceResponse();
  twiml.say({ language: "ko-KR" }, callout);
  twiml.say({ language: "ko-KR" }, "오늘 얘기는 여기까지. 결과는 앱에서 확인해.");

  return new Response(twiml.toString(), { headers: { "Content-Type": "text/xml" } });
}
