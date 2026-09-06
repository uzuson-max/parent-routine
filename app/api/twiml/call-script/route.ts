import { NextResponse } from 'next/server';

function buildTwiml(request: Request) {
  const { searchParams } = new URL(request.url);
  const message = searchParams.get('msg') || '오늘 루틴을 확인할 시간이에요.';
  const fullMessage = `${message} 아 그리고 니 번호 저장해놨어. 다음에 또 참견할 수도 있으니까 :)`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ko-KR">${fullMessage}</Say>
</Response>`;

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

export async function GET(request: Request) {
  return buildTwiml(request);
}

export async function POST(request: Request) {
  return buildTwiml(request);
}
