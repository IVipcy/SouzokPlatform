import Link from 'next/link'

type Card = {
  href: string | null
  title: string
  description: string
  icon: string
  accent: string
}

const CARDS: Card[] = [
  {
    href: '/dashboard/dept',
    title: '部全体',
    description: '相続事業部全体の月次サマリー。新規受注・管理案件・完了・サイクル・業務完了金額。',
    icon: '🏢',
    accent: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50/40',
  },
  {
    href: '/dashboard/sales',
    title: '受注担当',
    description: '営業の月次成績。面談数・新規受注・受注率・平均単価・完了予定など。',
    icon: '📣',
    accent: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50/40',
  },
  {
    href: null,
    title: '管理担当',
    description: '管理担当の業務状況。タスク消化・案件進捗・滞留状況など（準備中）。',
    icon: '🧭',
    accent: 'border-gray-200',
  },
  {
    href: null,
    title: 'アシスタント',
    description: 'アシスタントのタスク捌き状況・パフォーマンス（準備中）。',
    icon: '🧩',
    accent: 'border-gray-200',
  },
  {
    href: null,
    title: '請求・入金',
    description: '請求書発行・入金状況・未回収のサマリー（準備中）。',
    icon: '💴',
    accent: 'border-gray-200',
  },
  {
    href: null,
    title: '個人マイページ',
    description: '自分の月次成績と担当案件のサマリー（準備中）。',
    icon: '👤',
    accent: 'border-gray-200',
  },
]

export default function DashboardTopPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-xs text-gray-500 mt-1">見たい指標のカードを選んでください</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map(card => {
          const enabled = card.href !== null
          const className = `bg-white rounded-xl border p-5 transition ${card.accent} ${
            enabled ? 'cursor-pointer shadow-sm' : 'opacity-60 cursor-not-allowed'
          }`
          const inner = (
            <>
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{card.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-gray-900">{card.title}</h2>
                    {!enabled && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                        準備中
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">{card.description}</p>
                </div>
              </div>
            </>
          )
          return enabled ? (
            <Link key={card.title} href={card.href!} className={className}>
              {inner}
            </Link>
          ) : (
            <div key={card.title} className={className}>
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}
