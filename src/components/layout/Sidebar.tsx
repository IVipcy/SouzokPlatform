'use client'

import { useEffect, useState } from 'react'
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
  UserCircle,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/providers/AuthProvider'
import UserAvatar from '@/components/ui/UserAvatar'
import NotificationBell from '@/components/features/notifications/NotificationBell'

const ROLE_LABEL: Record<string, string> = {
  sales: '受注担当',
  manager: '管理担当',
  assistant: '事務管理',
  lp: 'LP担当',
  accounting: '経理担当',
}

type NavItem = {
  href: string
  label: string
  Icon: LucideIcon
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'メイン',
    items: [
      { href: '/my',       label: 'マイページ',     Icon: UserCircle },
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

const STORAGE_KEY = 'sidebar:collapsed'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const user = useAuth()
  // 初期値は false。マウント後 localStorage から復元 + body の data 属性を同期。
  const [collapsed, setCollapsed] = useState(false)

  // 初回マウントで localStorage を読む
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === '1') setCollapsed(true)
    } catch {/* noop */}
  }, [])

  // 状態変化を localStorage + body data 属性に反映（main の margin 調整用）
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {/* noop */}
    document.body.dataset.sidebarCollapsed = collapsed ? '1' : '0'
  }, [collapsed])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const widthCls = collapsed ? 'w-16' : 'w-60'

  return (
    <aside
      className={`${widthCls} bg-white border-r border-gray-200 flex flex-col h-screen fixed left-0 top-0 transition-[width] duration-200 ease-out z-10`}
      data-collapsed={collapsed ? '1' : '0'}
    >
      {/* ロゴ + 折りたたみトグル */}
      <div className={`border-b border-gray-100 ${collapsed ? 'p-3' : 'p-5'} relative`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm bg-gradient-to-br from-brand-600 to-brand-800 ring-1 ring-inset ring-white/10 flex-shrink-0">
            <Building2 className="w-5 h-5 text-white" strokeWidth={2.25} />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-gray-900 tracking-tight">相続PF</div>
              <div className="text-[11px] text-gray-400 tracking-wide">業務管理</div>
            </div>
          )}
        </div>
        {/* トグルボタン（右上に小さく） */}
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-7 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-brand-600 hover:border-brand-300 transition-colors z-20"
          title={collapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
          aria-label={collapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
        >
          {collapsed
            ? <ChevronsRight className="w-3.5 h-3.5" strokeWidth={2.25} />
            : <ChevronsLeft className="w-3.5 h-3.5" strokeWidth={2.25} />}
        </button>
      </div>

      {/* ナビゲーション */}
      <nav className={`flex-1 ${collapsed ? 'p-2' : 'p-3'} space-y-5 overflow-y-auto overflow-x-hidden`}>
        {navSections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 tracking-[0.18em] uppercase">
                {section.label}
              </div>
            )}
            {collapsed && <div className="h-px bg-gray-100 my-2" />}
            <div className="space-y-0.5 relative">
              {section.items.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                const Icon = item.Icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`group relative flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-brand-600 rounded-r-full" />
                    )}
                    <Icon
                      className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                        isActive ? 'text-brand-600' : 'text-gray-400 group-hover:text-gray-600'
                      }`}
                      strokeWidth={isActive ? 2.25 : 1.75}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* プロフィール + 通知 + ログアウト */}
      <div className={`${collapsed ? 'p-2' : 'p-3'} border-t border-gray-100 space-y-1`}>
        {user?.memberId && <NotificationBell collapsed={collapsed} />}
        {user?.memberId && (
          <Link
            href="/profile"
            title={collapsed ? (user.memberName ?? 'プロフィール') : undefined}
            className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5'} py-2 rounded-lg transition w-full ${
              pathname.startsWith('/profile')
                ? 'bg-brand-50'
                : 'hover:bg-gray-50'
            }`}
          >
            <UserAvatar
              name={user.memberName ?? '?'}
              role={user.primaryRole as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | undefined}
              url={user.avatarUrl}
              size="lg"
            />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${pathname.startsWith('/profile') ? 'text-brand-700' : 'text-gray-800'}`}>
                  {user.memberName ?? 'メンバー未設定'}
                </div>
                {user.primaryRole && (
                  <div className="text-[11px] text-gray-400 truncate">
                    {ROLE_LABEL[user.primaryRole] ?? user.primaryRole}
                  </div>
                )}
              </div>
            )}
          </Link>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? 'ログアウト' : undefined}
          className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition w-full`}
        >
          <LogOut className="w-5 h-5" strokeWidth={1.75} />
          {!collapsed && <span>ログアウト</span>}
        </button>
      </div>
    </aside>
  )
}
