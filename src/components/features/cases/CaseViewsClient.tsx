'use client'

import { useMemo, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { ClipboardList, MessageSquare, Sparkles, Megaphone, Search, type LucideIcon } from 'lucide-react'
import MyPageCasesTab, { type MyCaseRow } from '@/components/features/my/MyPageCasesTab'
import { FilterTabs } from '@/components/ui/FilterTabs'
import ConsultationCasesTable, { type ConsultCase } from '@/components/features/my/ConsultationCasesTable'
import ReferralCasesTable, { type ReferralRow } from '@/components/features/my/ReferralCasesTable'
import LpCasesTable, { type LpCaseRow } from '@/components/features/cases/LpCasesTable'
import { CASE_STATUSES, getCaseStatusLabel } from '@/lib/constants'

type View = 'manage' | 'consult' | 'mishaku' | 'referral' | 'lp'

// サイドバーのサブメニュー（/cases?view=xxx）と対応
const VIEWS: View[] = ['consult', 'mishaku', 'manage', 'referral', 'lp']
const VIEW_META: Record<View, { label: string; Icon: LucideIcon }> = {
  consult: { label: '相談案件一覧', Icon: MessageSquare },
  mishaku: { label: '未着手案件一覧', Icon: Sparkles },
  manage: { label: '管理案件一覧', Icon: ClipboardList },
  referral: { label: '個別案件一覧', Icon: Sparkles },
  lp: { label: 'LP案件一覧', Icon: Megaphone },
}

type Props = {
  managerRows: MyCaseRow[]
  completedRows: MyCaseRow[]
  consultRows: ConsultCase[]
  mishakuRows: ConsultCase[]
  referralRows: ReferralRow[]
  lpRows: LpCaseRow[]
}

// 検索の共通フィルタ。案件名・管理番号に加え、受注/管理担当者名・担当チーム・受注内容（手続区分）も対象。
type SearchableRow = {
  case_number: string
  lp_case_number?: string | null
  deal_name: string
  sales_name?: string | null
  manager_name?: string | null
  /** サブ管理担当者名（引継ぎ・応援。いないことが多い） */
  sub_manager_name?: string | null
  team_name?: string | null
  procedure_type?: string[] | null
}
function applySearch<T extends SearchableRow>(rows: T[], q: string): T[] {
  const qq = q.trim().toLowerCase()
  if (!qq) return rows
  return rows.filter(r => {
    const hay = [r.case_number, r.lp_case_number, r.deal_name, r.sales_name, r.manager_name, r.sub_manager_name, r.team_name, ...(r.procedure_type ?? [])]
      .filter(Boolean).join(' ').toLowerCase()
    return hay.includes(qq)
  })
}

// ステータス絞り込み
function applyStatus<T extends { status: string }>(rows: T[], status: string): T[] {
  if (status === 'all') return rows
  return rows.filter(r => r.status === status)
}

/**
 * 案件管理(/cases)の表示切替。
 * マイページ定義の3一覧（管理案件一覧 / 相談案件一覧 / 個別管理案件）を流用し、
 * 検索（案件名・案件管理番号）を共通で提供する。
 */
export default function CaseViewsClient({ managerRows, completedRows, consultRows, mishakuRows, referralRows, lpRows }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const viewParam = searchParams.get('view') as View | null
  // タブで切替。URL(?view=)を真実として保持し、ディープリンク・リロードでも維持。
  const view: View = viewParam && VIEWS.includes(viewParam) ? viewParam : 'consult'
  const changeView = (v: View) => router.replace(`${pathname}?view=${v}`, { scroll: false })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  // 管理案件ビュー内のサブ切替（作業進行中 / 業務完了 / 納品完了）
  const [manageSub, setManageSub] = useState<'active' | 'businessComplete' | 'delivered'>('active')

  // 現在ビューに存在するステータスだけを絞り込み候補に出す（CASE_STATUSES の並び順を維持）
  const activeRows = view === 'manage' ? managerRows : view === 'consult' ? consultRows : view === 'mishaku' ? mishakuRows : view === 'referral' ? referralRows : lpRows
  const statusOptions = useMemo(() => {
    // LP案件はライフサイクル全段階を取りうるため、全ステータスで絞り込み可能にする
    if (view === 'lp') return CASE_STATUSES.map(s => s.key)
    const present = new Set(activeRows.map(r => r.status))
    return CASE_STATUSES.filter(s => present.has(s.key)).map(s => s.key)
  }, [activeRows, view])
  // ビュー切替で前ビューのステータス絞り込みが残るのを無効化（候補に無ければ「すべて」扱い）
  const effStatus = statusFilter === 'all' || (statusOptions as string[]).includes(statusFilter) ? statusFilter : 'all'

  // 検索＋ステータスで絞り込み
  const filteredManager = useMemo(() => applyStatus(applySearch(managerRows, search), effStatus), [managerRows, search, effStatus])
  const filteredCompleted = useMemo(() => applySearch(completedRows, search), [completedRows, search])
  const filteredConsult = useMemo(() => applyStatus(applySearch(consultRows, search), effStatus), [consultRows, search, effStatus])
  const filteredMishaku = useMemo(() => applyStatus(applySearch(mishakuRows, search), effStatus), [mishakuRows, search, effStatus])
  const filteredReferral = useMemo(() => applyStatus(applySearch(referralRows, search), effStatus), [referralRows, search, effStatus])
  const filteredLp = useMemo(() => applyStatus(applySearch(lpRows, search), effStatus), [lpRows, search, effStatus])

  const countByView: Record<View, number> = {
    consult: consultRows.length,
    mishaku: mishakuRows.length,
    manage: managerRows.length,
    referral: referralRows.length,
    lp: lpRows.length,
  }

  return (
    <div>
      {/* 案件一覧の表示切替タブ（相談 / 管理 / 個別管理 / LP） */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {VIEWS.map(v => {
          const m = VIEW_META[v]
          const active = view === v
          return (
            <button
              key={v}
              type="button"
              onClick={() => changeView(v)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${active ? 'text-brand-600 border-brand-600 font-semibold' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
            >
              <m.Icon className="w-4 h-4" strokeWidth={active ? 2.25 : 1.75} />
              {m.label}
              <span className={`ml-0.5 text-[11px] font-mono px-1.5 py-0.5 rounded ${active ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-400'}`}>{countByView[v]}</span>
            </button>
          )
        })}
      </div>

      {/* 検索。どのタブでも同じ位置に出す。
          絞り込みはこの行に同居させず、必ず下の独立した行に置く。
          同居させていたせいで、管理案件一覧（絞り込みが別行）とそれ以外とで
          タブから表までの間隔が食い違っていた。 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="ml-auto flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 w-[260px]">
          <Search className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="案件名・番号・担当者・チーム・受注内容で検索"
            className="bg-transparent border-none outline-none text-xs text-gray-700 w-full placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* ステータス絞り込み（管理案件一覧のサブタブと同じ位置・同じ間隔）。
          0件のタブでも「すべて 0」を出す。ここを出したり消したりすると、
          タブを切り替えるたびに表の位置が上下してしまう。 */}
      {view !== 'manage' && (
        <FilterTabs
          className="mb-3"
          active={effStatus}
          onChange={setStatusFilter}
          tabs={[
            { key: 'all', label: 'すべて', count: activeRows.length },
            ...statusOptions.map(key => ({
              key,
              label: getCaseStatusLabel(key),
              count: activeRows.filter(r => r.status === key).length,
            })),
          ]}
        />
      )}

      {view === 'manage' && (() => {
        // 作業進行中＝対応中／業務完了＝完了／納品完了＝納品完了。
        const businessCompleteRows = filteredCompleted.filter(r => r.status === '完了')
        const deliveredRows = filteredCompleted.filter(r => r.status === '納品完了')
        const subTabs = [
          { key: 'active' as const, label: '作業進行中', count: managerRows.length },
          { key: 'businessComplete' as const, label: '業務完了', count: completedRows.filter(r => r.status === '完了').length },
          { key: 'delivered' as const, label: '納品完了', count: completedRows.filter(r => r.status === '納品完了').length },
        ]
        return (
        <div>
          <FilterTabs
            className="mb-3"
            active={manageSub}
            onChange={k => setManageSub(k as typeof manageSub)}
            tabs={subTabs.map(t => ({ key: t.key, label: t.label, count: t.count }))}
          />
          {manageSub === 'active'
            ? <MyPageCasesTab memberId="" cases={filteredManager} selectable />
            : manageSub === 'businessComplete'
              ? <MyPageCasesTab memberId="" cases={businessCompleteRows} selectable showCompleted />
              : <MyPageCasesTab memberId="" cases={deliveredRows} selectable showCompleted />}
        </div>
        )
      })()}
      {view === 'consult' && <ConsultationCasesTable cases={filteredConsult} manageMode />}
      {view === 'mishaku' && <ConsultationCasesTable cases={filteredMishaku} manageMode />}
      {view === 'referral' && <ReferralCasesTable cases={filteredReferral} selectable />}
      {view === 'lp' && <LpCasesTable cases={filteredLp} allCases={lpRows} selectable />}
    </div>
  )
}
