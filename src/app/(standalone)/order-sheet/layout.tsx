import type { Metadata, Viewport } from 'next'

// オーダーシート入力アプリ専用のメタデータ。相談案件登録アプリと別アイコン・別マニフェストにして、
// ホーム画面に追加したとき「表シート（ティール）」アイコン＝オーダーシートとして識別できるようにする。
export const metadata: Metadata = {
  title: 'オーダーシート入力',
  manifest: '/order-sheet.webmanifest',
  appleWebApp: { capable: true, title: 'オーダーシート入力', statusBarStyle: 'default' },
  // favicon（タブアイコン）は同ディレクトリの icon.png（表シート・ティール）で出し分ける。
  icons: {
    apple: '/icons/os-apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0D9488',
}

export default function OrderSheetAppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
