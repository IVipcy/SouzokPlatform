'use client'

import { getPhaseDefinition } from '@/lib/phases'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import type { TaskRow, RealEstatePropertyRow } from '@/types'

type Props = {
  tasks: TaskRow[]
  properties: RealEstatePropertyRow[]
}

// タスクの「現在の様子」を 4 区分に正規化する。
//   - done       … 完了
//   - active     … 対応中 / Wチェック待ち / 差戻し（=「いま手がついている／止まっている」）
//   - overdue    … 未着手だが due_date が過ぎている
//   - pending    … 未着手かつ期限内
type TaskVisualState = 'done' | 'active' | 'overdue' | 'pending'

function classifyTask(t: TaskRow, todayYmd: string): TaskVisualState {
  if (t.status === '完了') return 'done'
  if (t.status === '対応中' || t.status === 'Wチェック待ち' || t.status === '差戻し') return 'active'
  // 未着手
  if (t.due_date && t.due_date < todayYmd) return 'overdue'
  return 'pending'
}

// 線の色: 左タスクが done のときだけシアン、それ以外はグレー破線
function connectorClass(leftState: TaskVisualState): string {
  return leftState === 'done'
    ? 'bg-cyan-400'
    : 'bg-gray-200'
}

// ノードのスタイル
function nodeStyle(state: TaskVisualState): { cls: string; bg: string; border: string } {
  switch (state) {
    case 'done':
      return { cls: 'bg-cyan-500 border-cyan-500', bg: '#06b6d4', border: '#06b6d4' }
    case 'active':
      return { cls: 'bg-red-500 border-red-500 ring-2 ring-red-200', bg: '#ef4444', border: '#ef4444' }
    case 'overdue':
      return { cls: 'bg-white border-red-500 ring-2 ring-red-100', bg: '#ffffff', border: '#ef4444' }
    case 'pending':
    default:
      return { cls: 'bg-white border-gray-300', bg: '#ffffff', border: '#d1d5db' }
  }
}

const PHASE_ORDER = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6']

