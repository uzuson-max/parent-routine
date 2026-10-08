// app/api/user/export/route.ts
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// MY > 내 기록 내보내기 — 내가 한 말, 참견이 대답, 편지, 참견이가 알아챈 것을 사람이 읽을 수 있는 텍스트 한 파일로.
// "내 기록은 내 것"이라는 걸 실제로 보여주는 기능이라, 앱 안 화면과 같은 원문을 그대로 담는다.

const KST = 9 * 60 * 60 * 1000;
function kst(iso: string): string {
  const d = new Date(new Date(iso).getTime() + KST);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return new Response(JSON.stringify({ success: false, error: '인증 세션이 없습니다.' }), { status: 401 });

  try {
    const [me, entries, letters, insights] = await Promise.all([
      supabase.from('user_memory').select('nickname').eq('user_id', userId).maybeSingle(),
      supabase
        .from('voice_entries')
        .select('transcript, response, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(5000),
      supabase
        .from('letters')
        .select('title, content, created_at, status')
        .eq('user_id', userId)
        .eq('status', 'delivered')
        .order('created_at', { ascending: true }),
      supabase
        .from('memory_insights')
        .select('content, created_at, status')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
    ]);
    if (entries.error) throw new Error(entries.error.message);

    const lines: string[] = [];
    lines.push('참견이 — 내 기록');
    lines.push(`내보낸 시각: ${kst(new Date().toISOString())} (한국 시간)`);
    if (me.data?.nickname) lines.push(`닉네임: ${me.data.nickname}`);
    lines.push('');
    lines.push('==== 내가 한 말 ====');
    for (const e of entries.data ?? []) {
      const t = e.transcript as string | null;
      if (!t || t === '(음성 변환 실패)') continue;
      lines.push(`[${kst(e.created_at as string)}]`);
      lines.push(`나: ${t}`);
      const reply = (e.response as any)?.response;
      if (reply) lines.push(`참견이: ${reply}`);
      lines.push('');
    }
    if (!letters.error && (letters.data ?? []).length) {
      lines.push('==== 참견이의 편지 ====');
      for (const l of letters.data ?? []) {
        lines.push(`[${kst(l.created_at as string)}] ${l.title ?? ''}`);
        lines.push(String(l.content ?? ''));
        lines.push('');
      }
    }
    if (!insights.error && (insights.data ?? []).length) {
      lines.push('==== 참견이가 알아챈 거 ====');
      for (const i of insights.data ?? []) {
        lines.push(`[${kst(i.created_at as string)}] ${i.content}`);
      }
      lines.push('');
    }

    const today = kst(new Date().toISOString()).slice(0, 10);
    return new Response(lines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="chamgyeoni-${today}.txt"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('[api/user/export] 실패:', err?.message);
    return new Response(JSON.stringify({ success: false, error: '기록을 내보내지 못했어.' }), { status: 500 });
  }
}
