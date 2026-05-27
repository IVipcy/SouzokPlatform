import Link from 'next/link'
import {
  UserCircle,
  Building2,
  Megaphone,
  Compass,
  Users,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

type Card = {
  href: string | null
  title: string
  description: string
  Icon: LucideIcon
  tone: 'blue' | 'green' | 'amber' | 'gray' | 'rose' | 'violet' | 'purple'
  badge?: string
}

type CardSection = {
  title: string
  description?: string
  cards: Card[]
}

const TONE_STYLES: Record<Card['tone'], { iconBg: string; iconColor: string }> = {
  blue:   { iconBg: 'bg-brand-50',   iconColor: 'text-brand-600' },
  green:  { iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
  amber:  { iconBg: 'bg-amber-50',   iconColor: 'text-amber-600' },
  gray:   { iconBg: 'bg-gray-100',   iconColor: 'text-gray-500' },
  rose:   { iconBg: 'bg-rose-50',    iconColor: 'text-rose-600' },
  violet: { iconBg: 'bg-violet-50',  iconColor: 'text-violet-600' },
  purple: { iconBg: 'bg-purple-50',  iconColor: 'text-purple-600' },
}

export default async function DashboardTopPage() {
  const supabase = await createClient()
  const { data: teamsRaw } = await supabase
    .from('teams')
    .select('id,name,sort_order')
    .eq('is_active', true)
    .order('sort_order')

  const teams = (teamsRaw ?? []) as Array<{ id: string; name: string; sort_order: number }>

  // 4カテゴリ構成（添付2枚目のスペックに合わせる）
  const sections: CardSection[] = [
    {
      title: 'マイページ',
      description: '自分にしか表示されない個人ページ。アカウント情報に基づいて作成。自分のタスクや数値の把握、月間目標設定など。',
      cards: [
        {
          href: '/my',
          title: 'マイページ',
          description: 'あなた専用。月間目標 / 担当案件 / 当月面談 / タスク。受注担当・管理担当で表示が切り替わる。',
          Icon: UserCircle,
          tone: 'blue',
        },
      ],
    },
    {
      title: '相続事業部全体',
      description: '相続事業部のメンバー全員がアクセスできる、部全体集計ダッシュボード。',
      cards: [
        {
          href: '/dashboard/dept',
          title: '部全体',
          description: '相続事業部全体のサマリー。新規受注・管理案件・完了件数・完了金額。期間切替対応。',
          Icon: Building2,
          tone: 'blue',
        },
      ],
    },
    {
      title: '受注担当',
      description: '受注担当の月次・本日成績。面談数・新規受注・受注率・平均単価など。チーム別表示でメンバー個別の数値も。',
      cards: [
        {
          href: '/dashboard/sales',
          title: '受注担当 全体',
          description: '各チームの全体集計値を横断的に確認。チームごとの本日成績・累計が並ぶ。',
          Icon: Megaphone,
          tone: 'green',
        },
        ...teams.map(t => ({
          href: `/dashboard/team/${t.id}`,
          title: `${t.name}（受注）`,
          description: `${t.name}の受注担当ダッシュボード。メンバー別の本日 / 当月 / 年度累計 / 月別。`,
          Icon: Users,
          tone: 'green' as const,
        })),
      ],
    },
    {
      title: '管理担当',
      description: '管理担当の月次・本日成績。請求完了件数と担当案件数が主KPI。',
      cards: [
        {
          href: '/dashboard/manager',
          title: '管理担当 全体',
          description: '各チームの全体集計値。請求完了件数・対応中案件・完了案件など。',
          Icon: Building2,
          tone: 'purple',
        },
        ...teams.map(t => ({
          href: `/dashboard/manager/${t.id}`,
          title: `${t.name}（管理）`,
          description: `${t.name}の管理担当ダッシュボード。メンバー別の請求完了件数や案件数。`,
          Icon: Compass,
          tone: 'purple' as const,
        })),
      ],
    },
  ]

  const today = new Date()
  const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${['日','月','火','水','木','金','土'][today.getDay()]}）`

  return (
    <div className="pb-8">
      {/* ─── ヘッダー ─── */}
      <div className="mb-8 relative overflow-hidden rounded-2xl border border-gray-200/70 bg-gradient-to-br from-brand-50/60 via-white to-white px-6 py-7 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-gradient-to-br from-brand-100/50 to-transparent blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-20 w-72 h-72 rounded-full bg-gradient-to-tr from-accent-50/60 to-transparent blur-3xl pointer-events-none" />
        <div className="relative">
          <p className="text-xs font-medium text-brand-600 tracking-wider uppercase">Dashboard</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1.5 tracking-tight flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-brand-600" strokeWidth={2} />
            ダッシュボード
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">{dateLabel}・見たいダッシュボードを選んでください</p>
        </div>
      </div>

      <div className="space-y-8">
        {sections.map(section => (
          <section key={section.title}>
            <h2 className="text-[15px] font-bold text-gray-800 mb-2 flex items-center gap-2.5">
              <span className="inline-block w-1 h-5 bg-brand-600 rounded-full" />
              <span>{section.title}</span>
              <span className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent ml-2" />
            </h2>
            {section.description && (
              <p className="text-[12px] text-gray-500 mb-4 ml-3.5 leading-relaxed max-w-3xl">
                {section.description}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.cards.map(card => {
                const enabled = card.href !== null
                const tone = TONE_STYLES[card.tone]
                const baseCls = 'bg-white rounded-xl border p-5 transition-all duration-200'
                const interactiveCls = enabled
                  ? 'border-gray-200 hover:border-brand-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'border-gray-200 opacity-55 cursor-not-allowed'
                const Icon = card.Icon
                const inner = (
                  <div className="flex items-start gap-3.5">
                    <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${tone.iconBg} ring-1 ring-inset ring-white/50`}>
                      <Icon className={`w-5 h-5 ${tone.iconColor}`} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] font-bold text-gray-900 tracking-tight">{card.title}</h3>
                        {!enabled && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            準備中
                          </span>
                        )}
                        {card.badge && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                            {card.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{card.description}</p>
                    </div>
                  </div>
                )
                return enabled ? (
                  <Link key={card.title} href={card.href!} className={`${baseCls} ${interactiveCls}`}>
                    {inner}
                  </Link>
                ) : (
                  <div key={card.title} className={`${baseCls} ${interactiveCls}`}>
                    {inner}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
