'use client'

/**
 * 一覧の絞り込みタブ（作業進行中 7 ／ 受注 1 …）。
 *
 * 管理案件一覧で使っていた形にそろえる。一覧ごとに大きさも太さも件数の出し方も
 * 違っていて、同じ「案件一覧」の中でタブを切り替えるたびに見た目が変わっていた。
 */
export function FilterTabs({ tabs, active, onChange, className = '' }: {
  tabs: { key: string; label: string; count?: number }[]
  active: string
  onChange: (key: string) => void
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {tabs.map(t => {
        const on = active === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-current={on ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors ${
              on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className={`inline-flex items-center justify-center min-w-[20px] px-1 h-5 rounded-full text-[11px] font-bold ${
                on ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
              }`}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 一覧の「〇件選択中」バー。表の上に出す。
 * これも管理案件一覧の形にそろえる（他の一覧は表の見出し帯の中に入っていた）。
 */
export function BulkSelectBar({ count, onDelete, onClear, deleting = false }: {
  count: number
  onDelete: () => void
  onClear: () => void
  deleting?: boolean
}) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg">
      <span className="text-[12px] font-semibold text-gray-700">{count}件選択中</span>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="inline-flex items-center gap-1 px-3 py-1 text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50"
      >
        選択を削除
      </button>
      <button type="button" onClick={onClear} className="text-[12px] text-gray-400 hover:text-gray-600 px-1">解除</button>
    </div>
  )
}
