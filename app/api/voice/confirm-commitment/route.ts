import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { confirmCommitment } from '@/lib/analysis';
import { supabase } from '@/lib/supabase';
import { sanitizeDueAt } from '@/lib/intervention/commitmentSchedule';

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { entryId, phone, commitment, commitment_type, commitment_confidence, target_count } = body;
    if (!entryId || !commitment) {
      return NextResponse.json({ success: false, error: 'entryId, commitment이 필요합니다.' }, { status: 400 });
    }

    // reminder 여부와 기한은 클라이언트가 아니라 서버에 저장된 분석 결과에서 읽는다
    // (프론트 수정 없이 동작 + 클라이언트가 임의 시각을 넣을 수 없게).
    const { data: entry } = await supabase
      .from('voice_entries')
      .select('analysis')
      .eq('id', entryId)
      .eq('user_id', userId)
      .maybeSingle();
    const analysis: any = entry?.analysis ?? null;
    const kind = analysis?.commitment_kind === 'reminder' ? 'reminder' : 'commitment';
    const dueAt = sanitizeDueAt(analysis?.commitment_due_at, new Date());

    await confirmCommitment(
      entryId,
      userId,
      phone ?? null,
      commitment,
      commitment_type ?? null,
      commitment_confidence ?? null,
      target_count ?? null,
      kind,
      dueAt
    );
    return NextResponse.json({ success: true, kind, due_at: dueAt?.toISOString() ?? null });
  } catch (err: any) {
    console.error('confirm-commitment 실패:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
