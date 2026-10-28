
import type { Metadata, Viewport } from 'next';
import PwaRegister from '@/components/PwaRegister';

export const metadata: Metadata = {
  title: '참견이',
  // 아래 manifest/icons/appleWebApp은 홈 화면 추가(PWA) 지원을 위해서만 추가됨.
  // 기존 title 등 다른 값은 그대로 유지.
  manifest: '/manifest.json',
  icons: {
    // 2026-10-14: 수달 아이콘으로 바꾸면서 파일 이름에 -v2를 붙였다. 이름이 같으면 폰·브라우저가 예전(사막여우) 아이콘을
    // 캐시에서 계속 보여줘서, 이름을 바꿔 새로 받아가게 한다. 다음에 아이콘을 또 바꾸면 -v3로.
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/favicon-32-v2.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192-v2.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512-v2.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon-v2.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    title: '참견이',
    statusBarStyle: 'black-translucent',
  },
};

// iOS에서 노치/홈 인디케이터 영역까지 배경을 채워 전체화면에 가깝게 보이도록 viewport-fit: cover 추가.
// width/initialScale은 기존과 동일한 기본값(모바일 표준 뷰포트) 유지.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
themeColor: '#8BE0FA',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 어항 세계 폰트(Jua)를 화면 그리기 전에 미리 받아둔다 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&family=Nanum+Myeongjo:wght@700;800&display=swap" />
      </head>
      <body style={{ margin: 0 }}>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
