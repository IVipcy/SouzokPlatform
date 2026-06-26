'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

// 案件詳細のタブキー。docs / documentCreate は本コンポでは描画せず、
// ヘッダー右上のアクションボタンから飛ぶ（到着物・書類作成）。
export type TabKey = 'orderSheet' | 'basicInfo' | 'ownerSales' | 'orderContent' | 'contractProc' | 'meeting' | 'clientInfo' | 'tasks' | 'deceased' | 'contract' | 'assets' | 'division' | 'will' | 'registration' | 'cancellation' | 'trust' | 'renunciation' | 'mediation' | 'probate' | 'guardianship' | 'referral' | 'docs' | 'documentCreate' | 'history'

type Props = {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  taskCount: number
  // 表示するタブ（左→右の順）。未指定なら全タブ。
  visibleTabs?: TabKey[]
  // 折りたたみ対象（現状は使わない・互換のため受け取るだけ）。
  collapsedTabs?: TabKey[]
  // フロー・ナビゲーターが指し示すタブ（白bg＋青outline＋●で強調・複数可・順不同）。
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
  docs: '到着物',
  documentCreate: '書類作成',
  tasks: 'タスク',
  history: '履歴',
}

const COUNT_KEY: Partial<Record<TabKey, 'taskCount'>> = {
  tasks: 'taskCount',
}

// グループ分け：
//   main    = 毎日触る中核（案件進捗/オーダーシート/タスク）
//   practice= 実務（相続人調査・財産調査・遺産分割 など、業務本流）
//   info    = 案件設定（担当ルート・受注内容・依頼者・報酬請求 など）→ ドロップダウン化
//   header  = ヘッダー右上ボタンへ移動（到着物・書類作成）
type Group = 'main' | 'practice' | 'info' | 'header'
const TAB_GROUP: Record<TabKey, Group> = {
  basicInfo: 'main',
  orderSheet: 'main',
  tasks: 'main',
  deceased: 'practice',
  assets: 'practice',
  division: 'practice',
  will: 'practice',
  registration: 'practice',
  cancellation: 'practice',
  trust: 'practice',
  renunciation: 'practice',
  mediation: 'practice',
  probate: 'practice',
  guardianship: 'practice',
  referral: 'practice',
  ownerSales: 'info',
  orderContent: 'info',
  clientInfo: 'info',
  contract: 'info',
  meeting: 'info',
  contractProc: 'info',
  history: 'info',
  docs: 'header',
  documentCreate: 'header',
}

const DEFAULT_TABS: TabKey[] = [
  'basicInfo', 'orderSheet', 'tasks',
  'deceased', 'assets', 'referral', 'division', 'will', 'registration', 'cancellation',
  'ownerSales', 'orderContent', 'clientInfo', 'contract', 'meeting', 'contractProc',
]

export default function CaseTabs({ activeTab, onTabChange, taskCount, visibleTabs, highlightTabs }: Props) {
  const all = visibleTabs ?? DEFAULT_TABS
  const highlightSet = new Set(highlightTabs ?? [])
  const counts: Record<string, number> = { taskCount }

  const mainTabs = all.filter(t => TAB_GROUP[t] === 'main')
  const practiceTabs = all.filter(t => TAB_GROUP[t] === 'practice')
  const infoTabs = all.filter(t => TAB_GROUP[t] === 'info')

  return (
    <div data-tabbar className="flex items-end gap-3 flex-wrap mb-5">
      {mainTabs.length > 0 && (
        <Group label="メイン" tabs={mainTabs} activeTab={activeTab} highlightSet={highlightSet} counts={counts} onTabChange={onTabChange} />
      )}
      {practiceTabs.length > 0 && (
        <Group label="実務" tabs={practiceTabs} activeTab={activeTab} highlightSet={highlightSet} counts={counts} onTabChange={onTabChange} />
      )}
      {infoTabs.length > 0 && (
        <InfoDropdown tabs={infoTabs} activeTab={activeTab} highlightSet={highlightSet} onTabChange={onTabChange} />
      )}
    </div>
  )
}

function Group({ label, tabs, activeTab, highlightSet, counts, onTabChange }: {
  label: string
  tabs: TabKey[]
  activeTab: TabKey
  highlightSet: Set<TabKey>
  counts: Record<string, number>
  onTabChange: (t: TabKey) => void
}) {
  return (
    <div>
      <GroupLabel>{label}</GroupLabel>
      <div className="bg-gray-100 rounded-lg p-[3px] inline-flex gap-0 flex-wrap">
        {tabs.map(key => (
          <SegOption
            key={key}
            tabKey={key}
            isActive={activeTab === key}
            isHighlight={highlightSet.has(key)}
            count={COUNT_KEY[key] ? counts[COUNT_KEY[key]!] : undefined}
            onClick={() => onTabChange(key)}
          />
        ))}
      </div>
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-medium text-gray-400 tracking-[0.12em] uppercase mb-1.5 flex items-center gap-1.5">
      <span className="inline-block w-[3px] h-[11px] bg-gray-400 rounded-sm" aria-hidden="true" />
      {children}
    </div>
  )
}

