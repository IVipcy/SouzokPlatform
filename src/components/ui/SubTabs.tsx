'use client'

// タブ内の子タブ。丸い土台に丸いボタンを並べ、選択中を薄い青で塗る。
//
// もとはタスク一覧の「業務／その他」の切り替えで使っていた形。
// 選んでいない側もボタンの形が見えて押せると分かり、
// 選択中の塗りが濃すぎないので、9枚並ぶ財産調査でも文字の壁にならない。
// 相続人調査・財産調査・タスク区分など、タブ内の子タブはこれで統一する。
export function SubTabs({ tabs, active, onChange, className = '' }: {
  tabs: { key: string; label: string; count?: number }[]
  active: string
  onChange: (key: string) => void
  className?: string
}) {
  return (
    <div className={`inline-flex flex-wrap gap-1 bg-gray-50 border border-gray-200 rounded-full p-1 ${className}`}>
      {tabs.map(t => {
        const on = active === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-current={on ? 'page' : undefined}
            className={`px-3.5 py-1.5 rounded-full text-[13px] transition-colors whitespace-nowrap ${
              on
                ? 'bg-brand-100 text-brand-800 font-semibold'
                : 'text-gray-500 hover:text-gray-800 hover:bg-white'
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={`ml-1 text-[11px] font-mono ${on ? 'opacity-70' : 'opacity-60'}`}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
