// app/api/user/settings/route.ts
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { loadUserPrefs, saveUserPrefs } from '@/lib/userPrefs';

export const dynamic = 'force-dynamic';

// MY > 참견 받는 방법. 저장된 값은 pushGate(선제 문자)와 voice/upload(전화)가 실제로 읽는다.
export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  try {
    const { prefs, migrationNeeded } = await loadUserPrefs(userId);
    return NextResponse.json({ success: true, data: prefs, migrationNeeded });
  } catch (err: any) {
    console.error('[api/user/settings] 조회 실패:', err?.message);
    return NextResponse.json({ success: false, error: '설정을 불러오지 못했어.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const patch: Record<string, any> = {};
    if (typeof body.outreachEnabled === 'boolean') patch.outreachEnabled = body.outreachEnabled;
    if (typeof body.interventionLevel === 'string') patch.interventionLevel = body.interventionLevel;
    if (typeof body.quietStartHour === 'number') patch.quietStartHour = body.quietStartHour;
    if (typeof body.quietEndHour === 'number') patch.quietEndHour = body.quietEndHour;
    const result = await saveUserPrefs(userId, patch);
    if (!result.ok) {
      const status = result.migrationNeeded ? 503 : 400;
      if (result.migrationNeeded) console.error('[api/user/settings] user_memory 설정 컬럼 없음 — docs/sql/2026-10-08_my_settings.sql 적용 필요');
      return NextResponse.json({ success: false, error: result.error, migrationNeeded: !!result.migrationNeeded }, { status });
    }
    return NextResponse.json({ success: true, data: result.prefs });
  } catch (err: any) {
    console.error('[api/user/settings] 저장 실패:', err?.message);
    return NextResponse.json({ success: false, error: '설정을 저장하지 못했어.' }, { status: 500 });
  }
}
