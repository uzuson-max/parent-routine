
import type { Metadata, Viewport } from 'next';
import PwaRegister from '@/components/PwaRegister';

export const metadata: Metadata = {
  title: '참견이',
  // 아래 manifest/icons/appleWebApp은 홈 화면 추가(PWA) 지원을 위해서만 추가됨.
  // 기존 title 등 다른 값은 그대로 유지.
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
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
  themeColor: '#FFF6E5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
