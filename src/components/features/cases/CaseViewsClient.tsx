'use client'

import { useMemo, useState } from 'react'
import { ClipboardList, MessageSquare, Sparkles, Search } from 'lucide-react'
import MyPageCasesTab, { type MyCaseRow } from '@/components/features/my/MyPageCasesTab'
import ConsultationCasesTable, { type ConsultCase } from '@/components/features/my/ConsultationCasesTable'
import ReferralCasesTable, { type ReferralRow } from '@/components/features/my/ReferralCasesTable'
import { CASE_STATUSES, getCaseStatusLabel } from '@/lib/constants'

type View = 'manage' | 'consult' | 'referral'

type Props = {
  managerRows: MyCaseRow[]
  consultRows: ConsultCase[]
  referralRows: ReferralRow[]
}

// 検索（案件名・案件管理番号）の共通フィルタ
function applySearch<T extends { case_number: string; deal_name: string }>(rows: T[], q: string): T[] {
  const qq = q.trim().toLowerCase()
  if (!qq) return rows
  return rows.filter(r => r.deal_name.toLowerCase().includes(qq) || r.case_number.toLowerCase().includes(qq))
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
export default function CaseViewsClient({ managerRows, consultRows, referralRows }: Props) {
  const [view, setView] = useState<View>('manage')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const tabs: { key: View; label: string; Icon: typeof ClipboardList; count: number }[] = [
    { key: 'manage', label: '管理案件一覧', Icon: ClipboardList, count: managerRows.length },
    { key: 'consult', label: '相談案件一覧', Icon: MessageSquare, count: consultRows.length },
    { key: 'referral', label: '個別管理案件', Icon: Sparkles, count: referralRows.length },
  ]

  // 検索＋ステータスで絞り込み
  const filteredManager = useMemo(() => applyStatus(applySearch(managerRows, search), statusFilter), [managerRows, search, statusFilter])
  const filteredConsult = useMemo(() => applyStatus(applySearch(consultRows, search), statusFilter), [consultRows, search, statusFilter])
  const filteredReferral = useMemo(() => applyStatus(applySearch(referralRows, search), statusFilter), [referralRows, search, statusFilter])

  // 現在ビューに存在するステータスだけを絞り込み候補に出す（CASE_STATUSES の並び順を維持）
  const activeRows = view === 'manage' ? managerRows : view === 'consult' ? consultRows : referralRows
  const statusOptions = useMemo(() => {
    const present = new Set(activeRows.map(r => r.status))
    return CASE_STATUSES.filter(s => present.has(s.key)).map(s => s.key)
  }, [activeRows])

  const switchView = (v: View) => { setView(v); setStatusFilter('all') }

  return (
    <div>
      <div className="flex gap-1 mb-3 border-b border-gray-200 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => switchView(t.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${
              view === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'
            }`}
          >
            <t.Icon className="w-4 h-4" strokeWidth={view === t.key ? 2.25 : 1.75} />
            {t.label}
            <span className={`text-[12px] font-mono ml-0.5 ${view === t.key ? 'opacity-80' : 'opacity-50'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ステータス絞り込み ＋ 検索 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {statusOptions.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold text-gray-500 mr-0.5">ステータス</span>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${statusFilter === 'all' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
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
                  className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${statusFilter === key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {getCaseStatusLabel(key)}
                  <span className={`ml-1 text-[10px] font-mono ${statusFilter === key ? 'opacity-80' : 'opacity-50'}`}>{count}</span>
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
            placeholder="案件名・案件管理番号で検索"
            className="bg-transparent border-none outline-none text-xs text-gray-700 w-full placeholder:text-gray-400"
          />
        </div>
      </div>

      {view === 'manage' && <MyPageCasesTab memberId="" cases={filteredManager} />}
      {view === 'consult' && <ConsultationCasesTable cases={filteredConsult} />}
      {view === 'referral' && <ReferralCasesTable cases={filteredReferral} />}
    </div>
  )
}
