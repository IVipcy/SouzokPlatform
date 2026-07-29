import type { Metadata, Viewport } from 'next'

// 統合入力アプリ（面談シート→面談結果登録→オーダーシート）。相談案件登録・オーダーシートを統合。
export const metadata: Metadata = {
  title: '面談・受注入力',
  appleWebApp: { capable: true, title: '面談・受注入力', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#2563EB',
}

export default function IntakeAppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