// Segmented control の各オプション。
//   通常       = 透明bg＋灰文字
//   アクティブ = 白bg＋影＋青文字＋太字（Segmented標準）
//   ナビ強調   = 白bg＋1.5px青outline＋青文字＋●ドット（現状踏襲）
//   両方       = 上記の重ねがけ
function SegOption({ tabKey, isActive, isHighlight, count, onClick }: {
  tabKey: TabKey
  isActive: boolean
  isHighlight: boolean
  count?: number
  onClick: () => void
}) {
  const base = 'relative px-3.5 py-1.5 text-[13px] rounded-md inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors cursor-pointer border-[1.5px]'
  const state = isActive && isHighlight
    ? 'bg-white text-brand-600 font-semibold border-brand-200 shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
    : isActive
      ? 'bg-white text-brand-600 font-semibold border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.04)]'
      : isHighlight
        ? 'bg-white text-brand-800 border-brand-200'
        : 'text-gray-500 border-transparent hover:bg-white/60 hover:text-gray-800'
  return (
    <button
      type="button"
      onClick={onClick}
      data-nav-tab={isHighlight ? tabKey : undefined}
      className={`${base} ${state}`}
    >
      {TAB_LABELS[tabKey]}
      {count !== undefined && <CountBadge count={count} isActive={isActive} isHighlight={isHighlight} />}
      {isHighlight && <span className="text-brand-600 font-bold text-[10px] ml-0.5 leading-none">●</span>}
    </button>
  )
}

function CountBadge({ count, isActive, isHighlight }: { count: number; isActive: boolean; isHighlight: boolean }) {
  const cls = isHighlight
    ? 'bg-white text-brand-700 border border-brand-200'
    : isActive
      ? 'bg-brand-50 text-brand-600'
      : 'bg-gray-200 text-gray-600'
  return (
    <span className={`ml-1 text-[11px] font-mono px-1.5 rounded-full ${cls}`}>{count}</span>
  )
}

// 案件情報グループのドロップダウン。開閉式メニュー。
// info タブを選択中 → ボタン自体が白浮きアクティブに、ラベルは選択中タブ名。
// info 群の他のタブにナビ強調がある → 閉じてる時にボタンに●を出す。
function InfoDropdown({ tabs, activeTab, highlightSet, onTabChange }: {
  tabs: TabKey[]
  activeTab: TabKey
  highlightSet: Set<TabKey>
  onTabChange: (t: TabKey) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const isOnInfo = tabs.includes(activeTab)
  const hasHighlight = tabs.some(t => highlightSet.has(t))

  const btnBase = 'relative px-3.5 py-1.5 text-[13px] rounded-md inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors cursor-pointer border-[1.5px]'
  const btnState = isOnInfo
    ? 'bg-white text-brand-600 font-semibold border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.04)]'
    : hasHighlight
      ? 'bg-white text-brand-800 border-brand-200'
      : 'text-gray-500 border-transparent hover:bg-white/60 hover:text-gray-800'

  return (
    <div ref={ref}>
      <GroupLabel>案件情報</GroupLabel>
      <div className="relative bg-gray-100 rounded-lg p-[3px] inline-flex">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`${btnBase} ${btnState}`}
        >
          {isOnInfo ? TAB_LABELS[activeTab] : '案件情報'}
          <ChevronDown className={`w-3.5 h-3.5 ml-0.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          {hasHighlight && !isOnInfo && <span className="text-brand-600 font-bold text-[10px] ml-0.5 leading-none">●</span>}
        </button>
        {open && (
          <div className="absolute top-full mt-1.5 right-0 z-50 bg-white border border-gray-200 rounded-lg p-1 shadow-[0_4px_16px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04)] min-w-[200px]">
            {tabs.map(key => {
              const isItemActive = activeTab === key
              const isItemHighlight = highlightSet.has(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { onTabChange(key); setOpen(false) }}
                  className={`w-full px-3 py-2 text-[13px] rounded-md text-left flex items-center justify-between transition-colors ${
                    isItemActive ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {TAB_LABELS[key]}
                    {isItemHighlight && <span className="text-brand-600 font-bold text-[10px] leading-none">●</span>}
                  </span>
                  {isItemActive && <Check className="w-3.5 h-3.5" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
