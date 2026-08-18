import { supabase } from "@/lib/supabase";
import { buildCallOpening } from "@/lib/memoryEngine";
// TODO: 실제 Twilio 발신 함수 import로 교체
// import { placeInterventionCall } from "@/lib/callModule";

export async function GET() {
  const { data: due, error } = await supabase
    .from("commitments")
    .select("*")
    .lte("due_at", new Date().toISOString())
    .eq("status", "pending");

  if (error) {
    console.error("[check-commitments] fetch failed:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!due || due.length === 0) {
    return Response.json({ checked: 0 });
  }

  for (const c of due) {
    // 먼저 status를 triggered로 바꿔서 중복 발신 방지
    await supabase.from("commitments").update({ status: "triggered" }).eq("id", c.id);

    try {
      const opening = await buildCallOpening(c.user_phone, {
        ai_observation: c.text,
      });

      // TODO: 여기서 실제 Twilio 발신 함수 호출
      // await placeInterventionCall(c.user_phone, opening.opening_line);

      console.log("[check-commitments] would call:", c.user_phone, opening.opening_line);

      await supabase.from("commitments").update({ status: "done" }).eq("id", c.id);
    } catch (e: any) {
      console.error("[check-commitments] call failed for", c.id, e.message);
      // 실패 시 pending으로 되돌려서 다음 폴링에서 재시도할지 여부는 정책 결정 필요
    }
  }

  return Response.json({ checked: due.length });
}
