// lib/memoryEngine.ts
import { supabase } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// 통화 종료 후: 최근 voice_entries.analysis(jsonb)를 모아 user_memory를 재요약 (overwrite, append 아님)
// userPhone 기준으로 동작 — voice_entries에는 user_id가 없고 user_phone만 있음.
export async function updateUserMemory(userPhone: string) {
  if (!userPhone) {
    console.error("[memoryEngine] updateUserMemory called without userPhone");
    return;
  }

  try {
    const { data: past, error: pastError } = await supabase
      .from("voice_entries")
      .select("analysis")
      .eq("user_phone", userPhone)
      .not("analysis", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (pastError) {
      console.error("[memoryEngine] updateUserMemory: fetch past entries failed:", pastError.message);
      return;
    }

    const allExcuses = (past ?? []).flatMap((r: any) => r.analysis?.excuses ?? []);
    const allContradictions = (past ?? []).flatMap((r: any) => r.analysis?.contradictions ?? []);
    const allPatterns = (past ?? []).flatMap((r: any) => r.analysis?.patterns ?? []);
    const allTopics = (past ?? []).flatMap((r: any) => r.analysis?.topics ?? []);

    if (allExcuses.length === 0 && allContradictions.length === 0 && allPatterns.length === 0) {
      return; // 아직 분석된 과거 기록이 없으면 요약할 게 없음
    }

    const summaryRes = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: `최근 핑계/모순/패턴/주제 목록을 보고 (1) 반복되는 핑계 3개 이내, (2) 반복 주제 3개 이내,
      (3) 한두 문장짜리 전체 패턴 요약을 JSON으로만 응답: {"recurring_excuses":[], "recurring_topics":[], "pattern_summary":""}`,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            excuses: allExcuses,
            contradictions: allContradictions,
            patterns: allPatterns,
            topics: allTopics,
          }),
        },
      ],
    });

    const block = summaryRes.content.find((b) => b.type === "text");
    const parsed = JSON.parse((block && "text" in block ? block.text : "{}").replace(/```json|```/g, "").trim());

    const { data: existing } = await supabase
      .from("user_memory")
      .select("entry_count")
      .eq("user_id", userPhone) // ← user_phone에서 user_id로 변경
      .maybeSingle();

    const { error: upsertError } = await supabase.from("user_memory").upsert({
      user_id: userPhone, // ← user_phone에서 user_id로 변경
      recurring_excuses: parsed.recurring_excuses ?? [],
      recurring_topics: parsed.recurring_topics ?? [],
      pattern_summary: parsed.pattern_summary ?? "",
      entry_count: (existing?.entry_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    });

    if (upsertError) {
      console.error("[memoryEngine] updateUserMemory: upsert failed:", upsertError.message);
    }
  } catch (e: any) {
    // memory 갱신 실패는 통화 자체를 실패시키면 안 됨 — 로그만 남기고 조용히 종료
    console.error("[memoryEngine] updateUserMemory unexpected error:", e.message);
  }
}

// 통화 직전: entry_count 기반으로 참견 강도 결정 + 오프닝 대사 생성
export async function buildCallOpening(
  userPhone: string,
  latestEntry: { callout?: string; ai_observation?: string }
) {
  const fallback = {
    opening_line: latestEntry.callout || "할 말이 있어서 전화했어.",
    intensity: "low" as const,
    show_pro_banner: false,
  };

  if (!userPhone) {
    console.error("[memoryEngine] buildCallOpening called without userPhone");
    return fallback;
  }

  try {
    const { data: memory, error } = await supabase
      .from("user_memory")
      .select("*")
      .eq("user_id", userPhone) // ← user_phone에서 user_id로 변경
      .maybeSingle();

    if (error) {
      console.error("[memoryEngine] buildCallOpening: fetch memory failed:", error.message);
      return fallback;
    }

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
            today_observation: latestEntry.ai_observation,
            pattern_summary: memory?.pattern_summary,
            recurring_excuses: memory?.recurring_excuses,
          }),
        },
      ],
    });

    const block = res.content.find((b) => b.type === "text");
    return {
      opening_line: (block && "text" in block ? block.text.trim() : "") || fallback.opening_line,
      intensity,
      show_pro_banner: entryCount >= 7,
    };
  } catch (e: any) {
    console.error("[memoryEngine] buildCallOpening unexpected error:", e.message);
    return fallback;
  }
}
