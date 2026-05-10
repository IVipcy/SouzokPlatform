'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Briefcase,
  PenSquare,
  ListChecks,
  FileText,
  Receipt,
  BarChart3,
  LogOut,
  Building2,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type NavItem = {
  href: string
  label: string
  Icon: LucideIcon
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'メイン',
    items: [
      { href: '/',         label: 'ダッシュボード', Icon: LayoutDashboard },
      { href: '/cases',    label: '案件管理',       Icon: Briefcase },
      { href: '/meeting',  label: '案件編集',       Icon: PenSquare },
      { href: '/tasks',    label: 'タスク管理',     Icon: ListChecks },
    ],
  },
  {
    label: '書類・経理',
    items: [
      { href: '/documents', label: 'ドキュメント', Icon: FileText },
      { href: '/billing',   label: '請求・入金',   Icon: Receipt },
      { href: '/reports',   label: 'レポート',     Icon: BarChart3 },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col h-screen fixed left-0 top-0">
      {/* ロゴ */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <div className="font-bold text-sm text-gray-900">相続PF</div>
            <div className="text-xs text-gray-400">業務管理</div>
          </div>
        </div>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className="px-3 py-1.5 text-[11px] font-bold text-gray-400 tracking-widest uppercase">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                const Icon = item.Icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={isActive ? 2.25 : 1.75} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ログアウト */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition w-full"
        >
          <LogOut className="w-5 h-5" strokeWidth={1.75} />
          ログアウト
        </button>
      </div>
    </aside>
  )
}
