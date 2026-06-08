'use client'

export type TabKey = 'basicInfo' | 'meeting' | 'clientInfo' | 'tasks' | 'deceased' | 'contract' | 'assets' | 'division' | 'will' | 'registration' | 'cancellation' | 'referral' | 'docs' | 'documentCreate' | 'history'

type Props = {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  taskCount: number
  docCount: number
}

const tabs: { key: TabKey; label: string; countKey?: 'taskCount' | 'docCount' }[] = [
  { key: 'basicInfo', label: '案件進捗' },
  { key: 'meeting', label: '面談情報' },
  { key: 'clientInfo', label: '依頼者情報・やり取り' },
  { key: 'deceased', label: '相続人調査' },
  { key: 'assets', label: '財産調査' },
  { key: 'referral', label: '他士業等連携' },
  { key: 'division', label: '遺産分割' },
  { key: 'will', label: '遺言' },
  { key: 'registration', label: '相続登記' },
  { key: 'cancellation', label: '解約等（銀行・証券・自動車）' },
  { key: 'contract', label: '契約・報酬・請求' },
  { key: 'docs', label: '書類', countKey: 'docCount' },
  { key: 'documentCreate', label: '書類作成' },
  { key: 'tasks', label: 'タスク', countKey: 'taskCount' },
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
                ? 'text-brand-600 border-brand-600 font-semibold'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            {tab.label}
            {count !== undefined && (
              <span className={`ml-1 text-[12px] font-mono px-1.5 py-0.5 rounded ${
                activeTab === tab.key
                  ? 'bg-brand-50 text-brand-600'
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
