'use client'

import { useState, useRef, useEffect } from 'react'
import {
  ChevronDown, Check, Star, Activity, MessageCircle, Receipt, ListChecks, Users, Wallet,
  Handshake, Split, Feather, Home, Landmark, Shield, FileX, Scale, FileSearch, ShieldCheck,
  Coins, Mail, Send, FileSignature, Settings, UserCheck, CalendarClock, FileCheck, History,
  Inbox, Folder, FilePlus2, Contact, TrendingUp, Network, Package, type LucideIcon,
} from 'lucide-react'

// 案件詳細のタブキー。docs / documentCreate は本コンポでは描画せず、
// ヘッダー右上のアクションボタンから飛ぶ（到着物・書類作成）。
export type TabKey = 'orderSheet' | 'basicInfo' | 'progress' | 'letter' | 'execution' | 'contractCreate' | 'ownerSales' | 'assignees' | 'contractProc' | 'meeting' | 'clientInfo' | 'tasks' | 'deceased' | 'legalInfo' | 'contract' | 'assets' | 'division' | 'will' | 'registration' | 'cancellation' | 'trust' | 'renunciation' | 'mediation' | 'probate' | 'guardianship' | 'succession' | 'referral' | 'receipts' | 'docs' | 'documentCreate' | 'delivery' | 'history'

type Props = {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  taskCount: number
  visibleTabs?: TabKey[]
  collapsedTabs?: TabKey[]
  highlightTabs?: TabKey[]
  /** 完了した実施タブ（紐づくタスクが全件完了）。デフォルトで非表示、末尾「完了 (N) ▸」トグルで展開 */
  completedTabs?: TabKey[]
  /** info グループ（面談情報・契約残手続き等）をドロップダウンに畳むか。
   *  対応中以降は true（案件情報にまとめる）、それ以前は false（タブが少ないので展開）。 */
  groupInfoTabs?: boolean
  /** true のとき、グループ分けせず visibleTabs の順序どおりにフラット表示（ミニマム運用の固定順用）。 */
  flatOrder?: boolean
  /** 互換のため残置（管理情報は MeetingInfoTab の案件情報セクションへ統合済み） */
  onOpenManagementInfo?: () => void
}

const TAB_LABELS: Record<TabKey, string> = {
  orderSheet: 'オーダーシート',
  basicInfo: '案件進捗',
  progress: '案件報告',
  ownerSales: '案件管理',
  assignees: '担当者',
  contractProc: '契約手続き',
  meeting: '面談情報',
  // 担当者 / 案件管理（案件番号等）/ 面談情報 を親「案件基本情報」ドロップダウンに束ねる。
  // contractProc は「契約手続き」に改称（旧: 郵送書類確認）
  clientInfo: '依頼者連絡',
  deceased: '相続人調査',
  legalInfo: '法定相続一覧図',
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
  contractCreate: '契約書作成',
  contract: '請求',
  receipts: '到着物',
  docs: '案件フォルダ',
  documentCreate: '書類作成',
  delivery: '納品',
  tasks: 'タスク',
  history: '履歴',
}

// タブごとのアイコン。orderSheet だけ特別（金の★・大事なタブ）。will は筆。
const TAB_ICONS: Record<TabKey, LucideIcon> = {
  orderSheet: Star, basicInfo: Activity, progress: TrendingUp, clientInfo: MessageCircle, contract: Receipt, tasks: ListChecks,
  deceased: Users, legalInfo: Network, assets: Wallet, referral: Handshake, division: Split, will: Feather,
  registration: Home, cancellation: Landmark, trust: Shield, renunciation: FileX, mediation: Scale,
  probate: FileSearch, guardianship: ShieldCheck, succession: Coins, letter: Mail, execution: Send,
  contractCreate: FileSignature, ownerSales: Settings, assignees: UserCheck, meeting: CalendarClock,
  contractProc: FileCheck, history: History, receipts: Inbox, docs: Folder, documentCreate: FilePlus2,
  delivery: Package,
}

