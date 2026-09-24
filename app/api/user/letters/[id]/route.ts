
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { getLetterForUser, markLetterRead, parseLetterId } from '@/lib/letters';

// 사용자별 응답이라 항상 요청 시점에 실행한다(빌드 시 정적 수집 대상에서 제외).
export const dynamic = 'force-dynamic';

// GET  /api/user/letters/[id] → 편지 전문 (내 편지가 아니거나 없으면 404)
// POST /api/user/letters/[id] → 읽음 처리. 상세 화면에 실제로 들어갔을 때만 클라이언트가 호출한다.
//      여러 번 불러도 결과가 같다(처음 읽은 시각만 남음).
//
// 다른 사용자의 편지는 "존재하지 않음"과 똑같이 404로 응답한다 — 존재 여부조차 알려주지 않는다.

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    const letterId = parseLetterId(params.id);
    if (letterId === null) {
      return NextResponse.json({ success: false, error: '편지를 찾을 수 없습니다.' }, { status: 404 });
    }

    const letter = await getLetterForUser(userId, letterId);
    if (!letter) {
      return NextResponse.json({ success: false, error: '편지를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: letter });
  } catch (err: any) {
    console.error('[api/user/letters/[id]] GET 서버 에러:', err?.message);
    return NextResponse.json({ success: false, error: '편지를 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    const letterId = parseLetterId(params.id);
    if (letterId === null) {
      return NextResponse.json({ success: false, error: '편지를 찾을 수 없습니다.' }, { status: 404 });
    }

    const found = await markLetterRead(userId, letterId);
    if (!found) {
      return NextResponse.json({ success: false, error: '편지를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[api/user/letters/[id]] POST 서버 에러:', err?.message);
    return NextResponse.json({ success: false, error: '읽음 처리에 실패했습니다.' }, { status: 500 });
  }
}
