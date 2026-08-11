import type { Metadata, Viewport } from "next";
// 日本語: Noto Sans JP。next/font/google は「ビルドするたびに Google からフォントを取りに行く」ため、
// 外に出られないビルド環境だと落ちる（Renderのビルドがこれで失敗した）。
// @fontsource は npm パッケージにフォント本体が入っていて、ビルド時に外部へ取りに行かない。
// ※ Inter / JetBrains Mono も読んでいたが、globals.css のフォントスタックで使っていなかったので外した。
// 使う字だけ（日本語＋ラテン）×4ウェイト。全サブセットを読むとファイル数が跳ね上がるので絞る。
import "@fontsource/noto-sans-jp/japanese-400.css";
import "@fontsource/noto-sans-jp/japanese-500.css";
import "@fontsource/noto-sans-jp/japanese-600.css";
import "@fontsource/noto-sans-jp/japanese-700.css";
import "@fontsource/noto-sans-jp/latin-400.css";
import "@fontsource/noto-sans-jp/latin-500.css";
import "@fontsource/noto-sans-jp/latin-600.css";
import "@fontsource/noto-sans-jp/latin-700.css";
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
