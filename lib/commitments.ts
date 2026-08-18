import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 사용자 발화(transcript)에서 시간이 결합된 약속을 추출해 commitments 테이블에 저장
export async function extractAndSaveCommitments(userPhone: string, transcriptText: string) {
  if (!userPhone || !transcriptText) return;

  try {
    const now = new Date();
    const nowKST = now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `현재 시각은 ${nowKST} (한국시간)이다. 아래 사용자 발화에서 "언제까지 무엇을 하겠다"는
      명확한 시간이 있는 약속만 추출한다. "이따가", "곧", "나중에"처럼 시간이 불명확하면 제외한다.
      JSON으로만 응답: {"commitments":[{"text":"", "due_at":"ISO8601"}]}
      약속이 없으면 {"commitments":[]}`,
        },
        { role: "user", content: transcriptText },
      ],
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

    const commitments = parsed.commitments ?? [];
    if (commitments.length === 0) return;

    const rows = commitments.map((c: { text: string; due_at: string }) => ({
      user_phone: userPhone,
      text: c.text,
      due_at: c.due_at,
      status: "pending",
    }));

    const { error } = await supabase.from("commitments").insert(rows);
    if (error) {
      console.error("[commitments] insert failed:", error.message);
    }
  } catch (e: any) {
    console.error("[commitments] extractAndSaveCommitments unexpected error:", e.message);
  }
}
