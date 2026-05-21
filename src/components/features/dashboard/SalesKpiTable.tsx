'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  achievementRate,
  formatMan,
  type SalesMetricsBundle,
  type SalesTargetRow,
} from '@/lib/dashboardMetrics'

type Props = {
  ym: string
  monthLabel: string
  metrics: SalesMetricsBundle
  initialTarget: SalesTargetRow
}

type EditField =
  | 'meetings_count'
  | 'new_orders_count'
  | 'conversion_rate'
  | 'avg_order_unit'
  | 'tax_filing_count'
  | 'property_appraisal_count'

type KpiCol = {
  key: EditField
  label: string
  unit: string
  formatActual: (m: SalesMetricsBundle) => string
  formatTarget: (t: SalesTargetRow) => string
  toInput: (t: SalesTargetRow) => string
  fromInput: (s: string) => number
  rate: (m: SalesMetricsBundle, t: SalesTargetRow) => number | null
  inputStep: string
}

const COLS: KpiCol[] = [
  {
    key: 'meetings_count',
    label: '当月面談数',
    unit: '件/月',
    formatActual: m => String(m.meetingsCount),
    formatTarget: t => String(t.meetings_count),
    toInput: t => String(t.meetings_count),
    fromInput: s => Math.max(0, Math.floor(Number(s) || 0)),
    rate: (m, t) => achievementRate(m.meetingsCount, t.meetings_count),
    inputStep: '1',
  },
  {
    key: 'new_orders_count',
    label: '当月新規受注件数',
    unit: '件/月',
    formatActual: m => String(m.newOrdersCount),
    formatTarget: t => String(t.new_orders_count),
    toInput: t => String(t.new_orders_count),
    fromInput: s => Math.max(0, Math.floor(Number(s) || 0)),
    rate: (m, t) => achievementRate(m.newOrdersCount, t.new_orders_count),
    inputStep: '1',
  },
  {
    key: 'conversion_rate',
    label: '受注率',
    unit: '%',
    formatActual: m => (m.conversionRate === null ? '-' : `${Math.round(m.conversionRate * 100)}`),
    formatTarget: t => `${t.conversion_rate}`,
    toInput: t => String(t.conversion_rate),
    fromInput: s => Math.max(0, Math.min(100, Number(s) || 0)),
    // 受注率は 0..1 と 0..100 の混在に注意:
    // metrics.conversionRate は 0..1、target.conversion_rate は 0..100 で保存
    rate: (m, t) => {
      if (!t.conversion_rate || t.conversion_rate <= 0) return null
      if (m.conversionRate === null) return null
      return (m.conversionRate * 100) / t.conversion_rate
    },
    inputStep: '0.1',
  },
  {
    key: 'avg_order_unit',
    label: '平均受注単価',
    unit: '万円/件',
    formatActual: m => (m.avgOrderUnit === null ? '-' : formatMan(m.avgOrderUnit)),
    formatTarget: t => formatMan(t.avg_order_unit),
    toInput: t => String(Math.round(t.avg_order_unit / 10_000)),       // 円→万円
    fromInput: s => Math.max(0, Math.floor(Number(s) || 0) * 10_000),  // 万円→円
    rate: (m, t) => {
      if (!t.avg_order_unit || t.avg_order_unit <= 0) return null
      if (m.avgOrderUnit === null) return null
      return m.avgOrderUnit / t.avg_order_unit
    },
    inputStep: '1',
  },
  {
    key: 'tax_filing_count',
    label: '相続税申告件数',
    unit: '件/月',
    formatActual: m => String(m.taxFilingCount),
    formatTarget: t => String(t.tax_filing_count),
    toInput: t => String(t.tax_filing_count),
    fromInput: s => Math.max(0, Math.floor(Number(s) || 0)),
    rate: (m, t) => achievementRate(m.taxFilingCount, t.tax_filing_count),
    inputStep: '1',
  },
  {
    key: 'property_appraisal_count',
    label: '不動産査定件数',
    unit: '件/月',
    formatActual: m => String(m.propertyAppraisalCount),
    formatTarget: t => String(t.property_appraisal_count),
    toInput: t => String(t.property_appraisal_count),
    fromInput: s => Math.max(0, Math.floor(Number(s) || 0)),
    rate: (m, t) => achievementRate(m.propertyAppraisalCount, t.property_appraisal_count),
    inputStep: '1',
  },
]

function clampPct(r: number): number {
  return Math.max(0, Math.min(100, Math.round(r * 100)))
}

function rateColor(rate: number | null): string {
  if (rate === null) return 'text-gray-400'
  if (rate >= 1) return 'text-emerald-600'
  if (rate >= 0.8) return 'text-amber-600'
  return 'text-red-500'
}

