import Link from 'next/link'
import {
  Building2,
  Megaphone,
  Compass,
  PuzzleIcon,
  CalendarDays,
  Users,
  AlertTriangle,
  Banknote,
  User,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

type Card = {
  href: string | null
  title: string
  description: string
  Icon: LucideIcon
  tone: 'blue' | 'green' | 'amber' | 'gray' | 'rose' | 'violet'
}

type CardSection = {
  title: string
  cards: Card[]
}

const TONE_STYLES: Record<Card['tone'], { iconBg: string; iconColor: string }> = {
  blue:   { iconBg: 'bg-blue-50',    iconColor: 'text-blue-600' },
  green:  { iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
  amber:  { iconBg: 'bg-amber-50',   iconColor: 'text-amber-600' },
  gray:   { iconBg: 'bg-gray-100',   iconColor: 'text-gray-500' },
  rose:   { iconBg: 'bg-rose-50',    iconColor: 'text-rose-600' },
  violet: { iconBg: 'bg-violet-50',  iconColor: 'text-violet-600' },
}

export default async function DashboardTopPage() {
  const supabase = await createClient()
  const { data: teamsRaw } = await supabase
    .from('teams')
    .select('id,name,sort_order')
    .eq('is_active', true)
    .order('sort_order')

  const teams = (teamsRaw ?? []) as Array<{ id: string; name: string; sort_order: number }>

  const sections: CardSection[] = [
    {
      title: '月次ダッシュボード',
      cards: [
        {
          href: '/dashboard/dept',
          title: '部全体',
          description: '相続事業部全体の月次サマリー。新規受注・管理案件・完了・サイクル・業務完了金額。',
          Icon: Building2,
          tone: 'blue',
        },
        {
          href: '/dashboard/sales',
          title: '受注担当',
          description: '営業の月次成績。面談数・新規受注・受注率・平均単価・完了予定など。',
          Icon: Megaphone,
          tone: 'blue',
        },
        {
          href: null,
          title: '管理担当',
          description: '管理担当の業務状況。タスク消化・案件進捗・滞留状況など（準備中）。',
          Icon: Compass,
          tone: 'gray',
        },
        {
          href: null,
          title: 'アシスタント',
          description: 'アシスタントのタスク捌き状況・パフォーマンス（準備中）。',
          Icon: PuzzleIcon,
          tone: 'gray',
        },
      ],
    },
    {
      title: '日次ダッシュボード',
      cards: [
        {
          href: '/dashboard/today',
          title: '部全体（本日）',
          description: '相続事業部全体の本日の動き。新規受注・管理開始・完了件数・完了割合・完了金額。',
          Icon: CalendarDays,
          tone: 'green',
        },
        ...teams.map(t => ({
          href: `/dashboard/team/${t.id}`,
          title: `${t.name}（本日）`,
          description: `${t.name}の本日の動き。チームメンバー別の累計と本日の数値を表示。`,
          Icon: Users,
          tone: 'green' as const,
        })),
      ],
    },
    {
      title: '進捗管理（リスク監視）',
      cards: teams.map(t => ({
        href: `/dashboard/team/${t.id}/progress`,
        title: `${t.name}（進捗）`,
        description: `${t.name}の案件をフラグ別（青/黄/赤）で監視。リスクのある案件を早期発見。`,
        Icon: AlertTriangle,
        tone: 'amber' as const,
      })),
    },
    {
      title: 'その他',
      cards: [
        {
          href: null,
          title: '請求・入金',
          description: '請求書発行・入金状況・未回収のサマリー（準備中）。',
          Icon: Banknote,
          tone: 'gray',
        },
        {
          href: null,
          title: '個人マイページ',
          description: '自分の月次成績と担当案件のサマリー（準備中）。',
          Icon: User,
          tone: 'gray',
        },
      ],
    },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-sm text-gray-500 mt-1">見たい指標のカードを選んでください</p>
      </div>

      <div className="space-y-7">
        {sections.map(section => (
          <section key={section.title}>
            <h2 className="text-base font-bold text-gray-800 mb-3 pl-1 border-l-4 border-blue-500">
              <span className="ml-2">{section.title}</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.cards.map(card => {
                const enabled = card.href !== null
                const tone = TONE_STYLES[card.tone]
                const baseCls = 'bg-white rounded-xl border p-5 transition'
                const interactiveCls = enabled
                  ? 'border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer shadow-sm'
                  : 'border-gray-200 opacity-60 cursor-not-allowed'
                const Icon = card.Icon
                const inner = (
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${tone.iconBg}`}>
                      <Icon className={`w-5 h-5 ${tone.iconColor}`} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-gray-900">{card.title}</h3>
                        {!enabled && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                            準備中
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{card.description}</p>
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
