import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type Card = {
  href: string | null
  title: string
  description: string
  icon: string
}

type CardSection = {
  title: string
  cards: Card[]
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
          icon: '🏢',
        },
        {
          href: '/dashboard/sales',
          title: '受注担当',
          description: '営業の月次成績。面談数・新規受注・受注率・平均単価・完了予定など。',
          icon: '📣',
        },
        {
          href: null,
          title: '管理担当',
          description: '管理担当の業務状況。タスク消化・案件進捗・滞留状況など（準備中）。',
          icon: '🧭',
        },
        {
          href: null,
          title: 'アシスタント',
          description: 'アシスタントのタスク捌き状況・パフォーマンス（準備中）。',
          icon: '🧩',
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
          icon: '📅',
        },
        ...teams.map(t => ({
          href: `/dashboard/team/${t.id}`,
          title: `${t.name}（本日）`,
          description: `${t.name}の本日の動き。チームメンバー別の累計と本日の数値を表示。`,
          icon: '👥',
        })),
      ],
    },
    {
      title: 'その他',
      cards: [
        {
          href: null,
          title: '請求・入金',
          description: '請求書発行・入金状況・未回収のサマリー（準備中）。',
          icon: '💴',
        },
        {
          href: null,
          title: '個人マイページ',
          description: '自分の月次成績と担当案件のサマリー（準備中）。',
          icon: '👤',
        },
      ],
    },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-xs text-gray-500 mt-1">見たい指標のカードを選んでください</p>
      </div>

      <div className="space-y-6">
        {sections.map(section => (
          <section key={section.title}>
            <h2 className="text-sm font-bold text-gray-700 mb-3 pl-1 border-l-4 border-blue-500">
              <span className="ml-2">{section.title}</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.cards.map(card => {
                const enabled = card.href !== null
                const baseCls = 'bg-white rounded-xl border p-4 transition'
                const interactiveCls = enabled
                  ? 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 cursor-pointer shadow-sm'
                  : 'border-gray-200 opacity-60 cursor-not-allowed'
                const inner = (
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{card.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-gray-900">{card.title}</h3>
                        {!enabled && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                            準備中
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">{card.description}</p>
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
