// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // 카드로 공유(app/api/insight-card)가 fs로 직접 읽는 파일 — 배포 함수 번들에 꼭 같이 넣는다.
    outputFileTracingIncludes: {
      '/api/insight-card': ['./app/api/insight-card/NotoSansKR-Bold.otf', './public/mascot/04_remember.png'],
    },
  },
};

module.exports = nextConfig;
