'use client'

import { usePathname } from 'next/navigation'

// 独立ルートの外枠。背景色をパスで出し分ける。
// オーダーシート（/order-sheet）＝薄いクリーム色(#FEF8EA)、相談案件登録など＝従来のグレー。
export default function StandaloneShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isOrderSheet = pathname?.startsWith('/order-sheet')
  return (
    <div className={`min-h-screen ${isOrderSheet ? 'bg-[#FEF8EA]' : 'bg-gray-50'}`}>
      {children}
    </div>
  )
}
