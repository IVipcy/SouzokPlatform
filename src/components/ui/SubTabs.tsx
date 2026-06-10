'use client'

// タブ内の子タブ用セグメントUI。背景付きで「ただの文字列」に見えないようにする。
export function SubTabs({ tabs, active, onChange, className = '' }: {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (key: string) => void
  className?: string
}) {
  return (
    <div className={`inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1 flex-wrap ${className}`}>
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`px-3.5 py-1.5 text-[13px] font-semibold rounded-md transition-colors ${
            active === t.key
              ? 'bg-white text-brand-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
