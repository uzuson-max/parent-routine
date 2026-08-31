import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { confirmCommitment } from '@/lib/analysis';

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
    await confirmCommitment(
      entryId,
      userId,
      phone ?? null,
      commitment,
      commitment_type ?? null,
      commitment_confidence ?? null,
      target_count ?? null
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('confirm-commitment 실패:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
