import { NextResponse } from 'next/server';

// POST 대신 GET으로 변경 (혹은 export async function GET...)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const msg = searchParams.get('msg') || '안부 전화입니다.';

  // 트릴리오가 읽어갈 TwiML XML 응답 생성
  const twiml = `
    <Response>
      <Say language="ko-KR">${msg}</Say>
    </Response>
  `;

  return new NextResponse(twiml, {
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}
