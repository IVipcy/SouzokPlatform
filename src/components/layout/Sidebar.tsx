'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  UserCircle,
  Briefcase,
  PenSquare,
  ClipboardList,
  ClipboardCheck,
  FileText,
  Receipt,
  BookOpen,
  Gauge,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  Bell,
  Package,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useConfirmPendingCount } from '@/lib/useConfirmPendingCount'
import { useStartWaitingCount } from '@/lib/useStartWaitingCount'
import { useAuth } from '@/components/providers/AuthProvider'
import { useAlertCenter } from '@/components/providers/AlertCenterProvider'
import MyAlertCenter from '@/components/features/my/MyAlertCenter'
import UserAvatar from '@/components/ui/UserAvatar'

const ROLE_LABEL: Record<string, string> = {
  sales: '受注担当',
  manager: '管理担当',
  assistant: '事務管理',
  lp: 'LP担当',
  accounting: '経理担当',
  system_manager: 'システム管理者',
}

// メニューの出し分けは この roles だけで決める（未指定＝全員に出す）。
// 以前は「アシスタントは許可リスト」「管理担当は禁止リスト」と判定が散らばっていて、
// 誰に何が出ているのか読み解けなかったため、項目ごとに出す相手を書く形に統一した。
// システム管理者は roles に関わらず全部見える。相続登記チームは管理担当と同じ扱い＋専用メニュー1本。
type Role = 'sales' | 'manager' | 'sub_manager' | 'assistant' | 'accounting' | 'lp'
const SALES_MGR: Role[] = ['sales', 'manager', 'sub_manager']
const SALES_MGR_LP: Role[] = ['sales', 'manager', 'sub_manager', 'lp']

type NavItem = {
  href: string
  label: string
  Icon: LucideIcon
  /** このメニューを出す担当区分。未指定＝全員 */
  roles?: Role[]
  /** 相続登記チームのメンバーにだけ出す（担当区分とは別軸のフラグ） */
  toukiOnly?: boolean
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'メイン',
    items: [
      // マイページ（アラート・案件報告の集約先）は受注/管理の画面構成なので、事務管理・経理には出さない
      { href: '/my',       label: 'マイページ',     Icon: UserCircle, roles: SALES_MGR },
      { href: '/',         label: 'ダッシュボード', Icon: LayoutDashboard },
      { href: '/cases',    label: '案件一覧',       Icon: Briefcase },
      // 面談登録は面談に出る人だけ（管理担当は面談に出ないので出さない）
      { href: '/intake',   label: '面談登録',       Icon: PenSquare, roles: ['sales', 'lp'] },
      // それぞれの持ち場の入口。担当区分ごとに1本だけ出す。
      // 事務管理タスク一覧は事務管理ダッシュボードの「タスク」タブに入れたので、単体では出さない。
      // 受注/管理担当のタスクはマイページの「タスク」タブに出るので、専用の一覧は持たない。
      { href: '/dashboard/office', label: '事務管理ダッシュボード', Icon: ClipboardList, roles: ['assistant'] },
      { href: '/dashboard/touki-team', label: '相続登記チーム',    Icon: Package,       toukiOnly: true },
    ],
  },
  {
    label: '書類・経理',
    items: [
      { href: '/confirm',   label: '確認簿',       Icon: ClipboardCheck },
      { href: '/documents', label: '到着物受信簿', Icon: FileText },
      { href: '/billing',   label: '請求・入金',   Icon: Receipt },
      // 稼働状況一覧＝割振りに使う。事務管理・経理は割り振らないので出さない
      { href: '/workload',  label: '稼働状況一覧', Icon: Gauge, roles: SALES_MGR_LP },
      { href: '/manual',    label: 'マニュアル',   Icon: BookOpen },
    ],
  },
]

