'use client'

// タブ内の子タブ。白い帯に並べ、選択中は青文字＋下線で示す。
//
// 以前はグレーの土台に、選択中だけ青の塗りつぶしだった。
// 案件の色（アラートの色）がページに敷かれるので土台のグレーが濁り、
// 選んでいない側が地の色に沈んで「ただの文字」に見えていた。
// 財産調査のようにタブが9枚並ぶ画面でとくに読みづらかったため、下線に変えた。
export function SubTabs({ tabs, active, onChange, className = '' }: {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (key: string) => void
  className?: string
}) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg px-1.5 ${className}`}>
      <div className="flex flex-wrap items-end gap-0.5">
        {tabs.map(t => {
          const on = active === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              aria-current={on ? 'page' : undefined}
              className={`px-3 py-2 text-[13px] rounded-t-[3px] transition-colors ${
                on
                  ? 'font-semibold text-brand-700 shadow-[inset_0_-2px_0_var(--color-brand-600)]'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
