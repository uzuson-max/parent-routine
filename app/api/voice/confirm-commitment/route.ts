
import { NextResponse } from 'next/server';
import { confirmCommitment } from '@/lib/analysis';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { entryId, phone, commitment, commitment_type, commitment_confidence } = body;

    if (!entryId || !phone || !commitment) {
      return NextResponse.json({ success: false, error: 'entryId, phone, commitment이 필요합니다.' }, { status: 400 });
    }

    await confirmCommitment(entryId, phone, commitment, commitment_type ?? null, commitment_confidence ?? null);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('confirm-commitment 실패:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