const STORAGE_KEY = 'sidebar:collapsed'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const user = useAuth()
  const { totalCount } = useAlertCenter()
  const confirmPending = useConfirmPendingCount()
  // 事務管理ダッシュボードのメニューに出す「作業着手待ち」の件数（そのメニューが出る人だけ数える）
  const seesOfficeNav = !!user && (user.primaryRole === 'assistant' || user.primaryRole === 'system_manager' || user.roles.includes('system_manager'))
  const startWaiting = useStartWaitingCount(seesOfficeNav)
  // 初期値は false。マウント後 localStorage から復元 + body の data 属性を同期。
  const [collapsed, setCollapsed] = useState(false)

  // 初回マウントで localStorage を読む
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-ocean.svg" alt="オーシャン" className="h-9 w-auto flex-shrink-0" />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-gray-900 tracking-tight">相続案件管理</div>
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

      {/* ナビゲーション（マイページは 受注/管理/システム管理者 のみ表示） */}
      {(() => {
        const isSysManager = !!user && (user.primaryRole === 'system_manager' || user.roles.includes('system_manager'))
        const myRole = (user?.primaryRole ?? '') as Role
        // 相続登記チームのメンバーは 管理担当と同じメニュー＋「相続登記チーム」。
        // 以前は相続登記チームの画面1本だけにしていたが、案件・受信簿・請求も見るため揃えた。
        const isTouKi = !!user?.isTouKiTeam
        const myRoleForNav: Role = isTouKi && !SALES_MGR.includes(myRole) ? 'manager' : myRole
        const visibleSections = navSections.map(s => ({ ...s, items: s.items.filter(it => {
          if (it.toukiOnly) return isTouKi || isSysManager
          if (isSysManager) return true              // システム管理者は全部見える
          return !it.roles || it.roles.includes(myRoleForNav)
        }) })).filter(s => s.items.length > 0)
        return (
      <nav className={`flex-1 ${collapsed ? 'p-2' : 'p-3'} space-y-5 overflow-y-auto overflow-x-hidden`}>
        {visibleSections.map((section) => (
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
                const itemClass = `group relative flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
                const showAlertBadge = item.href === '/my' && totalCount > 0
                const showConfirmBadge = item.href === '/confirm' && confirmPending > 0
                // 事務管理ダッシュボード＝作業着手待ちの件数を赤字で（着手させるまで残る数）
                const showStartCount = item.href === '/dashboard/office' && startWaiting > 0
                return (
                  <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={itemClass}>
                    {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-brand-600 rounded-r-full" />}
                    <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${isActive ? 'text-brand-600' : 'text-gray-400 group-hover:text-gray-600'}`} strokeWidth={isActive ? 2.25 : 1.75} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {/* マイページのアラート件数（アラート＋未読通知）。クリックでマイページへ */}
                    {showAlertBadge && !collapsed && (
                      <span className="ml-auto inline-flex items-center gap-1 text-red-600">
                        <Bell className="w-3.5 h-3.5" strokeWidth={2.25} />
                        <span className="min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">{totalCount > 99 ? '99+' : totalCount}</span>
                      </span>
                    )}
                    {showAlertBadge && collapsed && (
                      <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">{totalCount > 99 ? '99+' : totalCount}</span>
                    )}
                    {/* 事務管理ダッシュボードの作業着手待ち件数。赤字の数字＋「件」 */}
                    {showStartCount && !collapsed && (
                      <span className="ml-auto text-[12px] font-bold text-red-600 tabular-nums" title={`作業着手待ち ${startWaiting}件`}>{startWaiting > 99 ? '99+' : startWaiting}件</span>
                    )}
                    {showStartCount && collapsed && (
                      <span className="absolute top-0.5 right-0.5 text-[10px] font-bold text-red-600 leading-none" title={`作業着手待ち ${startWaiting}件`}>{startWaiting > 99 ? '99+' : startWaiting}</span>
                    )}
                    {/* 確認簿の未処理件数（新規の確認依頼）。赤バッジで件数表示。 */}
                    {showConfirmBadge && !collapsed && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold leading-none">{confirmPending > 99 ? '99+' : confirmPending}</span>
                    )}
                    {showConfirmBadge && collapsed && (
                      <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">{confirmPending > 99 ? '99+' : confirmPending}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
        )
      })()}

      {/* プロフィール + ログアウト。事務管理/経理はマイページを持たないため、ここにベルを置いてアラートセンターを開けるようにする。 */}
      <div className={`${collapsed ? 'p-2' : 'p-3'} border-t border-gray-100 space-y-1`}>
        {!!user && ['assistant', 'accounting'].includes(user.primaryRole ?? '') && !user.roles.includes('system_manager') && (
          <MyAlertCenter variant={collapsed ? 'sidebarCollapsed' : 'sidebar'} />
        )}
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
