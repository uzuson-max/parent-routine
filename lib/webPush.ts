// lib/webPush.ts
import webpush from 'web-push';
import { supabase } from '@/lib/supabase';

// ============================================================================
// 앱 알림(웹 푸시) 발송 — 서버 전용.
// 환경변수(Vercel): NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto:…)
// 구독 정보는 push_subscriptions 테이블(사용자/기기마다 한 줄). 만료된 구독(404/410)은 지운다.
// 홈 화면에 추가한 앱(아이폰 iOS 16.4+, 안드로이드)에서만 받을 수 있다.
// ============================================================================

let configured: boolean | null = null;
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:hello@example.com';
  if (!pub || !priv) {
    console.error('[webPush] VAPID 키가 없어 앱 알림을 보낼 수 없음 (문자로 대신 보냄)');
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // 알림을 누르면 열 주소
  tag?: string; // 같은 tag면 기기에서 앞 알림을 덮는다
}

export async function hasPushSubscription(userId: string): Promise<boolean> {
  if (!ensureConfigured()) return false;
  const { count, error } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) {
    console.error('[webPush] 구독 조회 실패:', error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/** 이 사용자의 모든 기기로 보낸다. 한 기기라도 받으면 sent>0. */
export async function sendWebPush(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!ensureConfigured()) return { sent: 0, failed: 0 };
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) throw new Error(`[webPush] 구독 조회 실패: ${error.message}`);

  let sent = 0;
  let failed = 0;
  const body = JSON.stringify(payload);
  await Promise.all(
    (subs ?? []).map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 6, // 6시간 안에 못 받으면 버린다 — 늦은 "오늘이지?"는 소음이다
          urgency: 'normal',
        });
        sent++;
        await supabase.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), failed_count: 0 }).eq('id', s.id);
      } catch (err: any) {
        failed++;
        const code = err?.statusCode;
        if (code === 404 || code === 410) {
          // 앱을 지웠거나 알림을 끈 기기 — 구독을 정리한다.
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        } else {
          console.error('[webPush] 발송 실패:', code, err?.body ?? err?.message);
        }
      }
    })
  );
  return { sent, failed };
}