const COUNT_KEY: Partial<Record<TabKey, 'taskCount'>> = {
  tasks: 'taskCount',
}

type Group = 'main' | 'practice' | 'info' | 'header'
const TAB_GROUP: Record<TabKey, Group> = {
  // 請求(contract)は依頼者連絡(clientInfo)の右に置くため main グループに含める。
  basicInfo: 'main', progress: 'main', orderSheet: 'main', clientInfo: 'main', contract: 'main', tasks: 'main',
  deceased: 'practice', legalInfo: 'practice', assets: 'practice', division: 'practice', will: 'practice',
  registration: 'practice', cancellation: 'practice', trust: 'practice', renunciation: 'practice',
  mediation: 'practice', probate: 'practice', guardianship: 'practice', referral: 'practice',
  succession: 'practice', letter: 'practice', execution: 'practice', contractCreate: 'practice',
  // 納品タブ = 実施タブ扱い（案件基本情報ドロップダウンの直左に来るように practice グループ末尾へ）
  delivery: 'practice',
  ownerSales: 'info', assignees: 'info',
  meeting: 'info', contractProc: 'info', history: 'info',
  receipts: 'header', docs: 'header', documentCreate: 'header',
}

// 親「案件基本情報」ドロップダウンに束ねる子タブ（担当者＋案件管理＋面談情報）。
const BASIC_INFO_TABS: TabKey[] = ['assignees', 'ownerSales', 'meeting']

const DEFAULT_TABS: TabKey[] = [
  'basicInfo', 'orderSheet', 'clientInfo', 'tasks',
  'deceased', 'legalInfo', 'assets', 'referral', 'division', 'will', 'registration', 'cancellation',
  'trust', 'renunciation', 'mediation', 'probate', 'guardianship', 'letter', 'execution', 'contractCreate', 'succession',
  'delivery',   // 実施タブ末尾＝案件基本情報ドロップダウンの直左
  'assignees', 'ownerSales', 'contract', 'meeting', 'contractProc',
]