export default function SalesKpiTable({ ym, monthLabel, metrics, initialTarget }: Props) {
  const [target, setTarget] = useState<SalesTargetRow>(initialTarget)
  const [editing, setEditing] = useState<EditField | null>(null)
  const [draft, setDraft] = useState('')
  const [, startTransition] = useTransition()
  const [error, setError] = useState('')

  const startEdit = (col: KpiCol) => {
    setEditing(col.key)
    setDraft(col.toInput(target))
    setError('')
  }

  const commitEdit = async (col: KpiCol) => {
    const newValue = col.fromInput(draft)
    const prev = target[col.key]
    if (newValue === prev) {
      setEditing(null)
      return
    }
    const next: SalesTargetRow = { ...target, [col.key]: newValue }
    setTarget(next)
    setEditing(null)

    startTransition(async () => {
      const supabase = createClient()
      const { error: dbError } = await supabase
        .from('sales_targets')
        .upsert(
          {
            ym,
            meetings_count: next.meetings_count,
            new_orders_count: next.new_orders_count,
            conversion_rate: next.conversion_rate,
            avg_order_unit: next.avg_order_unit,
            tax_filing_count: next.tax_filing_count,
            property_appraisal_count: next.property_appraisal_count,
          },
          { onConflict: 'ym' },
        )
      if (dbError) {
        setError(`目標値の保存に失敗しました: ${dbError.message}`)
        setTarget(t => ({ ...t, [col.key]: prev }))
      }
    })
  }

  const cancelEdit = () => {
    setEditing(null)
    setError('')
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">受注担当 {monthLabel}</h2>
          <span className="text-[12px] text-gray-500 px-2 py-0.5 bg-gray-100 rounded">当月の受注担当の数値</span>
        </div>
      </div>

      {error && (
        <div className="mb-2 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th className="w-16 border border-gray-200 bg-gray-50 px-2 py-2 text-[12px] font-semibold text-gray-500" />
              {COLS.map(col => (
                <th
                  key={col.key}
                  className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-[13px] font-semibold text-gray-700"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 目標 */}
            <tr>
              <td className="border border-gray-200 bg-gray-50 px-2 py-2 text-center text-[12px] font-semibold text-gray-600">目標</td>
              {COLS.map(col => {
                const isEditing = editing === col.key
                return (
                  <td
                    key={col.key}
                    className="border border-gray-200 px-3 py-2 text-center bg-white hover:bg-brand-50/40 transition-colors cursor-pointer group"
                    onClick={() => !isEditing && startEdit(col)}
                  >
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-1">
                        <input
                          autoFocus
                          type="number"
                          step={col.inputStep}
                          min={0}
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          onBlur={() => commitEdit(col)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEdit(col)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          className="w-24 px-2 py-1 text-right border border-brand-400 rounded text-sm font-mono outline-none focus:ring-2 focus:ring-brand-300"
                        />
                        <span className="text-[11px] text-gray-500">{col.unit}</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="font-mono font-semibold text-[18px] text-gray-900 group-hover:text-brand-700">
                          {col.formatTarget(target)}
                        </span>
                        <span className="text-[11px] text-gray-500">{col.unit}</span>
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>

            {/* 実績 */}
            <tr>
              <td className="border border-gray-200 bg-gray-50 px-2 py-2 text-center text-[12px] font-semibold text-gray-600">実績</td>
              {COLS.map(col => (
                <td key={col.key} className="border border-gray-200 px-3 py-2 text-center bg-white">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="font-mono font-bold text-[20px] text-brand-700">
                      {col.formatActual(metrics)}
                    </span>
                    <span className="text-[11px] text-gray-500">{col.unit}</span>
                  </div>
                </td>
              ))}
            </tr>

            {/* 達成率 */}
            <tr>
              <td className="border border-gray-200 bg-gray-50 px-2 py-2 text-center text-[12px] font-semibold text-gray-600">達成率</td>
              {COLS.map(col => {
                const r = col.rate(metrics, target)
                const pct = r === null ? null : clampPct(r)
                return (
                  <td key={col.key} className="border border-gray-200 px-3 py-2 bg-white">
                    {pct === null ? (
                      <div className="text-center text-[12px] text-gray-400">目標未設定</div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold text-[16px] ${rateColor(r)} w-12 text-right`}>{pct}%</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                          <div
                            className={`h-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-amber-500' : 'bg-red-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-gray-400">※「目標」行のセルをクリックすると編集できます（自動保存）</p>
    </section>
  )
}
