// app/api/user/delete/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ============================================================================
// MY > 회원탈퇴 — 실제로 지운다.
// 1) 녹음 파일(storage voice-recordings) 경로를 먼저 모아두고
// 2) 이 사용자의 행을 자식 테이블부터 전부 지운 뒤
// 3) 녹음 파일을 지우고
// 4) 마지막에 로그인 계정(auth.users)을 지운다.
// 중간에 한 테이블이라도 못 지우면 계정은 남겨둔 채 멈춘다 — 계정만 사라지고 데이터가 남는 일이 없게.
// 아직 만들지 않은 테이블(예: feedback migration 전)은 건너뛴다.
// ============================================================================

const TABLES_IN_ORDER = [
  'intervention_log',
  'letters',
  'monthly_reflections',
  'memory_insights',
  'memory_links',
  'memory_units',
  'entities',
  'commitment_memory',
  'event_memory',
  'pattern_memory',
  'voice_entries',
  'feedback',
  'user_memory',
];

const BUCKET = 'voice-recordings';

function storagePath(url: string | null): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}

function tableMissing(err: { code?: string; message?: string }): boolean {
  return err.code === '42P01' || /does not exist|schema cache/i.test(err.message ?? '');
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== '탈퇴') {
    return NextResponse.json({ success: false, error: "확인 문구가 달라. '탈퇴'라고 적어줘." }, { status: 400 });
  }

  try {
    // 1) 녹음 파일 경로
    const { data: audioRows, error: audioErr } = await supabase
      .from('voice_entries')
      .select('audio_url')
      .eq('user_id', userId)
      .not('audio_url', 'is', null)
      .limit(10000);
    if (audioErr) throw new Error(`녹음 목록 조회 실패: ${audioErr.message}`);
    const paths = (audioRows ?? []).map((r) => storagePath(r.audio_url as string)).filter((p): p is string => !!p);

    // 2) 데이터
    for (const table of TABLES_IN_ORDER) {
      const { error } = await supabase.from(table).delete().eq('user_id', userId);
      if (error) {
        if (tableMissing(error)) continue;
        throw new Error(`${table} 삭제 실패: ${error.message}`);
      }
    }

    // 3) 녹음 파일 — 실패해도 데이터는 이미 지워졌으니 기록만 남기고 계속
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
      if (error) console.error('[api/user/delete] 녹음 파일 삭제 일부 실패:', error.message);
    }

    // 4) 로그인 계정
    const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
    if (authErr) throw new Error(`계정 삭제 실패: ${authErr.message}`);

    console.log(`[api/user/delete] 사용자 ${userId} 탈퇴 완료 (녹음 파일 ${paths.length}개)`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[api/user/delete] 실패:', err?.message);
    return NextResponse.json(
      { success: false, error: '탈퇴 처리 중 문제가 생겼어. 의견 보내기로 알려주면 직접 지울게.' },
      { status: 500 }
    );
  }
}
