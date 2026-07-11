'use client'

import { useRouter, usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// 独立ルート（相談案件登録 / オーダーシート入力）共通の簡易トップバー。
// ロゴ＋タイトル＋ログアウトのみ。パスでタイトル・再ログイン後の戻り先を切り替える。
export default function StandaloneTopBar() {
  const router = useRouter()
  const pathname = usePathname()
  const isOrderSheet = pathname?.startsWith('/order-sheet') ?? false
  const title = isOrderSheet ? 'オーダーシート入力' : '相談案件登録'
  const next = isOrderSheet ? '/order-sheet' : '/register'

  const logout = async () => {
    await createClient().auth.signOut()
    // 再ログイン後もこの独立アプリ画面に戻す
    router.push(`/login?next=${next}`)
    router.refresh()
  }
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2.5 px-4 py-2.5 bg-white border-b border-gray-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-ocean.svg" alt="オーシャン" className="h-7 w-auto flex-shrink-0" />
      <span className="text-[15px] font-bold text-gray-900">{title}</span>
      <button type="button" onClick={logout} className="ml-auto inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 px-2 py-1 rounded-md hover:bg-gray-50">
        <LogOut className="w-4 h-4" strokeWidth={1.75} />ログアウト
      </button>
    </header>
  )
}
