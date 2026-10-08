
import { NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { markInsightsSurfaced } from '@/lib/insightEngine';
import { readFile } from 'fs/promises';
import path from 'path';

// Node 런타임에서 돈다(supabase/insightEngine 때문). 아래 에셋 로딩도 Node 기준.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================================
// 발견(memory_insights) 한 건을 정사각 이미지 카드로 그려서 돌려주는 라우트 — "인사이트 공유
// 카드" 기능의 전부다. 새 테이블도, 새 LLM 호출도 없다: insightEngine이 이미 참견이 말투로
// 다듬어 저장해둔 content를 그대로 그림으로 옮기는 것뿐. Next.js에 내장된 next/og(satori)로
// 서버에서 PNG를 직접 렌더링하므로 html2canvas 같은 별도 라이브러리도 필요 없다.
//
// 폰트/마스코트 이미지는 디스크에서 직접 읽는다(fs). 예전엔 fetch(new URL(..., import.meta.url))로
// 읽었는데, 그 방식은 Edge 런타임 전용이라 이 라우트(Node 런타임)에서는 URL이
// "/_next/static/media/..." 같은 상대 경로로 바뀌어 "Failed to parse URL" 에러가 났다 —
// 그래서 카드로 공유 버튼이 항상 실패했다. 배포 번들에 두 파일이 같이 들어가도록
// next.config.js의 outputFileTracingIncludes에도 등록해 뒀다.
// 폰트는 Noto Sans CJK KR(SIL OFL, 오픈소스) Bold에서 한글/영문/기본 문장부호만 추출한 서브셋(약 2MB).
// ============================================================================

const FONT_PATH = path.join(process.cwd(), 'app', 'api', 'insight-card', 'NotoSansKR-Bold.otf');
const MASCOT_PATH = path.join(process.cwd(), 'public', 'mascot', '04_remember.png');

let assetsPromise: Promise<{ fontData: ArrayBuffer; mascotDataUri: string }> | null = null;
function loadAssets() {
  if (!assetsPromise) {
    assetsPromise = Promise.all([readFile(FONT_PATH), readFile(MASCOT_PATH)]).then(([font, png]) => ({
      fontData: font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer,
      mascotDataUri: `data:image/png;base64,${png.toString('base64')}`,
    }));
    // 실패하면 다음 요청에서 다시 읽게 캐시를 비운다.
    assetsPromise.catch(() => {
      assetsPromise = null;
    });
  }
  return assetsPromise;
}

// 내용이 길수록 폰트 크기를 줄여서 1080x1080 카드 안에 자연스럽게 들어가게 한다.
function fontSizeFor(content: string): number {
  const len = content.length;
  if (len <= 22) return 58;
  if (len <= 40) return 48;
  if (len <= 65) return 40;
  return 32;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as any));
    const insightId = Number(body?.insightId);
    if (!insightId) {
      return NextResponse.json({ success: false, error: 'insightId가 필요합니다.' }, { status: 400 });
    }

    // 소유권 확인 — 본인 것만 카드로 만들 수 있다 (service role 클라이언트라 RLS를 우회하므로
    // user_id 조건을 여기서 직접 검사해야 함, 기존 라우트들과 동일한 패턴).
    const { data: insight, error } = await supabase
      .from('memory_insights')
      .select('id, content, created_at')
      .eq('id', insightId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      console.error('[insight-card] 조회 실패:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    if (!insight) {
      return NextResponse.json({ success: false, error: '해당 발견을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { fontData, mascotDataUri } = await loadAssets();
    const content = insight.content as string;

    const image = new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#FFF6E5',
            padding: '64px',
            fontFamily: 'NotoSansKR',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <img src={mascotDataUri} width={88} height={88} style={{ borderRadius: 999 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 24, color: '#8977B8', letterSpacing: 2 }}>참견이</span>
              <span style={{ fontSize: 16, color: 'rgba(30,26,38,0.55)' }}>가 발견한 거</span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px 0',
            }}
          >
            <div
              style={{
                display: 'flex',
                background: '#fff',
                border: '6px solid #111',
                borderRadius: 32,
                padding: '56px 48px',
                boxShadow: '10px 10px 0px #111',
                maxWidth: '880px',
              }}
            >
              <span
                style={{
                  fontSize: fontSizeFor(content),
                  color: '#1E1A26',
                  lineHeight: 1.4,
                  textAlign: 'center',
                }}
              >
                “{content}”
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 20, color: 'rgba(30,26,38,0.5)' }}>
              {formatDate(insight.created_at as string)}
            </span>
            <span style={{ fontSize: 16, color: 'rgba(30,26,38,0.35)' }}>참견이 · 아무 말이나 해봐</span>
          </div>
        </div>
      ),
      {
        width: 1080,
        height: 1080,
        fonts: [{ name: 'NotoSansKR', data: fontData, weight: 700, style: 'normal' }],
      }
    );

    // SMS 콜백(insightCallbackEngine)은 발송 성공 후에만 surfaced 처리하지만, 카드는 이미지가
    // 만들어져 응답으로 나가는 순간이 곧 "사용자에게 보여준" 순간이라 여기서 바로 처리한다.
    // await로 기다린다 — 서버리스 함수는 응답을 보낸 직후 바로 종료될 수 있어서, 기다리지 않으면
    // 이 갱신이 씹힐 수 있다. 실패해도 카드 생성 자체는 막지 않는다(에러만 로그로 남기고 진행).
    await markInsightsSurfaced([insightId]).catch((e: any) =>
      console.error('[insight-card] surfaced 처리 실패:', e?.message)
    );

    return image;
  } catch (err: any) {
    console.error('[insight-card] 서버 에러:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}