export default function CaseProgressPanel({ tasks, properties }: Props) {
  const todayYmd = todayJstYmd(new Date())

  // Phase別にグルーピング、未対応の Phase はスキップ
  const tasksByPhase = new Map<string, TaskRow[]>()
  for (const t of tasks) {
    const key = t.phase || 'phase1'
    if (!tasksByPhase.has(key)) tasksByPhase.set(key, [])
    tasksByPhase.get(key)!.push(t)
  }
  // 並び順: PHASE_ORDER の順、各 Phase 内は sort_order 昇順
  const orderedPhases = PHASE_ORDER
    .filter(p => tasksByPhase.has(p) && (tasksByPhase.get(p)!.length > 0))
    .map(p => ({
      key: p,
      def: getPhaseDefinition(p),
      tasks: [...tasksByPhase.get(p)!].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }))

  // 表示対象の物件: appraisal_status が '不要' 以外（null も含めて表示）
  const visibleProperties = properties.filter(p => p.appraisal_status !== '不要')

  if (orderedPhases.length === 0 && visibleProperties.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-[13px] text-gray-500">タスクや不動産が登録されていません。タスク一括生成や財産タブから登録してください。</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
        <h3 className="text-[15px] font-semibold text-gray-900">Phase別タスク進捗</h3>
        <span className="text-[12px] text-gray-500 ml-auto flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-500" />完了
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />対応中
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-white border-2 border-red-500" />期限超過
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-white border border-gray-300" />未着手
          </span>
        </span>
      </div>

      {/* Phase 行（タスクあるもののみ） */}
      <div className="space-y-4">
        {orderedPhases.map(p => (
          <PhaseRow key={p.key} phaseLabel={p.def?.label ?? p.key} tasks={p.tasks} todayYmd={todayYmd} />
        ))}
      </div>

      {/* 不動産査定 */}
      {visibleProperties.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
            <h3 className="text-[15px] font-semibold text-gray-900">不動産査定</h3>
          </div>
          <div className="space-y-3">
            {visibleProperties.map((p, i) => (
              <PropertyAppraisalRow key={p.id} property={p} index={i + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ───── Phase 行 ─────
function PhaseRow({ phaseLabel, tasks, todayYmd }: { phaseLabel: string; tasks: TaskRow[]; todayYmd: string }) {
  // Phase 全体の進捗
  const total = tasks.length
  const done = tasks.filter(t => t.status === '完了').length
  const hasActive = tasks.some(t =>
    t.status === '対応中' || t.status === 'Wチェック待ち' || t.status === '差戻し',
  )
  const hasOverdue = tasks.some(t => t.status !== '完了' && t.due_date && t.due_date < todayYmd)
  const phaseBadge = (() => {
    if (done === total) return { label: '完了', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200' }
    if (hasOverdue) return { label: '遅延あり', cls: 'bg-red-50 text-red-700 border-red-200' }
    if (hasActive || done > 0) return { label: '進行中', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    return { label: '未着手', cls: 'bg-gray-50 text-gray-500 border-gray-200' }
  })()

  return (
    <div className="flex gap-3 items-start">
      {/* Phase 名 */}
      <div className="w-36 flex-shrink-0 pt-1">
        <div className="text-[13px] font-bold text-gray-800 leading-tight">{phaseLabel}</div>
        <span className={`inline-flex items-center mt-1.5 text-[11px] font-mono px-2 py-0.5 rounded border ${phaseBadge.cls}`}>
          {phaseBadge.label} {done}/{total}
        </span>
      </div>

      {/* タスク列 */}
      <div className="flex-1 overflow-x-auto pb-1">
        <div className="inline-flex items-start gap-0 min-w-full">
          {tasks.map((t, idx) => {
            const state = classifyTask(t, todayYmd)
            const isLast = idx === tasks.length - 1
            return (
              <div key={t.id} className="flex items-start" style={{ minWidth: 130 }}>
                <div className="flex flex-col items-center" style={{ width: 130 }}>
                  {/* ノードと線を同じ行に並べる */}
                  <div className="flex items-center w-full">
                    <span
                      className={`flex-shrink-0 w-4 h-4 rounded-full border-2 ${nodeStyle(state).cls}`}
                      title={`${t.title}\nステータス: ${t.status}${t.due_date ? `\n期限: ${t.due_date}` : ''}`}
                    />
                    {!isLast && (
                      <span className={`flex-1 h-[2px] ${connectorClass(state)}`} />
                    )}
                  </div>
                  {/* タスク名（下） */}
                  <div
                    className={`mt-2 text-[12px] text-center leading-snug w-full px-1.5 ${
                      state === 'overdue' || state === 'active' ? 'text-red-600 font-semibold' : 'text-gray-700'
                    }`}
                    style={{ wordBreak: 'break-word' }}
                  >
                    {t.title}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ───── 不動産査定 行 ─────
function PropertyAppraisalRow({ property, index }: { property: RealEstatePropertyRow; index: number }) {
  const status = property.appraisal_status ?? '未対応'
  const steps: Array<{ key: '未対応' | '対応中' | '完了'; label: string }> = [
    { key: '未対応', label: '未対応' },
    { key: '対応中', label: '対応中' },
    { key: '完了',   label: '完了' },
  ]
  // 現在ステップのインデックス
  const currentIdx = steps.findIndex(s => s.key === status)
  const safeIdx = currentIdx === -1 ? 0 : currentIdx

  const propertyLabel = property.address
    ? `物件${index}：${property.address}${property.lot_number ? ` ${property.lot_number}` : ''}`
    : `物件${index}`

  return (
    <div className="flex gap-3 items-center">
      {/* 物件ラベル */}
      <div className="w-48 flex-shrink-0 text-[13px] text-gray-800 truncate" title={propertyLabel}>
        {propertyLabel}
      </div>

      {/* 3 ステップバー（シアン統一）*/}
      <div className="flex-1 max-w-md flex items-center">
        {steps.map((step, idx) => {
          const isReached = idx <= safeIdx
          const isLast = idx === steps.length - 1
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center" style={{ minWidth: 80 }}>
                <span
                  className={`w-4 h-4 rounded-full border-2 ${
                    isReached
                      ? 'bg-cyan-500 border-cyan-500'
                      : 'bg-white border-gray-300'
                  }`}
                />
                <span
                  className={`mt-1.5 text-[12px] ${
                    isReached ? 'text-cyan-700 font-semibold' : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <span
                  className={`flex-1 h-[2px] ${
                    idx < safeIdx ? 'bg-cyan-400' : 'bg-gray-200'
                  }`}
                  style={{ marginBottom: 22 }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
