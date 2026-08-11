import type { Metadata, Viewport } from "next";
// Webフォントは読み込まない（OSのフォントで表示する）。
//   - next/font/google はビルドのたびに Google から取りに行くため、外に出られない環境でビルドが落ちた。
//   - 自前配信（@fontsource）に替えたら、日本語1ウェイトで約1MB×4ウェイト＝約4MBを毎回配ることになり重くなった。
// Mac は元々スタック先頭のヒラギノ角ゴが当たっていて Noto は使われていない。
// Windows は游ゴシックに落ちる。フォント名は globals.css のスタックに残してあるので、
// 端末に Noto Sans JP が入っていればそれが使われる。
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "相続案件管理",
  description: "相続手続き業務管理システム（オーシャン）",
  // PWAマニフェストはアプリ別に各ルートのlayoutで指定する（/register・/order-sheet）。
  // ここでグローバルに貼ると /order-sheet 等と競合し別アプリとして分離できないため貼らない。
  appleWebApp: { capable: true, title: "相続案件管理", statusBarStyle: "default" },
  // favicon（タブアイコン）は app/icon.svg のファイル方式。ここでは apple-touch-icon のみ指定。
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#185FA5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full bg-gray-50">{children}<PwaRegister /></body>
    </html>
  );
}
