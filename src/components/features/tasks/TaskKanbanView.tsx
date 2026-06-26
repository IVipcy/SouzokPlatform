'use client'

// 事務管理タスクのカンバンビュー。Readiness（Ready/対応中/Waiting/完了）で4列。
// 各カードに案件コンテキスト（番号・案件名）と「着手条件 / 待ち事由」を表示。
// 1日替わりの事務管理担当が「次やる」を即決できる構造。

import Link from 'next/link'
import { Play, CheckCircle2, Loader2 } from 'lucide-react'
import type { TaskRow } from '@/types'
import { classifyTask, READINESS_META, type Readiness, type ReadinessReceipt } from '@/lib/taskReadiness'

export type KanbanCaseInfo = {
  case_number: string
  deal_name: string
}

type Props = {
  tasks: TaskRow[]
  caseMap?: Record<string, KanbanCaseInfo>
  /** 受信簿。Readiness判定に使う */
  receipts?: ReadinessReceipt[]
  today: string
  onAdvance: (task: TaskRow) => void
  loadingTaskId: string | null
  /** 案件詳細から呼ばれる場合（caseMapなしで動かす）。案件名/番号は出さない */
  hideCase?: boolean
}

const COLUMNS: Readiness[] = ['ready', 'doing', 'waiting', 'done']

export default function TaskKanbanView({ tasks, caseMap = {}, receipts = [], today, onAdvance, loadingTaskId, hideCase }: Props) {
  const grouped: Record<Readiness, { task: TaskRow; waitingFor?: string }[]> = {
    ready: [], doing: [], waiting: [], done: [],
  }
  for (const t of tasks) {
    const { readiness, waitingFor } = classifyTask(t, receipts)
    grouped[readiness].push({ task: t, waitingFor })
  }

  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
        {COLUMNS.map(col => {
          const items = grouped[col]
          const meta = READINESS_META[col]
          return (
            <div key={col} className="w-[280px] flex-shrink-0">
              <div className={`rounded-lg px-3 py-2 mb-2 flex items-center gap-2 ${meta.bg}`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                <span className={`text-[12px] font-semibold flex-1 ${meta.text}`}>{meta.label}</span>
                <span className="text-[11px] font-mono text-gray-500 bg-white border border-gray-200 rounded px-1.5">{items.length}</span>
              </div>
              <div className="flex flex-col gap-1.5" style={{ minHeight: 60 }}>
                {items.length === 0 ? (
                  <div className="text-center text-[12px] text-gray-300 py-4 border border-dashed border-gray-200 rounded-lg">なし</div>
                ) : items.map(({ task, waitingFor }) => {
                  const caseInfo = caseMap[task.case_id]
                  const isOverdue = !!(task.due_date && task.due_date < today && col !== 'done')
                  return (
                    <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-2.5 hover:border-brand-200 transition-colors">
                      {/* 業務チップ＋タスク名 */}
                      <div className="flex items-start gap-1.5 mb-1">
                        {task.phase && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-100 flex-shrink-0">
                            {task.phase.replace(/^Phase\d+[:：]\s*/, '')}
                          </span>
                        )}
                      </div>
                      <Link href={`/tasks/${task.id}`} className={`block text-[13px] font-semibold leading-tight hover:text-brand-600 ${col === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {task.title}
                      </Link>

                      {/* 案件コンテキスト */}
                      {!hideCase && caseInfo && (
                        <div className="mt-1.5">
                          <Link href={`/cases/${task.case_id}`} className="block text-[11px] text-gray-500 hover:text-brand-600 hover:underline truncate">
                            <span className="font-mono">{caseInfo.case_number}</span> ・ {caseInfo.deal_name}
                          </Link>
                        </div>
                      )}

                      {/* 着手条件／待ち事由 */}
                      {waitingFor && (
                        <div className={`mt-1.5 text-[11px] px-2 py-1 rounded ${col === 'waiting' ? 'bg-gray-50 text-gray-600' : 'bg-amber-50 text-amber-700'}`}>
                          {col === 'waiting' ? '⏳' : '📥'} {waitingFor}
                        </div>
                      )}

                      {/* 期限＋着手 */}
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className={`text-[11px] font-mono ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                          {task.due_date ?? '期限なし'}
                          {isOverdue && ' ⚠'}
                        </span>
                        {col !== 'done' && (
                          <button
                            type="button"
                            onClick={() => onAdvance(task)}
                            disabled={loadingTaskId === task.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                              col === 'doing'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100'
                            }`}
                            title={col === 'doing' ? '完了にする' : '着手する'}
                          >
                            {loadingTaskId === task.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : col === 'doing'
                                ? <CheckCircle2 className="w-3 h-3" strokeWidth={2.25} />
                                : <Play className="w-3 h-3" strokeWidth={2.5} />}
                            {col === 'doing' ? '完了' : '着手'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
