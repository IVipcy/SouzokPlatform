'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  achievementRate,
  cycleAchievementRate,
  formatMan,
  type DeptTargetRow,
  type MetricsBundle,
} from '@/lib/dashboardMetrics'

type Props = {
  ym: string
  metrics: MetricsBundle
  initialTarget: DeptTargetRow
}

type EditField = 'new_orders' | 'managing' | 'completed' | 'cycle_months' | 'completed_amount'

type KpiCol = {
  key: EditField
  label: string
  unit: string
  // 表示用フォーマッタ
  formatActual: (m: MetricsBundle) => string
  formatTarget: (t: DeptTargetRow) => string
  // 編集モード時の input 値（数値、円は万円単位で扱う）
  toInput: (t: DeptTargetRow) => string
  // input 値 → DB 保存用の値
  fromInput: (s: string) => number
  // 達成率（null = 未設定）
  rate: (m: MetricsBundle, t: DeptTargetRow) => number | null
  // 数値型ヒント
  inputStep: string
}

const COLS: KpiCol[] = [
  {
    key: 'new_orders',
    label: '新規受注案件',
    unit: '件/月',
    formatActual: m => String(m.newOrders),
    formatTarget: t => String(t.new_orders),
    toInput: t => String(t.new_orders),
    fromInput: s => Math.max(0, Math.floor(Number(s) || 0)),
    rate: (m, t) => achievementRate(m.newOrders, t.new_orders),
    inputStep: '1',
  },
  {
    key: 'managing',
    label: '管理案件',
    unit: '件/月',
    formatActual: m => String(m.managing),
    formatTarget: t => String(t.managing),
    toInput: t => String(t.managing),
    fromInput: s => Math.max(0, Math.floor(Number(s) || 0)),
    rate: (m, t) => achievementRate(m.managing, t.managing),
    inputStep: '1',
  },
  {
    key: 'completed',
    label: '完了案件',
    unit: '件/月',
    formatActual: m => String(m.completed),
    formatTarget: t => String(t.completed),
    toInput: t => String(t.completed),
    fromInput: s => Math.max(0, Math.floor(Number(s) || 0)),
    rate: (m, t) => achievementRate(m.completed, t.completed),
    inputStep: '1',
  },
  {
    key: 'cycle_months',
    label: 'サイクル',
    unit: 'カ月',
    formatActual: m => (m.cycleMonths === null ? '-' : m.cycleMonths.toFixed(1)),
    formatTarget: t => t.cycle_months.toFixed(1),
    toInput: t => t.cycle_months.toString(),
    fromInput: s => Math.max(0, Number(s) || 0),
    rate: (m, t) => cycleAchievementRate(m.cycleMonths, t.cycle_months),
    inputStep: '0.1',
  },
  {
    key: 'completed_amount',
    label: '業務完了金額',
    unit: '万円/月',
    formatActual: m => formatMan(m.completedAmount),
    formatTarget: t => formatMan(t.completed_amount),
    // 円 → 万円
    toInput: t => String(Math.round(t.completed_amount / 10_000)),
    // 万円入力 → 円
    fromInput: s => Math.max(0, Math.floor(Number(s) || 0) * 10_000),
    rate: (m, t) => achievementRate(m.completedAmount, t.completed_amount),
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

export default function SummaryKpiTable({ ym, metrics, initialTarget }: Props) {
  const [target, setTarget] = useState<DeptTargetRow>(initialTarget)
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
    const next: DeptTargetRow = { ...target, [col.key]: newValue }
    setTarget(next)
    setEditing(null)

    startTransition(async () => {
      const supabase = createClient()
      const { error: dbError } = await supabase
        .from('dept_targets')
        .upsert(
          {
            ym,
            new_orders: next.new_orders,
            managing: next.managing,
            completed: next.completed,
            cycle_months: next.cycle_months,
            completed_amount: next.completed_amount,
          },
          { onConflict: 'ym' },
        )
      if (dbError) {
        setError(`目標値の保存に失敗しました: ${dbError.message}`)
        // 失敗時はロールバック
        setTarget(t => ({ ...t, [col.key]: prev }))
      }
    })
  }

  const cancelEdit = () => {
    setEditing(null)
    setError('')
  }

  return (
    <div>
      {error && (
        <div className="mb-2 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 720 }}>
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
    </div>
  )
}
