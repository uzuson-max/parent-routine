import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseClient } from "./supabase";

const anthropic = new Anthropic();

export async function updateUserMemory(userId: string) {
  const supabase = getSupabaseClient();

  const { data: past } = await supabase
    .from("journal_entries")
    .select("excuses, contradictions")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const allExcuses = (past ?? []).flatMap((r) => r.excuses ?? []);
  const allContradictions = (past ?? []).flatMap((r) => r.contradictions ?? []);

  const summaryRes = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system: `최근 핑계/모순 목록을 보고 (1) 반복되는 핑계 3개 이내, (2) 반복 주제 3개 이내,
    (3) 한두 문장짜리 전체 패턴 요약을 JSON으로만 응답: {"recurring_excuses":[], "recurring_topics":[], "pattern_summary":""}`,
    messages: [{ role: "user", content: JSON.stringify({ excuses: allExcuses, contradictions: allContradictions }) }],
  });

  const block = summaryRes.content.find((b) => b.type === "text");
  const parsed = JSON.parse((block && "text" in block ? block.text : "{}").replace(/```json|```/g, "").trim());

  const { data: existing } = await supabase
    .from("user_memory")
    .select("entry_count")
    .eq("user_id", userId)
    .maybeSingle();

  await supabase.from("user_memory").upsert({
    user_id: userId,
    recurring_excuses: parsed.recurring_excuses,
    recurring_topics: parsed.recurring_topics,
    pattern_summary: parsed.pattern_summary,
    entry_count: (existing?.entry_count ?? 0) + 1,
    updated_at: new Date().toISOString(),
  });
}

export async function buildCallOpening(userId: string, latestEntry: { ai_callout_seed?: string }) {
  const supabase = getSupabaseClient();
  const { data: memory } = await supabase.from("user_memory").select("*").eq("user_id", userId).maybeSingle();

  const entryCount = memory?.entry_count ?? 0;
  const intensity = entryCount >= 7 ? "high" : entryCount >= 3 ? "medium" : "low";

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    system: `너는 반말로 참견하는 AI 친구다. intensity(low/medium/high)에 따라 강도를 조절해서
    통화 시작 첫 멘트 1~2문장을 만든다. high일수록 과거 패턴을 더 직접적으로 지적한다. 문장만 출력.`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          intensity,
          today_seed: latestEntry.ai_callout_seed,
          pattern_summary: memory?.pattern_summary,
          recurring_excuses: memory?.recurring_excuses,
        }),
      },
    ],
  });

  const block = res.content.find((b) => b.type === "text");
  return {
    opening_line: block && "text" in block ? block.text.trim() : "",
    intensity,
    show_pro_banner: entryCount >= 7,
  };
}
