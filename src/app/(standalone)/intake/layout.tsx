import type { Metadata, Viewport } from 'next'

// 統合入力アプリ（面談シート→面談結果登録→オーダーシート）。面談登録・オーダーシートを統合。
export const metadata: Metadata = {
  title: '面談登録',
  appleWebApp: { capable: true, title: '面談登録', statusBarStyle: 'default' },
}

// タブレット最適化：iPadで面談中に使う想定。ズーム許可（可視性のため）＋横向き時のノッチ対応。
export const viewport: Viewport = {
  themeColor: '#2563EB',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 3,           // 老眼で拡大したい時のため（1にしない）
  userScalable: true,
  viewportFit: 'cover',      // ノッチ・ステータスバー領域まで使う
}

// タブレット用に画面全体を包む。widthはiPad(1024/1194)まで広く取る。
export default function IntakeAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="intake-app" style={{ minHeight: '100dvh' }}>
      {children}
    </div>
  )
}
