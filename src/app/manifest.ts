import type { MetadataRoute } from 'next'

// PWA マニフェスト。受注担当が面談後にスマホから「相談案件登録」だけをすぐ開けるよう、
// 起動先を /meeting にしてホーム画面アプリ風（standalone）で使えるようにする。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '相続案件管理（相談案件登録）',
    short_name: '相談案件登録',
    description: '面談後の相談案件をその場で登録',
    start_url: '/meeting',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f9fafb',
    theme_color: '#185FA5',
    lang: 'ja',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
