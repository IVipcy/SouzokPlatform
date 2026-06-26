'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Info } from 'lucide-react'

// 案件詳細のタブキー。docs / documentCreate は本コンポでは描画せず、
// ヘッダー右上のアクションボタンから飛ぶ（到着物・書類作成）。
export type TabKey = 'orderSheet' | 'basicInfo' | 'ownerSales' | 'orderContent' | 'contractProc' | 'meeting' | 'clientInfo' | 'tasks' | 'deceased' | 'contract' | 'assets' | 'division' | 'will' | 'registration' | 'cancellation' | 'trust' | 'renunciation' | 'mediation' | 'probate' | 'guardianship' | 'referral' | 'docs' | 'documentCreate' | 'history'

type Props = {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  taskCount: number
  visibleTabs?: TabKey[]
  // 互換のため受け取るが未使用（案件情報グループはドロップダウン化したため）
  collapsedTabs?: TabKey[]
  // フロー・ナビゲーターが指し示すタブ（青outlineピル＋●で強調・複数可・順不同）
  highlightTabs?: TabKey[]
  // 案件情報ドロップダウンの先頭「管理情報」クリックでこのコールバックを呼ぶ
  onOpenManagementInfo?: () => void
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

type Group = 'main' | 'practice' | 'info' | 'header'
const TAB_GROUP: Record<TabKey, Group> = {
  basicInfo: 'main', orderSheet: 'main', tasks: 'main',
  deceased: 'practice', assets: 'practice', division: 'practice', will: 'practice',
  registration: 'practice', cancellation: 'practice', trust: 'practice', renunciation: 'practice',
  mediation: 'practice', probate: 'practice', guardianship: 'practice', referral: 'practice',
  ownerSales: 'info', orderContent: 'info', clientInfo: 'info', contract: 'info',
  meeting: 'info', contractProc: 'info', history: 'info',
  docs: 'header', documentCreate: 'header',
}

const DEFAULT_TABS: TabKey[] = [
  'basicInfo', 'orderSheet', 'tasks',
  'deceased', 'assets', 'referral', 'division', 'will', 'registration', 'cancellation',
  'ownerSales', 'orderContent', 'clientInfo', 'contract', 'meeting', 'contractProc',
]

export default function CaseTabs({ activeTab, onTabChange, taskCount, visibleTabs, highlightTabs, onOpenManagementInfo }: Props) {
  const all = visibleTabs ?? DEFAULT_TABS
  const highlightSet = new Set(highlightTabs ?? [])
  const counts: Record<string, number> = { taskCount }

  const mainTabs = all.filter(t => TAB_GROUP[t] === 'main')
  const practiceTabs = all.filter(t => TAB_GROUP[t] === 'practice')
  const infoTabs = all.filter(t => TAB_GROUP[t] === 'info')

  return (
    <div data-tabbar className="flex items-center gap-x-5 gap-y-1 flex-wrap border-b border-gray-200 mb-5 px-1">
      {mainTabs.map(key => (
        <Tab key={key} tabKey={key}
          isActive={activeTab === key}
          isHighlight={highlightSet.has(key)}
          count={COUNT_KEY[key] ? counts[COUNT_KEY[key]!] : undefined}
          onClick={() => onTabChange(key)} />
      ))}
      {mainTabs.length > 0 && practiceTabs.length > 0 && <VDivider />}
      {practiceTabs.map(key => (
        <Tab key={key} tabKey={key}
          isActive={activeTab === key}
          isHighlight={highlightSet.has(key)}
          onClick={() => onTabChange(key)} />
      ))}
      {(mainTabs.length > 0 || practiceTabs.length > 0) && infoTabs.length > 0 && <VDivider />}
      {infoTabs.length > 0 && (
        <InfoDropdown tabs={infoTabs} activeTab={activeTab} highlightSet={highlightSet}
          onTabChange={onTabChange} onOpenManagementInfo={onOpenManagementInfo} />
      )}
    </div>
  )
}

function VDivider() {
  return <span aria-hidden="true" className="w-px h-4 bg-gray-200 self-center" />
}

// 通常タブ＝テキスト＋下線アクティブ。ナビ強調タブだけ青outlineピル形（現状踏襲）。
// 両方の状態は、ピル形＋アクティブの強調（背景薄塗り＋太字）で表現する。
function Tab({ tabKey, isActive, isHighlight, count, onClick }: {
  tabKey: TabKey
  isActive: boolean
  isHighlight: boolean
  count?: number
  onClick: () => void
}) {
  // ナビ強調はピル形に切替。アクティブと両立する場合は薄塗り＋太字で重ねる。
  if (isHighlight) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-nav-tab={tabKey}
        className={`my-1.5 px-2.5 py-0.5 rounded-full border-[1.5px] border-brand-200 text-[12px] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
          isActive ? 'bg-brand-50 text-brand-700 font-semibold' : 'bg-white text-brand-800 hover:bg-brand-50/60'
        }`}
      >
        {TAB_LABELS[tabKey]}
        <span className="text-brand-600 font-bold text-[10px] leading-none">●</span>
        {count !== undefined && (
          <span className="bg-white text-brand-700 border border-brand-200 rounded-full px-1.5 text-[11px] font-mono leading-tight">{count}</span>
        )}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2.5 text-[13px] border-b-2 -mb-px whitespace-nowrap transition-colors inline-flex items-center gap-1 ${
        isActive
          ? 'text-brand-600 border-brand-600 font-semibold'
          : 'text-gray-500 border-transparent hover:text-gray-800'
      }`}
    >
      {TAB_LABELS[tabKey]}
      {count !== undefined && (
        <span className={`ml-1 text-[11px] font-mono px-1.5 rounded-full ${
          isActive ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-500'
        }`}>{count}</span>
      )}
    </button>
  )
}

// 案件情報グループのドロップダウン。先頭に「管理情報」、続いてグループ内のタブ。
function InfoDropdown({ tabs, activeTab, highlightSet, onTabChange, onOpenManagementInfo }: {
  tabs: TabKey[]
  activeTab: TabKey
  highlightSet: Set<TabKey>
  onTabChange: (t: TabKey) => void
  onOpenManagementInfo?: () => void
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
  // 案件情報タブを選択中なら、ボタンのラベルは選択中タブ名にする（今どこ判別のため）
  const buttonLabel = isOnInfo ? TAB_LABELS[activeTab] : '案件情報'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`py-2.5 text-[13px] border-b-2 -mb-px whitespace-nowrap transition-colors inline-flex items-center gap-1 ${
          isOnInfo
            ? 'text-brand-600 border-brand-600 font-semibold'
            : 'text-gray-500 border-transparent hover:text-gray-800'
        }`}
      >
        {buttonLabel}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2.25} />
        {hasHighlight && !isOnInfo && (
          <span className="text-brand-600 font-bold text-[10px] leading-none ml-0.5">●</span>
        )}
      </button>
      {open && (
        <div className="absolute top-full mt-1.5 right-0 z-50 bg-white border border-gray-200 rounded-lg p-1 shadow-[0_4px_16px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04)] min-w-[220px]">
          {onOpenManagementInfo && (
            <>
              <button
                type="button"
                onClick={() => { onOpenManagementInfo(); setOpen(false) }}
                className="w-full px-3 py-2 text-[13px] rounded-md text-left flex items-center gap-2 text-gray-800 hover:bg-gray-50 transition-colors"
              >
                <Info className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
                <span>管理情報</span>
                <span className="ml-auto text-[10px] text-gray-400">LP番号 / 場所 / 日付</span>
              </button>
              <div className="h-px bg-gray-200 my-1 mx-1.5" />
            </>
          )}
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
  )
}
