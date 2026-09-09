import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '참견이',
    short_name: '참견이',
    description: '이상하게 기억력이 좋은 친구',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFF6E5',
    theme_color: '#4D3F73',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
