import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import twilio from 'twilio';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function GET(request: Request) {
  // Vercel Cron Secret 보안 검증 (선택사항)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // 로컬 테스트 시 편의를 위해 주석 처리하거나 검증 강화 가능
  }

  const now = new Date().toISOString();

  // 1. scheduled_at이 지났고, 아직 전화를 안 건(call_state가 pending인) 항목 조회
  const { data: entries, error } = await supabase
    .from('voice_entries')
    .select('*')
    .eq('call_state', 'pending')
    .lte('scheduled_at', now);

  if (error || !entries) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }

  const results = [];

  for (const entry of entries) {
    try {
      // 2. Twilio TwiML 웹훅 URL 구성 (AI가 읽어줄 텍스트를 TwiML로 응답하는 엔드포인트 필요)
      // 간단하게는 twiml 인라인 파라미터를 쓰거나 TwiML Bin을 쓸 수 있습니다.
      const message = entry.call_message || "오늘도 핑계만 대실 건가요? 정신 차리세요.";
      const twiml = `<Response><Say language="ko">${message}</Say></Response>`;

      const call = await twilioClient.calls.create({
        twiml: twiml,
        to: entry.user_phone,
        from: process.env.TWILIO_PHONE_NUMBER!,
      });

      // 3. 발신 성공 처리
      await supabase
        .from('voice_entries')
        .update({ call_state: 'completed', call_status: call.status })
        .eq('id', entry.id);

      results.push({ id: entry.id, status: 'success' });
    } catch (err: any) {
      console.error(`전화 발신 실패 (${entry.id}):`, err.message);
      await supabase
        .from('voice_entries')
        .update({ call_state: 'call_failed', call_status: err.message })
        .eq('id', entry.id);

      results.push({ id: entry.id, status: 'failed', error: err.message });
    }
  }

  return NextResponse.json({ success: true, processed: results.length, results });
}
