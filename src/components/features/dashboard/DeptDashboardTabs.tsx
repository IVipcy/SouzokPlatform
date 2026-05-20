'use client'

import { useState } from 'react'
import SummaryKpiTable from './SummaryKpiTable'
import CompletionBreakdown from './CompletionBreakdown'
import type { DeptTargetRow, MetricsBundle, ProcedureBreakdown } from '@/lib/dashboardMetrics'

type Props = {
  ym: string
  monthLabel: string
  metrics: MetricsBundle
  initialTarget: DeptTargetRow
  breakdown: ProcedureBreakdown
}

type Tab = 'summary' | 'breakdown'

const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'サマリ' },
  { key: 'breakdown', label: '内訳別' },
]

export default function DeptDashboardTabs({ ym, monthLabel, metrics, initialTarget, breakdown }: Props) {
  const [tab, setTab] = useState<Tab>('summary')

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">相続事業部 {monthLabel}</h2>
          <span className="text-[12px] text-gray-500 px-2 py-0.5 bg-gray-100 rounded">当月の部全体の数値</span>
        </div>

        {/* タブ */}
        <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={[
                  'px-4 py-1.5 text-[13px] font-semibold rounded-md transition-all',
                  active
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'summary' && (
        <SummaryKpiTable ym={ym} metrics={metrics} initialTarget={initialTarget} />
      )}
      {tab === 'breakdown' && (
        <CompletionBreakdown breakdown={breakdown} />
      )}
    </section>
  )
}
