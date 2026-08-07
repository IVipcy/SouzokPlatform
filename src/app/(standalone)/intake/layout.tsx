import type { Metadata, Viewport } from 'next'

// 統合入力アプリ（面談シート→面談結果登録→オーダーシート）。面談登録・オーダーシートを統合。
export const metadata: Metadata = {
  title: '面談登録',
  manifest: '/intake.webmanifest',
  appleWebApp: { capable: true, title: '面談登録', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
}

// スマホ／タブレット最適化：面談中は手持ちのスマホでも、腰を据えるときはiPadでも使う。
// ズームは許可したまま（老眼で拡大したい）、入力欄タップ時の勝手な拡大は
// globals.css の .intake-app 内 16px 指定で止めている。
export const viewport: Viewport = {
  themeColor: '#2563EB',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 3,           // 老眼で拡大したい時のため（1にしない）
  userScalable: true,
  viewportFit: 'cover',      // ノッチ・ステータスバー領域まで使う
}

// スマホ幅（375pt）〜iPad横（1194pt）まで1枚で見る。widthは親レイアウト側で最大1080px。
export default function IntakeAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="intake-app" style={{ minHeight: '100dvh' }}>
      {children}
    </div>
  )
}
