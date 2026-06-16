'use client'

import { useState } from 'react'

export type TabKey = 'orderSheet' | 'basicInfo' | 'ownerSales' | 'orderContent' | 'contractProc' | 'meeting' | 'clientInfo' | 'tasks' | 'deceased' | 'contract' | 'assets' | 'division' | 'will' | 'registration' | 'cancellation' | 'trust' | 'renunciation' | 'mediation' | 'probate' | 'guardianship' | 'referral' | 'docs' | 'documentCreate' | 'history'

type Props = {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  taskCount: number
  docCount: number
  // 表示するタブ（左→右の順）。未指定なら全タブ。
  visibleTabs?: TabKey[]
  // 折りたたみ対象（末尾「その他 ▾」に格納し既定で非表示）。
  collapsedTabs?: TabKey[]
  // フロー・ナビゲーターが指し示すタブ（四角で囲み点滅・複数可・順不同）。
  highlightTabs?: TabKey[]
}

const TAB_LABELS: Record<TabKey, string> = {
  orderSheet: 'オーダーシート',
  basicInfo: '案件進捗',
  ownerSales: '担当・受注ルート',
  orderContent: '受注内容',
  contractProc: '契約残手続き',
  meeting: '面談情報',
  clientInfo: '依頼者',
  deceased: '相続人調査',
  assets: '財産調査',
  referral: '他事業者紹介',
  division: '遺産分割',
  will: '遺言',
  registration: '相続登記',
  cancellation: '解約手続',
  trust: '信託契約',
  renunciation: '相続放棄',
  mediation: '調停',
  probate: '遺言検認',
  guardianship: '成年後見',
  contract: '報酬・請求',
  docs: '書類',
  documentCreate: '書類作成',
  tasks: 'タスク',
  history: '履歴',
}

const COUNT_KEY: Partial<Record<TabKey, 'taskCount' | 'docCount'>> = {
  docs: 'docCount',
  tasks: 'taskCount',
}

const DEFAULT_TABS: TabKey[] = [
  'basicInfo', 'meeting', 'clientInfo', 'deceased', 'assets', 'referral',
  'division', 'will', 'registration', 'cancellation', 'contract',
  'docs', 'tasks',
]

export default function CaseTabs({ activeTab, onTabChange, taskCount, docCount, visibleTabs, collapsedTabs, highlightTabs }: Props) {
  const [showOther, setShowOther] = useState(false)
  const counts: Record<string, number> = { taskCount, docCount }
  const highlightSet = new Set(highlightTabs ?? [])

  const all = visibleTabs ?? DEFAULT_TABS
  const collapsed = new Set(collapsedTabs ?? [])
  const mainTabs = all.filter(t => !collapsed.has(t))
  const hiddenTabs = all.filter(t => collapsed.has(t))

  const renderTab = (key: TabKey) => {
    const countKey = COUNT_KEY[key]
    const count = countKey ? counts[countKey] : undefined
    const highlighted = highlightSet.has(key)
    return (
      <button
        key={key}
        onClick={() => onTabChange(key)}
        data-nav-tab={highlighted ? key : undefined}
        className={`relative px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
          activeTab === key
            ? 'text-brand-600 border-brand-600 font-semibold'
            : highlighted
              ? 'text-brand-700 border-brand-500 font-semibold'
              : 'text-gray-500 border-transparent hover:text-gray-700'
        }`}
      >
        {highlighted && (
          <span className="nav-spotlight pointer-events-none absolute inset-x-1 inset-y-1 rounded-md" aria-hidden="true" />
        )}
        <span className="relative inline-flex items-center gap-1.5">
          {TAB_LABELS[key]}
          {highlighted && <span className="nav-dot w-1.5 h-1.5 rounded-full bg-brand-500" aria-hidden="true" />}
        </span>
        {count !== undefined && (
          <span className={`relative ml-1 text-[12px] font-mono px-1.5 py-0.5 rounded ${
            activeTab === key ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-500'
          }`}>
            {count}
          </span>
        )}
      </button>
    )
  }

  return (
    <div data-tabbar className="flex items-center border-b border-gray-200 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {mainTabs.map(renderTab)}

      {hiddenTabs.length > 0 && (
        <>
          <button
            onClick={() => setShowOther(v => !v)}
            className={`px-3 py-2.5 text-[13px] font-medium border-b-2 border-transparent -mb-px whitespace-nowrap transition-colors ${
              showOther ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'
            }`}
            title="その他のタブ"
          >
            その他 {showOther ? '▴' : '▾'}
          </button>
          {showOther && hiddenTabs.map(renderTab)}
        </>
      )}
    </div>
  )
}
