'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, LayoutGrid } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// 独立ルート（面談登録 / オーダーシート入力）共通の簡易トップバー。
// ロゴ＋タイトル＋ログアウトのみ。パスでタイトル・再ログイン後の戻り先を切り替える。
export default function StandaloneTopBar() {
  const router = useRouter()
  const pathname = usePathname()
  const isOrderSheet = pathname?.startsWith('/order-sheet') ?? false
  const isMeetingSheet = pathname?.startsWith('/meeting-sheet') ?? false
  const isIntake = pathname?.startsWith('/intake') ?? false
  // /intake は統合入力アプリだが、アプリ名としては「面談登録」で通す（メニュー・マイページのボタンと統一）
  const title = isMeetingSheet ? '面談シート（仮）' : isOrderSheet ? 'オーダーシート入力' : '面談登録'
  const next = isMeetingSheet ? '/meeting-sheet' : isOrderSheet ? '/order-sheet' : isIntake ? '/intake' : '/register'

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
      {/* PC幅のみ：管理画面(TOP)へ戻る導線。タブレット/スマホは専用アプリとして使うため非表示。 */}
      <Link href="/" className="ml-auto hidden lg:inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 border border-brand-200 bg-brand-50 px-2.5 py-1 rounded-md hover:bg-brand-100">
        <LayoutGrid className="w-3.5 h-3.5" strokeWidth={2} />管理画面へ
      </Link>
      <button type="button" onClick={logout} className="lg:ml-2 ml-auto inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 px-2 py-1 rounded-md hover:bg-gray-50">
        <LogOut className="w-4 h-4" strokeWidth={1.75} />ログアウト
      </button>
    </header>
  )
}