export default function CaseTabs({ activeTab, onTabChange, taskCount, visibleTabs, highlightTabs, completedTabs, groupInfoTabs = true, flatOrder = false }: Props) {
  const all = visibleTabs ?? DEFAULT_TABS
  const highlightSet = new Set(highlightTabs ?? [])
  // 完了タブ集合。active になっているタブは（意図せず消えないよう）折り畳み対象から除外。
  const completedSet = new Set((completedTabs ?? []).filter(t => t !== activeTab))
  const [showCompleted, setShowCompleted] = useState(false)
  const counts: Record<string, number> = { taskCount }

  // 案件管理＋面談情報は親「案件基本情報」ドロップダウンに束ねる（2つ未満なら通常タブ）。
  const basicInfoTabs = all.filter(t => BASIC_INFO_TABS.includes(t))
  const renderBasicInfo = () => {
    if (basicInfoTabs.length === 0) return null
    if (basicInfoTabs.length === 1) {
      const key = basicInfoTabs[0]
      return <Tab key={key} tabKey={key} isActive={activeTab === key} isHighlight={highlightSet.has(key)} onClick={() => onTabChange(key)} />
    }
    return <InfoDropdown label="案件基本情報" tabs={basicInfoTabs} activeTab={activeTab} highlightSet={highlightSet} onTabChange={onTabChange} />
  }

  // ミニマム運用など固定順で見せたいときは、グループ分けせず visibleTabs の順のままフラット表示。
  // docs / documentCreate はヘッダーボタンで開くタブなので、フラット表示でもピルにはしない。
  if (flatOrder) {
    const flatTabs = all.filter(key => TAB_GROUP[key] !== 'header' && !BASIC_INFO_TABS.includes(key))
    return (
      <div data-tabbar className="flex items-center gap-0.5 border-b border-gray-200 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {flatTabs.map(key => (
          <Tab key={key} tabKey={key}
            isActive={activeTab === key}
            isHighlight={highlightSet.has(key)}
            count={COUNT_KEY[key] ? counts[COUNT_KEY[key]!] : undefined}
            onClick={() => onTabChange(key)} />
        ))}
        {renderBasicInfo()}
      </div>
    )
  }

  const mainTabs = all.filter(t => TAB_GROUP[t] === 'main')
  const practiceTabsAll = all.filter(t => TAB_GROUP[t] === 'practice')
  // 完了タブは折り畳み。トグル展開時のみインラインで戻す。
  const practiceCompletedCount = practiceTabsAll.filter(t => completedSet.has(t)).length
  const practiceTabs = practiceTabsAll.filter(t => showCompleted || !completedSet.has(t))
  // 対応中以降（groupInfoTabs）は info を1つの「案件情報」に統合（案件基本情報も含めて重複させない）。
  // それ以前はドロップダウンにせず、info は個別タブ＋案件基本情報グループだけ別立てにする。
  const infoAll = all.filter(t => TAB_GROUP[t] === 'info')
  const infoTabs = infoAll.filter(t => !BASIC_INFO_TABS.includes(t))

  return (
    <div data-tabbar className="flex items-center gap-0.5 border-b border-gray-200 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {mainTabs.map(key => (
        <Tab key={key} tabKey={key}
          isActive={activeTab === key}
          isHighlight={highlightSet.has(key)}
          count={COUNT_KEY[key] ? counts[COUNT_KEY[key]!] : undefined}
          onClick={() => onTabChange(key)} />
      ))}
      {practiceTabs.map(key => (
        <Tab key={key} tabKey={key}
          isActive={activeTab === key}
          isHighlight={highlightSet.has(key)}
          isMuted={completedSet.has(key)}
          onClick={() => onTabChange(key)} />
      ))}
      {practiceCompletedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowCompleted(v => !v)}
          className={`inline-flex items-center gap-1 px-2 py-1 my-1.5 rounded-full border transition-colors cursor-pointer ${showCompleted ? 'bg-gray-700 text-white border-gray-700 hover:bg-gray-800' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200 hover:text-gray-800'}`}
          title={showCompleted ? `完了タブを折り畳む (${practiceCompletedCount}件)` : `完了タブを表示 (${practiceCompletedCount}件)`}
          aria-label={showCompleted ? '完了タブを折り畳む' : '完了タブを表示'}
        >
          <span className="text-[14px] leading-none font-bold">⋯</span>
          <span className="text-[11px] font-mono font-bold">+{practiceCompletedCount}</span>
        </button>
      )}
      {groupInfoTabs ? (
        infoAll.length > 0 && (
          <InfoDropdown tabs={infoAll} activeTab={activeTab} highlightSet={highlightSet} onTabChange={onTabChange} />
        )
      ) : (
        <>
          {infoTabs.map(key => (
            <Tab key={key} tabKey={key}
              isActive={activeTab === key}
              isHighlight={highlightSet.has(key)}
              onClick={() => onTabChange(key)} />
          ))}
          {renderBasicInfo()}
        </>
      )}
    </div>
  )
}

