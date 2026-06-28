'use client'

// 事務管理タスクのカンバンビュー。ステータス（着手前 / 対応中 / 完了）の3列。
// 各カードに案件コンテキスト（番号・案件名）と、紐付き書類の状態を補助情報として表示する。
// 1日替わりの事務管理担当が「次やる」を即決できる構造。

import Link from 'next/link'
import { Play, CheckCircle2, Loader2, PackageCheck, FileCheck } from 'lucide-react'
import type { TaskRow } from '@/types'
import { normalizeTaskStatus, getStartSignal, type ReadinessReceipt } from '@/lib/taskReadiness'
import { KoteiBadge, GyomuBadge } from '@/components/ui/KoteiBadge'

export type KanbanCaseInfo = {
  case_number: string
  deal_name: string
}

type Props = {
  tasks: TaskRow[]
  caseMap?: Record<string, KanbanCaseInfo>
  /** 受信簿。書類状態の補助情報に使う */
  receipts?: ReadinessReceipt[]
  today: string
  onAdvance: (task: TaskRow) => void
  loadingTaskId: string | null
  /** 案件詳細から呼ばれる場合（caseMapなしで動かす）。案件名/番号は出さない */
  hideCase?: boolean
  /** タスク→紐づく到着物名 */
  docNamesByTask?: Map<string, string[]>
}

type ColumnKey = '着手前' | '対応中' | '完了'
const COLUMNS: ColumnKey[] = ['着手前', '対応中', '完了']
const META: Record<ColumnKey, { label: string; dot: string; bg: string; text: string }> = {
  '着手前': { label: '未着手', dot: 'bg-gray-400',    bg: 'bg-gray-50',    text: 'text-gray-700' },
  '対応中': { label: '対応中', dot: 'bg-brand-500',   bg: 'bg-brand-50',   text: 'text-brand-700' },
  '完了':   { label: '完了',   dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
}

export default function TaskKanbanView({ tasks, caseMap = {}, receipts = [], today, onAdvance, loadingTaskId, hideCase, docNamesByTask }: Props) {
  const grouped: Record<ColumnKey, TaskRow[]> = { '着手前': [], '対応中': [], '完了': [] }
  for (const t of tasks) {
    const s = normalizeTaskStatus(t.status)
    if (s === '着手前' || s === '対応中' || s === '完了') grouped[s].push(t)
  }
  // 着手前は「着手OK（書類受領/手動）」を上位に並べる
  grouped['着手前'].sort((a, b) => {
    const ra = getStartSignal(a, receipts).ready ? 0 : 1
    const rb = getStartSignal(b, receipts).ready ? 0 : 1
    return ra - rb || (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })

  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
        {COLUMNS.map(col => {
          const items = grouped[col]
          const meta = META[col]
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
                ) : items.map(task => {
                  const caseInfo = caseMap[task.case_id]
                  const isOverdue = !!(task.due_date && task.due_date < today && col !== '完了')
                  const signal = col === '着手前' ? getStartSignal(task, receipts) : { ready: false, reason: null as string | null, source: null }
                  const docs = docNamesByTask?.get(task.id) ?? []
                  const ext = (task.ext_data ?? {}) as Record<string, unknown>
                  const result = typeof ext.execution_result === 'string' ? ext.execution_result.trim() : ''
                  return (
                    <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-2.5 hover:border-brand-200 transition-colors">
                      {/* 工程＋業務チップ＋着手OK旗 */}
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <KoteiBadge phase={task.phase} width={96} />
                        <GyomuBadge phase={task.phase} width={56} />
                        {signal.ready && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 flex-shrink-0">
                            <PackageCheck className="w-3 h-3" strokeWidth={2} />着手OK
                          </span>
                        )}
                      </div>
                      <Link href={`/tasks/${task.id}`} className={`block text-[13px] font-semibold leading-tight hover:text-brand-600 ${col === '完了' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
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

                      {/* 着手OKの理由（なぜ今やれるか） */}
                      {signal.ready && signal.reason && (
                        <div className="mt-1.5 text-[11px] px-2 py-1 rounded bg-amber-50 text-amber-800 inline-flex items-center gap-1">
                          {signal.source === 'doc'
                            ? <FileCheck className="w-3 h-3" strokeWidth={2} />
                            : <PackageCheck className="w-3 h-3" strokeWidth={2} />}
                          {signal.reason}
                        </div>
                      )}

                      {/* 紐づく到着物 */}
                      {docs.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {docs.map((d, k) => <span key={k} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-100">{d}</span>)}
                        </div>
                      )}

                      {/* 実施結果（あれば。2行省略＋ホバー全文） */}
                      {result && (
                        <div className="mt-1.5 text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded px-2 py-1 line-clamp-2" title={result}>{result}</div>
                      )}

                      {/* 期限＋着手 */}
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className={`text-[11px] font-mono ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                          {task.due_date ?? '期限なし'}
                          {isOverdue && ' ⚠'}
                        </span>
                        {col !== '完了' && (
                          <button
                            type="button"
                            onClick={() => onAdvance(task)}
                            disabled={loadingTaskId === task.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                              col === '対応中'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100'
                            }`}
                            title={col === '対応中' ? '完了にする' : '着手する'}
                          >
                            {loadingTaskId === task.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : col === '対応中'
                                ? <CheckCircle2 className="w-3 h-3" strokeWidth={2.25} />
                                : <Play className="w-3 h-3" strokeWidth={2.5} />}
                            {col === '対応中' ? '完了' : '着手'}
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
