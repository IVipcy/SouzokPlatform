import Link from 'next/link'

export type ProgressView = 'progress' | 'billing'

type Props = {
  basePath: string
  currentView: ProgressView
  // 切替時に保持したい追加パラメータ
  extraParams?: Record<string, string | undefined>
}

const TABS: { key: ProgressView; label: string }[] = [
  { key: 'progress', label: '進捗' },
  { key: 'billing',  label: '請求状況' },
]

export default function ProgressViewTabs({ basePath, currentView, extraParams }: Props) {
  const buildHref = (view: ProgressView): string => {
    const params = new URLSearchParams()
    if (view !== 'progress') params.set('view', view)
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v) params.set(k, v)
      }
    }
    const qs = params.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  return (
    <div className="mb-4 inline-flex bg-gray-100 rounded-lg p-0.5">
      {TABS.map(t => {
        const active = currentView === t.key
        return (
          <Link
            key={t.key}
            href={buildHref(t.key)}
            className={`px-4 py-1.5 text-[13px] font-semibold rounded-md transition-all ${
              active
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