// 各タブは下線＋アイコンの枠なし（案件一覧ページと同じ意匠）。
//   通常       = グレー文字・下線なし
//   ホバー     = 文字が濃くなる
//   アクティブ = 青文字＋青の下線
//   ナビ強調   = ● を付ける（data-nav-tab で案内線と連動）
//   orderSheet = 金の★（大事なタブ・選択状態に関わらず★は金）／will = 筆
function Tab({ tabKey, isActive, isHighlight, isMuted, count, onClick }: {
  tabKey: TabKey
  isActive: boolean
  isHighlight: boolean
  /** 完了タブを展開表示中の見た目（灰色＋✓） */
  isMuted?: boolean
  count?: number
  onClick: () => void
}) {
  const Icon = TAB_ICONS[tabKey]
  const isStar = tabKey === 'orderSheet'
  const base = 'inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer'
  const state = isActive
    ? 'text-brand-600 border-brand-600 font-medium'
    : isMuted
      ? 'text-gray-400 border-transparent hover:text-gray-600'
      : isHighlight
        ? 'text-brand-700 border-transparent font-medium hover:text-brand-800'
        : 'text-gray-500 border-transparent hover:text-gray-700'
  return (
    <button
      type="button"
      onClick={onClick}
      data-nav-tab={isHighlight ? tabKey : undefined}
      className={`${base} ${state}`}
    >
      {isStar
        ? <Star className="w-[17px] h-[17px]" strokeWidth={1.75} style={{ fill: '#E8A317', color: '#E8A317' }} />
        : <Icon className="w-[17px] h-[17px]" strokeWidth={isActive ? 2.25 : 1.9} />}
      <span className={isStar && !isActive ? 'font-medium text-gray-800' : undefined}>{TAB_LABELS[tabKey]}</span>
      {count !== undefined && (
        <span className={`text-[10.5px] font-mono px-1.5 py-0.5 rounded ${isActive ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-400'}`}>{count}</span>
      )}
      {isMuted && <Check className="w-3 h-3 text-emerald-500" strokeWidth={2.5} />}
      {isHighlight && <span className="font-bold text-[10px] leading-none text-brand-600">●</span>}
    </button>
  )
}

// 案件情報グループのドロップダウン。閉じてる時のボタンも他タブと同じ枠付きピル形。
function InfoDropdown({ tabs, activeTab, highlightSet, onTabChange, label = '案件情報' }: {
  tabs: TabKey[]
  activeTab: TabKey
  highlightSet: Set<TabKey>
  onTabChange: (t: TabKey) => void
  /** 閉じているときのボタン名（既定=案件情報）。案件基本情報グループでは差し替える。 */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  // メニューは position: fixed で出す（タブバーの overflow-x-auto に縦もクリップされるのを回避）。
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    }
    setOpen(o => !o)
  }

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
  const buttonLabel = isOnInfo ? TAB_LABELS[activeTab] : label
  // 閉じてる時のアイコン：選択中の子があればその子のアイコン、無ければグループ（人カード）。
  const TriggerIcon = isOnInfo ? TAB_ICONS[activeTab] : Contact
  const base = 'inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer'
  const state = isOnInfo
    ? 'text-brand-600 border-brand-600 font-medium'
    : hasHighlight
      ? 'text-brand-700 border-transparent font-medium hover:text-brand-800'
      : 'text-gray-500 border-transparent hover:text-gray-700'

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        className={`${base} ${state}`}
      >
        <TriggerIcon className="w-[17px] h-[17px]" strokeWidth={isOnInfo ? 2.25 : 1.9} />
        {buttonLabel}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2.25} />
        {hasHighlight && !isOnInfo && (
          <span className="text-brand-600 font-bold text-[10px] leading-none ml-0.5">●</span>
        )}
      </button>
      {open && pos && (
        <div style={{ position: 'fixed', top: pos.top, right: pos.right }} className="z-50 bg-white border border-gray-200 rounded-lg p-1 shadow-[0_4px_16px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04)] min-w-[220px]">
          {tabs.map(key => {
            const isItemActive = activeTab === key
            const isItemHighlight = highlightSet.has(key)
            const ItemIcon = TAB_ICONS[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => { onTabChange(key); setOpen(false) }}
                className={`w-full px-3 py-2 text-[13px] rounded-md text-left flex items-center justify-between transition-colors ${
                  isItemActive ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-800 hover:bg-gray-50'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <ItemIcon className={`w-4 h-4 ${isItemActive ? 'text-brand-600' : 'text-gray-500'}`} strokeWidth={1.9} />
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
