'use client'

export type TabKey = 'basicInfo' | 'tasks' | 'deceased' | 'contract' | 'mailing' | 'assets' | 'division' | 'referral' | 'docs' | 'history'

type Props = {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  taskCount: number
  docCount: number
}

const tabs: { key: TabKey; label: string; countKey?: 'taskCount' | 'docCount' }[] = [
  { key: 'basicInfo', label: '基本情報' },
  { key: 'deceased', label: '被相続人・相続人' },
  { key: 'mailing', label: '郵送管理' },
  { key: 'assets', label: '財産情報' },
  { key: 'division', label: '遺産分割・遺言' },
  { key: 'contract', label: '契約・報酬・請求' },
  { key: 'referral', label: '紹介' },
  { key: 'docs', label: '書類', countKey: 'docCount' },
  { key: 'tasks', label: 'タスク', countKey: 'taskCount' },
  { key: 'history', label: '履歴' },
]

export default function CaseTabs({ activeTab, onTabChange, taskCount, docCount }: Props) {
  const counts: Record<string, number> = { taskCount, docCount }

  return (
    <div className="flex border-b border-gray-200 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {tabs.map(tab => {
        const count = tab.countKey ? counts[tab.countKey] : undefined
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              activeTab === tab.key
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            {tab.label}
            {count !== undefined && (
              <span className={`ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${
                activeTab === tab.key
                  ? 'bg-blue-50 text-blue-600'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
