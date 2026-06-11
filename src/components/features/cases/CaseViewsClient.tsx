'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ClipboardList, MessageSquare, Sparkles, Megaphone, Search, type LucideIcon } from 'lucide-react'
import MyPageCasesTab, { type MyCaseRow } from '@/components/features/my/MyPageCasesTab'
import ConsultationCasesTable, { type ConsultCase } from '@/components/features/my/ConsultationCasesTable'
import ReferralCasesTable, { type ReferralRow } from '@/components/features/my/ReferralCasesTable'
import LpCasesTable, { type LpCaseRow } from '@/components/features/cases/LpCasesTable'
import { CASE_STATUSES, getCaseStatusLabel } from '@/lib/constants'

type View = 'manage' | 'consult' | 'referral' | 'lp'

// サイドバーのサブメニュー（/cases?view=xxx）と対応
const VIEWS: View[] = ['consult', 'manage', 'referral', 'lp']
const VIEW_META: Record<View, { label: string; Icon: LucideIcon }> = {
  consult: { label: '相談案件一覧', Icon: MessageSquare },
  manage: { label: '管理案件一覧', Icon: ClipboardList },
  referral: { label: '個別管理案件', Icon: Sparkles },
  lp: { label: 'LP案件一覧', Icon: Megaphone },
}

type Props = {
  managerRows: MyCaseRow[]
  completedRows: MyCaseRow[]
  consultRows: ConsultCase[]
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
  team_name?: string | null
  procedure_type?: string[] | null
}
function applySearch<T extends SearchableRow>(rows: T[], q: string): T[] {
  const qq = q.trim().toLowerCase()
  if (!qq) return rows
  return rows.filter(r => {
    const hay = [r.case_number, r.lp_case_number, r.deal_name, r.sales_name, r.manager_name, r.team_name, ...(r.procedure_type ?? [])]
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
export default function CaseViewsClient({ managerRows, completedRows, consultRows, referralRows, lpRows }: Props) {
  const searchParams = useSearchParams()
  const viewParam = searchParams.get('view') as View | null
  const view: View = viewParam && VIEWS.includes(viewParam) ? viewParam : 'consult'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  // 管理案件ビュー内のサブ切替（対応中 / 完了）
  const [manageSub, setManageSub] = useState<'active' | 'completed'>('active')

  // 現在ビューに存在するステータスだけを絞り込み候補に出す（CASE_STATUSES の並び順を維持）
  const activeRows = view === 'manage' ? managerRows : view === 'consult' ? consultRows : view === 'referral' ? referralRows : lpRows
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
  const filteredReferral = useMemo(() => applyStatus(applySearch(referralRows, search), effStatus), [referralRows, search, effStatus])
  const filteredLp = useMemo(() => applyStatus(applySearch(lpRows, search), effStatus), [lpRows, search, effStatus])

  const meta = VIEW_META[view]
  const viewCount = activeRows.length

  return (
    <div>
      {/* 現在のサブメニュー名（サイドバーの「案件一覧 → ○○」と対応） */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
        <meta.Icon className="w-5 h-5 text-brand-600" strokeWidth={2.25} />
        <h2 className="text-[15px] font-bold text-gray-900">{meta.label}</h2>
        <span className="text-[12px] font-mono text-gray-400">{viewCount}</span>
      </div>

      {/* ステータス絞り込み ＋ 検索（管理案件一覧はステータス絞り込み非表示） */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {view !== 'manage' && statusOptions.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold text-gray-500 mr-0.5">ステータス</span>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${effStatus === 'all' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              すべて
            </button>
            {statusOptions.map(key => {
              const count = activeRows.filter(r => r.status === key).length
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${effStatus === key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {getCaseStatusLabel(key)}
                  <span className={`ml-1 text-[10px] font-mono ${effStatus === key ? 'opacity-80' : 'opacity-50'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        )}
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

      {view === 'manage' && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => setManageSub('active')}
              className={`px-3 py-1.5 rounded-md text-[12px] font-semibold border transition-colors ${manageSub === 'active' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              対応中<span className="ml-1 text-[10px] font-mono opacity-70">{managerRows.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setManageSub('completed')}
              className={`px-3 py-1.5 rounded-md text-[12px] font-semibold border transition-colors ${manageSub === 'completed' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              完了<span className="ml-1 text-[10px] font-mono opacity-70">{completedRows.length}</span>
            </button>
          </div>
          {manageSub === 'active'
            ? <MyPageCasesTab memberId="" cases={filteredManager} selectable />
            : <MyPageCasesTab memberId="" cases={filteredCompleted} selectable showCompleted />}
        </div>
      )}
      {view === 'consult' && <ConsultationCasesTable cases={filteredConsult} manageMode />}
      {view === 'referral' && <ReferralCasesTable cases={filteredReferral} />}
      {view === 'lp' && <LpCasesTable cases={filteredLp} />}
    </div>
  )
}
