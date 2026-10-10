// app/api/push/subscribe/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ============================================================================
// 앱 알림(웹 푸시) 구독 저장/삭제/상태.
//   POST   { subscription: PushSubscriptionJSON }  — 이 기기를 등록(같은 endpoint면 갱신)
//   DELETE { endpoint }                            — 이 기기 해제
//   GET                                            — 이 계정에 등록된 기기가 있는지
// ============================================================================

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  const { count, error } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: { subscribed: (count ?? 0) > 0 } });
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const sub = body?.subscription;
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : '';
  const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : '';
  if (!endpoint.startsWith('https://') || !p256dh || !auth) {
    return NextResponse.json({ success: false, error: '구독 정보가 올바르지 않아.' }, { status: 400 });
  }
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      user_agent: (request.headers.get('user-agent') || '').slice(0, 300),
      failed_count: 0,
    },
    { onConflict: 'endpoint' }
  );
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  let q = supabase.from('push_subscriptions').delete().eq('user_id', userId);
  if (endpoint) q = q.eq('endpoint', endpoint);
  const { error } = await q;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
