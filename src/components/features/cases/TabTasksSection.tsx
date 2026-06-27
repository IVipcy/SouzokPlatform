'use client'

// 実務タブ（相続人調査・財産調査・遺産分割・相続登記・解約手続・遺言検認 等）の
// 上部に表示する「このタブのタスク」セクション。
// task.phase = 業務名（戸籍/財産/分割/...）でフィルタし、ステータス（未着手/対応中/完了）の
// 件数バッジ＋クリックで展開してミニリスト。タスク詳細へワンクリックで飛べる。

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, PackageCheck } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
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

export default function TabTasksSection({ gyomus, tasks, receipts = [], title = 'このタブのタスク' }: Props) {
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
    <Section
      title={title}
      actionLabel={open ? '閉じる' : '開く'}
      onAction={() => setOpen(o => !o)}
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
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
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
            タスク一覧を見る <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-1.5 border-t border-gray-100 pt-2.5">
          {classified
            .sort((a, b) => {
              // 着手OK → 着手前 → 対応中 → 完了
              const ra = a.signal.ready ? -1 : 0
              const rb = b.signal.ready ? -1 : 0
              if (ra !== rb) return ra - rb
              const rank: Record<Status, number> = { '着手前': 0, '対応中': 1, '完了': 2 }
              return rank[a.status] - rank[b.status]
            })
            .map(({ task, status, signal }) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-gray-50 text-[12px]"
              >
                {signal.ready
                  ? <span className="inline-flex items-center gap-0.5 w-14 text-[10px] font-semibold text-amber-800"><PackageCheck className="w-3 h-3" strokeWidth={2} />着手OK</span>
                  : <span className="w-14 text-center text-[10px] font-semibold text-gray-500">{LABEL[status]}</span>}
                <span className={`flex-1 font-medium truncate ${status === '完了' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {task.title}
                </span>
                {signal.ready && signal.reason && (
                  <span className="text-[10px] text-amber-700 truncate max-w-[200px]">{signal.reason}</span>
                )}
                {task.due_date && <span className="text-[11px] font-mono text-gray-500">{task.due_date}</span>}
              </Link>
            ))}
          <button type="button" onClick={() => setOpen(false)} className="w-full mt-1 inline-flex items-center justify-center gap-1 text-[11px] text-gray-400 hover:text-gray-600">
            閉じる <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </Section>
  )
}
