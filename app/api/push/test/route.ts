// app/api/push/test/route.ts
import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ============================================================================
// 앱 알림 진단용 — 등록된 모든 기기로 테스트 알림을 한 번 보내고,
// 애플/구글 푸시 서버가 실제로 뭐라고 대답했는지(상태코드·본문)를 그대로 돌려준다.
// 인증: Authorization: Bearer CRON_SECRET (다른 크론과 동일). 사용자 화면과는 무관.
// 실패해도 구독을 지우지 않는다(진단만).
// ============================================================================
async function handle(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

   const pub = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || '').trim() || 'mailto:hello@example.com';
  const env = {
    hasPublicKey: !!pub,
    hasPrivateKey: !!priv,
    publicKeyHead: pub ? pub.slice(0, 12) : null,
    subject,
    subjectFromEnv: !!process.env.VAPID_SUBJECT,
  };
  if (!pub || !priv) return NextResponse.json({ ok: false, reason: 'VAPID 키 없음', env });

  try {
    webpush.setVapidDetails(subject, pub, priv);
  } catch (e: any) {
    return NextResponse.json({ ok: false, reason: 'VAPID 설정 오류', detail: e?.message, env });
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, created_at');
  if (error) return NextResponse.json({ ok: false, reason: '구독 조회 실패', detail: error.message, env });

  const body = JSON.stringify({
    title: '참견이',
    body: '테스트야. 이거 보이면 알림은 살아 있는 거야',
    url: '/',
    tag: 'push-test',
  });

  const results = await Promise.all(
    (subs ?? []).map(async (s: any) => {
      const host = (() => {
        try {
          return new URL(s.endpoint).host;
        } catch {
          return 'invalid';
        }
      })();
      try {
        const r = await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 600, urgency: 'high' }
        );
        await supabase
          .from('push_subscriptions')
          .update({ last_success_at: new Date().toISOString(), failed_count: 0 })
          .eq('id', s.id);
        return { id: s.id, host, createdAt: s.created_at, ok: true, statusCode: r.statusCode };
      } catch (err: any) {
        return {
          id: s.id,
          host,
          createdAt: s.created_at,
          ok: false,
          statusCode: err?.statusCode ?? null,
          body: typeof err?.body === 'string' ? err.body.slice(0, 300) : null,
          message: err?.message ?? String(err),
        };
      }
    })
  );

  return NextResponse.json({ ok: results.some((r) => r.ok), env, count: results.length, results });
}

export const GET = handle;
export const POST = handle;
