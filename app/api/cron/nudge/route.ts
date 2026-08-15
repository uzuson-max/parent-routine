// Vercel Cron으로 스케줄 등록 (예: 매일 오전 10시). 며칠째 안 쓴 유저에게 리마인드 SMS.
import { NextResponse } from "next/server";
import twilio from "twilio";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const { data: users } = await supabase
    .from("user_memory")
    .select("user_id, entry_count, users(phone)")
    .lt("updated_at", twoDaysAgo);

  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  for (const user of users ?? []) {
    const msg = (user.entry_count ?? 0) >= 3 ? "아직도 그 핑계 그대로야? 오늘도 한마디 해줄게." : "오늘 머릿속에 있는 거, 한마디만 해봐.";
    await twilioClient.messages.create({
      to: (user as any).users.phone,
      from: process.env.TWILIO_FROM_NUMBER!,
      body: msg,
    });
  }

  return NextResponse.json({ success: true, notified: users?.length ?? 0 });
}
