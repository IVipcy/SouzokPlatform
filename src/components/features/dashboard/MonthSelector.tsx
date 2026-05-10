import Link from 'next/link'

type Props = {
  basePath: string
  selectedMonth: string | 'all'  // 'YYYY-MM' or 'all'
  today: Date
}

function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

export default function MonthSelector({ basePath, selectedMonth, today }: Props) {
  const thisYm = ymOf(today)
  const nextYm = ymOf(addMonths(today, 1))
  const twoYm = ymOf(addMonths(today, 2))
  const threeYm = ymOf(addMonths(today, 3))

  const items = [
    { label: '今月',     value: thisYm },
    { label: '来月',     value: nextYm },
    { label: '再来月',   value: twoYm },
    { label: '3ヶ月先',  value: threeYm },
    { label: '全期間',   value: 'all' as const },
  ]

  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-[13px] font-semibold text-gray-500">表示月：</span>
      <div className="inline-flex flex-wrap gap-1.5">
        {items.map(item => {
          const active = item.value === selectedMonth
          const cls = active
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50/40'
          const href = `${basePath}?month=${item.value}`
          return (
            <Link
              key={item.value}
              href={href}
              className={`text-[13px] font-medium px-3 py-1.5 rounded border transition ${cls}`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
