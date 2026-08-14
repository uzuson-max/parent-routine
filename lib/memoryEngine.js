// backend/services/memoryEngine.js
const db = require("../db");
const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic();

// 통화 종료 후: 이번 entry를 반영해 UserMemory를 "재요약" (append 아님, overwrite)
async function updateUserMemory(userId, latestEntry) {
  const past = await db.query(
    `SELECT excuses, contradictions FROM journal_entries
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );

  const allExcuses = past.rows.flatMap((r) => r.excuses);
  const allContradictions = past.rows.flatMap((r) => r.contradictions);

  const summaryRes = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system: `최근 핑계/모순 목록을 보고 (1) 반복되는 핑계 3개 이내, (2) 반복 주제 3개 이내,
    (3) 한두 문장짜리 전체 패턴 요약을 JSON으로만 응답: {"recurring_excuses":[], "recurring_topics":[], "pattern_summary":""}`,
    messages: [
      { role: "user", content: JSON.stringify({ excuses: allExcuses, contradictions: allContradictions }) },
    ],
  });

  const parsed = JSON.parse(
    summaryRes.content.find((b) => b.type === "text").text.replace(/```json|```/g, "").trim()
  );

  await db.query(
    `INSERT INTO user_memory (user_id, recurring_excuses, recurring_topics, pattern_summary, entry_count, updated_at)
     VALUES ($1, $2, $3, $4, 1, now())
     ON CONFLICT (user_id) DO UPDATE SET
       recurring_excuses = $2, recurring_topics = $3, pattern_summary = $4,
       entry_count = user_memory.entry_count + 1, updated_at = now()`,
    [userId, parsed.recurring_excuses, parsed.recurring_topics, parsed.pattern_summary]
  );
}

// 통화 직전: entry_count 기반으로 참견 강도 결정 + 오프닝 대사 생성
async function buildCallOpening(userId, latestEntry) {
  const { rows } = await db.query(`SELECT * FROM user_memory WHERE user_id = $1`, [userId]);
  const memory = rows[0] ?? { entry_count: 0, pattern_summary: "", recurring_excuses: [] };

  const intensity = memory.entry_count >= 7 ? "high" : memory.entry_count >= 3 ? "medium" : "low";

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
          pattern_summary: memory.pattern_summary,
          recurring_excuses: memory.recurring_excuses,
        }),
      },
    ],
  });

  return {
    opening_line: res.content.find((b) => b.type === "text").text.trim(),
    intensity,
    show_pro_banner: memory.entry_count >= 7,
  };
}

module.exports = { updateUserMemory, buildCallOpening };
