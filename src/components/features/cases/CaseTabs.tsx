'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

// 案件詳細のタブキー。docs / documentCreate は本コンポでは描画せず、
// ヘッダー右上のアクションボタンから飛ぶ（到着物・書類作成）。
export type TabKey = 'orderSheet' | 'basicInfo' | 'caseBasic' | 'letter' | 'execution' | 'ownerSales' | 'orderContent' | 'contractProc' | 'meeting' | 'clientInfo' | 'tasks' | 'deceased' | 'contract' | 'assets' | 'division' | 'will' | 'registration' | 'cancellation' | 'trust' | 'renunciation' | 'mediation' | 'probate' | 'guardianship' | 'succession' | 'referral' | 'docs' | 'documentCreate' | 'history'

type Props = {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  taskCount: number
  visibleTabs?: TabKey[]
  collapsedTabs?: TabKey[]
  highlightTabs?: TabKey[]
  /** info グループ（面談情報・契約残手続き等）をドロップダウンに畳むか。
   *  対応中以降は true（案件情報にまとめる）、それ以前は false（タブが少ないので展開）。 */
  groupInfoTabs?: boolean
  /** 互換のため残置（管理情報は MeetingInfoTab の案件情報セクションへ統合済み） */
  onOpenManagementInfo?: () => void
}

const TAB_LABELS: Record<TabKey, string> = {
  orderSheet: 'オーダーシート',
  basicInfo: '案件進捗',
  caseBasic: '案件基本情報',
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
  succession: '遺産承継',
  letter: '手紙',
  execution: '執行通知',
  contract: '請求',
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
  basicInfo: 'main', orderSheet: 'main', clientInfo: 'main', tasks: 'main',
  deceased: 'practice', assets: 'practice', division: 'practice', will: 'practice',
  registration: 'practice', cancellation: 'practice', trust: 'practice', renunciation: 'practice',
  mediation: 'practice', probate: 'practice', guardianship: 'practice', referral: 'practice',
  succession: 'practice', contract: 'practice', letter: 'practice', execution: 'practice',
  ownerSales: 'info', orderContent: 'info',
  meeting: 'info', caseBasic: 'info', contractProc: 'info', history: 'info',
  docs: 'header', documentCreate: 'header',
}

const DEFAULT_TABS: TabKey[] = [
  'basicInfo', 'orderSheet', 'clientInfo', 'tasks',
  'deceased', 'assets', 'referral', 'division', 'will', 'registration', 'cancellation',
  'trust', 'renunciation', 'mediation', 'probate', 'guardianship', 'letter', 'execution', 'succession',
  'ownerSales', 'orderContent', 'contract', 'meeting', 'caseBasic', 'contractProc',
]

export default function CaseTabs({ activeTab, onTabChange, taskCount, visibleTabs, highlightTabs, groupInfoTabs = true }: Props) {
  const all = visibleTabs ?? DEFAULT_TABS
  const highlightSet = new Set(highlightTabs ?? [])
  const counts: Record<string, number> = { taskCount }

  const mainTabs = all.filter(t => TAB_GROUP[t] === 'main')
  const practiceTabs = all.filter(t => TAB_GROUP[t] === 'practice')
  const infoTabs = all.filter(t => TAB_GROUP[t] === 'info')

  return (
    <div data-tabbar className="flex items-center gap-1.5 flex-wrap mb-5">
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
      {/* 対応中以降はドロップダウンに畳む。それ以前はタブが少ないのでフラット展開。 */}
      {infoTabs.length > 0 && (
        groupInfoTabs ? (
          <InfoDropdown tabs={infoTabs} activeTab={activeTab} highlightSet={highlightSet}
            onTabChange={onTabChange} />
        ) : (
          infoTabs.map(key => (
            <Tab key={key} tabKey={key}
              isActive={activeTab === key}
              isHighlight={highlightSet.has(key)}
              onClick={() => onTabChange(key)} />
          ))
        )
      )}
    </div>
  )
}

function VDivider() {
  return <span aria-hidden="true" className="w-px h-5 bg-gray-300 self-center mx-1" />
}

// 各タブは独立した枠付きピル。コンテナ無し、グレー背景に直置き。
//   通常       = 白bg + 1px灰border + 灰文字
//   ホバー     = 薄ブランド色bg + ブランド色文字
//   アクティブ = ブランド色solid + 白文字
//   ナビ強調   = 白bg + 1.5px青outline + 青文字 + ●（現状踏襲）
//   両方       = アクティブの上に薄青outlineをグロー（box-shadow）として乗せる
function Tab({ tabKey, isActive, isHighlight, count, onClick }: {
  tabKey: TabKey
  isActive: boolean
  isHighlight: boolean
  count?: number
  onClick: () => void
}) {
  const base = 'inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-[13px] whitespace-nowrap transition-colors cursor-pointer'
  let state: string
  let extraStyle: React.CSSProperties = {}
  if (isActive && isHighlight) {
    state = 'bg-brand-600 text-white font-medium border border-brand-600'
    extraStyle = { boxShadow: '0 0 0 2px rgba(182, 199, 244, 0.7)' }
  } else if (isActive) {
    state = 'bg-brand-600 text-white font-medium border border-brand-600'
  } else if (isHighlight) {
    state = 'bg-white text-brand-800 font-medium border-[1.5px] border-brand-200 hover:bg-brand-50/60'
  } else {
    state = 'bg-white text-gray-600 border border-gray-200 hover:bg-brand-50/60 hover:text-brand-700 hover:border-brand-200'
  }
  return (
    <button
      type="button"
      onClick={onClick}
      data-nav-tab={isHighlight ? tabKey : undefined}
      style={extraStyle}
      className={`${base} ${state}`}
    >
      {TAB_LABELS[tabKey]}
      {count !== undefined && (
        <span className={`text-[11px] font-mono px-1.5 rounded-full ${
          isActive ? 'bg-white/20 text-white' : isHighlight ? 'bg-white text-brand-700 border border-brand-200' : 'bg-gray-100 text-gray-500'
        }`}>{count}</span>
      )}
      {isHighlight && (
        <span className={`font-bold text-[10px] leading-none ${isActive ? 'text-white' : 'text-brand-600'}`}>●</span>
      )}
    </button>
  )
}

// 案件情報グループのドロップダウン。閉じてる時のボタンも他タブと同じ枠付きピル形。
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
  const buttonLabel = isOnInfo ? TAB_LABELS[activeTab] : '案件情報'
  const base = 'inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-[13px] whitespace-nowrap transition-colors cursor-pointer'
  const state = isOnInfo
    ? 'bg-brand-600 text-white font-medium border border-brand-600'
    : hasHighlight
      ? 'bg-white text-brand-800 font-medium border-[1.5px] border-brand-200 hover:bg-brand-50/60'
      : 'bg-white text-gray-600 border border-gray-200 hover:bg-brand-50/60 hover:text-brand-700 hover:border-brand-200'

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${base} ${state}`}
      >
        {buttonLabel}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2.25} />
        {hasHighlight && !isOnInfo && (
          <span className="text-brand-600 font-bold text-[10px] leading-none ml-0.5">●</span>
        )}
      </button>
      {open && (
        <div className="absolute top-full mt-1.5 right-0 z-50 bg-white border border-gray-200 rounded-lg p-1 shadow-[0_4px_16px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04)] min-w-[220px]">
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
