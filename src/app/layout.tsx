import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

// 英数字: Inter（数字や英字を端正に）
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// 日本語: Noto Sans JP（業務系SaaS定番）
const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// 等幅: JetBrains Mono（数字・コード用、視認性高）
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

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
    <html
      lang="ja"
      className={`${inter.variable} ${notoSansJP.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-gray-50">{children}<PwaRegister /></body>
    </html>
  );
}
