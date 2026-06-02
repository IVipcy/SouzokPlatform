'use client'

import { useMemo, useState } from 'react'
import { ClipboardList, MessageSquare, Sparkles, Search } from 'lucide-react'
import MyPageCasesTab, { type MyCaseRow } from '@/components/features/my/MyPageCasesTab'
import ConsultationCasesTable, { type ConsultCase } from '@/components/features/my/ConsultationCasesTable'
import ReferralCasesTable, { type ReferralRow } from '@/components/features/my/ReferralCasesTable'

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

/**
 * 案件管理(/cases)の表示切替。
 * マイページ定義の3一覧（管理案件一覧 / 相談案件一覧 / 個別管理案件）を流用し、
 * 検索（案件名・案件管理番号）を共通で提供する。
 */
export default function CaseViewsClient({ managerRows, consultRows, referralRows }: Props) {
  const [view, setView] = useState<View>('manage')
  const [search, setSearch] = useState('')

  const tabs: { key: View; label: string; Icon: typeof ClipboardList; count: number }[] = [
    { key: 'manage', label: '管理案件一覧', Icon: ClipboardList, count: managerRows.length },
    { key: 'consult', label: '相談案件一覧', Icon: MessageSquare, count: consultRows.length },
    { key: 'referral', label: '個別管理案件', Icon: Sparkles, count: referralRows.length },
  ]

  const filteredManager = useMemo(() => applySearch(managerRows, search), [managerRows, search])
  const filteredConsult = useMemo(() => applySearch(consultRows, search), [consultRows, search])
  const filteredReferral = useMemo(() => applySearch(referralRows, search), [referralRows, search])

  return (
    <div>
      <div className="flex gap-1 mb-3 border-b border-gray-200 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
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

      {/* 検索 */}
      <div className="flex items-center mb-3">
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
