import type { Metadata, Viewport } from 'next'

// 相談案件登録アプリ（/register）専用のメタデータ。オーダーシート(/order-sheet)とは別マニフェストにして、
// それぞれ独立したPWA（別アイコン・別スコープ）としてホーム画面に追加できるようにする。
export const metadata: Metadata = {
  title: '相談案件登録',
  manifest: '/register.webmanifest',
  appleWebApp: { capable: true, title: '相談案件登録', statusBarStyle: 'default' },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#185FA5',
}

export default function RegisterAppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
