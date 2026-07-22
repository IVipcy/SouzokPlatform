'use client'

// 実務タブ（相続人調査・財産調査・遺産分割・相続登記・解約手続・遺言検認 等）の
// 上部に表示する「このタブのタスク」セクション。
// task.phase = 業務名（戸籍/財産/分割/...）でフィルタし、ステータス（未着手/対応中/完了）の
// 件数バッジ＋クリックで展開してミニリスト。タスク詳細へワンクリックで飛べる。

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, PackageCheck } from 'lucide-react'
import { normalizeTaskStatus, getStartSignal, type ReadinessReceipt } from '@/lib/taskReadiness'
import type { TaskRow } from '@/types'

type Props = {
  /** 業務名のリスト（例: ['戸籍', '相関図', '法定相続情報取得']）。task.phase と一致するもの */
  gyomus: string[]
  tasks: TaskRow[]
  receipts?: ReadinessReceipt[]
  /** セクションタイトル（既定: 「このタブのタスク」） */
  title?: string
}

type Status = '着手前' | '対応中' | '完了'
const LABEL: Record<Status, string> = { '着手前': '未着手', '対応中': '対応中', '完了': '完了' }

// 一覧内のステータスラベルの色（未着手=灰 / 対応中=青 / 完了=緑）
const STATUS_PILL: Record<Status, string> = {
  '着手前': 'bg-gray-100 text-gray-600',
  '対応中': 'bg-brand-50 text-brand-700',
  '完了': 'bg-emerald-50 text-emerald-700',
}

// 完了日時 ISO → 「M/D HH:MM」表記
const fmtDateTime = (iso: string): string => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function TabTasksSection({ gyomus, tasks, receipts = [], title = '関連タスク' }: Props) {
  const [open, setOpen] = useState(false)
  // 該当業務のタスクのみ（事務管理タスク = task_kind='case'）
  const matched = tasks.filter(t =>
    t.task_kind === 'case' && gyomus.some(g => (t.phase ?? '') === g),
  )
  if (matched.length === 0) return null

  const counts: Record<Status, number> = { '着手前': 0, '対応中': 0, '完了': 0 }
  let readyCount = 0
  const classified = matched.map(t => {
    const s = normalizeTaskStatus(t.status) as Status
    counts[s] = (counts[s] ?? 0) + 1
    const signal = getStartSignal(t, receipts)
    if (signal.ready) readyCount++
    return { task: t, status: s, signal }
  })

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      {/* コンパクトな1行バー（見出し＋件数バッジ＋一覧トグル）。 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-semibold text-gray-600">{title}</span>
        {(['着手前', '対応中', '完了'] as Status[]).map(k => (
          <span
            key={k}
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              counts[k] === 0
                ? 'bg-gray-50 text-gray-400'
                : k === '着手前' ? 'bg-gray-100 text-gray-700'
                : k === '対応中' ? 'bg-brand-50 text-brand-700'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {LABEL[k]} {counts[k]}
          </span>
        ))}
        {readyCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
            <PackageCheck className="w-3 h-3" strokeWidth={2} />着手OK {readyCount}
          </span>
        )}
        <button type="button" onClick={() => setOpen(o => !o)} className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
          {open ? '閉じる' : '一覧'} {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {open && (
        <div className="space-y-1.5 border-t border-gray-100 pt-2.5 mt-2">
          {classified
            .sort((a, b) => {
              // 着手OK → 着手前 → 対応中 → 完了
              const ra = a.signal.ready ? -1 : 0
              const rb = b.signal.ready ? -1 : 0
              if (ra !== rb) return ra - rb
              const rank: Record<Status, number> = { '着手前': 0, '対応中': 1, '完了': 2 }
              return rank[a.status] - rank[b.status]
            })
            .map(({ task, status, signal }) => {
              const ext = (task.ext_data ?? {}) as Record<string, unknown>
              const execResult = typeof ext.execution_result === 'string' ? ext.execution_result.trim() : ''
              const completedBy = typeof ext.completed_by_name === 'string' ? ext.completed_by_name.trim() : ''
              const completedAt = typeof ext.completed_at === 'string' ? ext.completed_at : ''
              const doneMeta = status === '完了' && (completedBy || completedAt)
                ? `${completedBy}${completedBy && completedAt ? ' ・ ' : ''}${completedAt ? fmtDateTime(completedAt) : ''} 完了`
                : ''
              return (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="flex items-start gap-2 px-2.5 py-1.5 rounded hover:bg-gray-50 text-[12px]"
              >
                {signal.ready
                  ? <span className="mt-0.5 inline-flex items-center justify-center gap-0.5 w-16 flex-none text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800"><PackageCheck className="w-3 h-3" strokeWidth={2} />着手OK</span>
                  : <span className={`mt-0.5 w-16 flex-none text-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_PILL[status]}`}>{LABEL[status]}</span>}
                <span className={`w-56 flex-none font-medium truncate ${status === '完了' ? 'text-gray-500' : 'text-gray-800'}`}>
                  {task.title}
                </span>
                {/* 右側：完了→実施結果＋完了者・日時／着手OK→着手OK理由／その他→現状メモ */}
                <span className="flex-1 min-w-0">
                  {status === '完了' ? (
                    <span className="block">
                      {execResult
                        ? <span className="block text-[11px] text-gray-600 line-clamp-2" title={execResult}>{execResult}</span>
                        : <span className="block text-[11px] text-gray-300">実施結果の記載なし</span>}
                      {doneMeta && <span className="block text-[10px] text-gray-400 mt-0.5">{doneMeta}</span>}
                    </span>
                  ) : signal.ready && signal.reason ? (
                    <span className="block text-[10.5px] text-amber-700 line-clamp-2" title={signal.reason}>{signal.reason}</span>
                  ) : (
                    <span className="block text-[10.5px] text-gray-300">—</span>
                  )}
                </span>
                {task.due_date && status !== '完了' && <span className="text-[11px] font-mono text-gray-500 flex-none mt-0.5">{task.due_date}</span>}
              </Link>
              )
            })}
          <button type="button" onClick={() => setOpen(false)} className="w-full mt-1 inline-flex items-center justify-center gap-1 text-[11px] text-gray-400 hover:text-gray-600">
            閉じる <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
