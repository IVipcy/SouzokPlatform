'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  achievementRate,
  formatMan,
  type DeptTargetRow,
  type MetricsBundle,
} from '@/lib/dashboardMetrics'
import { parseIntInput, parseFloatInput } from '@/lib/inputHelpers'

type Props = {
  ym: string
  metrics: MetricsBundle
  initialTarget: DeptTargetRow
}

type EditField = 'new_orders' | 'managing' | 'completed' | 'cycle_months' | 'completed_amount'

// 達成行の表示種別:
//   'rate'             … 達成率 % + プログレスバー（高いほど良い指標用）
//   'diff-lower-better' … 目標との差分（短いほど良い指標用、サイクル等）
type AchievementKind = 'rate' | 'diff-lower-better'

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
  // 達成行の種別
  achievementKind: AchievementKind
  // rate 用: 達成率（null = 未設定/評価不能）
  rate?: (m: MetricsBundle, t: DeptTargetRow) => number | null
  // diff-lower-better 用: actual - target を返す（null = 未設定/評価不能）
  diff?: (m: MetricsBundle, t: DeptTargetRow) => number | null
}

const COLS: KpiCol[] = [
  {
    key: 'new_orders',
    label: '新規受注案件',
    unit: '件/月',
    formatActual: m => String(m.newOrders),
    formatTarget: t => String(t.new_orders),
    toInput: t => String(t.new_orders),
    fromInput: s => Math.max(0, parseIntInput(s)),
    achievementKind: 'rate',
    rate: (m, t) => achievementRate(m.newOrders, t.new_orders),
  },
  {
    key: 'managing',
    label: '管理案件',
    unit: '件/月',
    formatActual: m => String(m.managing),
    formatTarget: t => String(t.managing),
    toInput: t => String(t.managing),
    fromInput: s => Math.max(0, parseIntInput(s)),
    achievementKind: 'rate',
    rate: (m, t) => achievementRate(m.managing, t.managing),
  },
  {
    key: 'completed',
    label: '完了案件',
    unit: '件/月',
    formatActual: m => String(m.completed),
    formatTarget: t => String(t.completed),
    toInput: t => String(t.completed),
    fromInput: s => Math.max(0, parseIntInput(s)),
    achievementKind: 'rate',
    rate: (m, t) => achievementRate(m.completed, t.completed),
  },
  {
    key: 'cycle_months',
    label: 'サイクル',
    unit: 'カ月',
    formatActual: m => (m.cycleMonths === null ? '-' : m.cycleMonths.toFixed(1)),
    formatTarget: t => t.cycle_months.toFixed(1),
    toInput: t => t.cycle_months.toString(),
    fromInput: s => Math.max(0, parseFloatInput(s)),
    achievementKind: 'diff-lower-better',
    // サイクルは短いほど良い → 実績 - 目標。負（早い）が好ましい。
    diff: (m, t) => {
      if (!t.cycle_months || t.cycle_months <= 0) return null
      if (m.cycleMonths === null) return null
      return m.cycleMonths - t.cycle_months
    },
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
    fromInput: s => Math.max(0, parseIntInput(s) * 10_000),
    achievementKind: 'rate',
    rate: (m, t) => achievementRate(m.completedAmount, t.completed_amount),
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
                          type="text"
                          inputMode="decimal"
                          value={draft}
                          onFocus={e => e.target.select()}
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

            {/* 達成率 / 差分 */}
            <tr>
              <td className="border border-gray-200 bg-gray-50 px-2 py-2 text-center text-[12px] font-semibold text-gray-600">達成率</td>
              {COLS.map(col => {
                // サイクル等は差分表示
                if (col.achievementKind === 'diff-lower-better' && col.diff) {
                  const d = col.diff(metrics, target)
                  if (d === null) {
                    return (
                      <td key={col.key} className="border border-gray-200 px-3 py-2 bg-white">
                        <div className="text-center text-[12px] text-gray-400">目標未設定</div>
                      </td>
                    )
                  }
                  // d <= 0 = 早い（良い）, d > 0 = 遅い（悪い）
                  const isGood = d <= 0
                  const sign = d > 0 ? '+' : ''
                  return (
                    <td key={col.key} className="border border-gray-200 px-3 py-2 bg-white">
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-baseline gap-1">
                          <span className={`font-mono font-bold text-[16px] ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
                            {sign}{d.toFixed(1)}
                          </span>
                          <span className="text-[11px] text-gray-500">{col.unit}</span>
                        </div>
                        <span className={`text-[10px] ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
                          {isGood ? '目標より早い' : '目標を超過'}
                        </span>
                      </div>
                    </td>
                  )
                }

                // 通常の達成率
                const r = col.rate ? col.rate(metrics, target) : null
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
