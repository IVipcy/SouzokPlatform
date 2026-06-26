'use client'

// 実務タブ（相続人調査・財産調査・遺産分割・相続登記・解約手続・遺言検認 等）の
// 上部に表示する「このタブのタスク」セクション。
// task.phase = 業務名（戸籍/財産/分割/...）でフィルタし、Ready/対応中/Waiting の件数バッジ＋
// クリックで展開してミニリスト。タスク詳細へワンクリックで飛べる。

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import { classifyTask, type ReadinessReceipt, type Readiness } from '@/lib/taskReadiness'
import type { TaskRow } from '@/types'

type Props = {
  /** 業務名のリスト（例: ['戸籍', '相関図', '法定相続情報取得']）。task.phase と一致するもの */
  gyomus: string[]
  tasks: TaskRow[]
  receipts?: ReadinessReceipt[]
  /** セクションタイトル（既定: 「このタブのタスク」） */
  title?: string
}

const LABEL: Record<Readiness, string> = {
  ready:   '🔔 着手OK',
  doing:   '🟡 対応中',
  waiting: '⏳ 待ち',
  done:    '✓ 完了',
}

export default function TabTasksSection({ gyomus, tasks, receipts = [], title = 'このタブのタスク' }: Props) {
  const [open, setOpen] = useState(false)
  // 該当業務のタスクのみ（事務管理タスク = task_kind='case'）
  const matched = tasks.filter(t =>
    t.task_kind === 'case' && gyomus.some(g => (t.phase ?? '') === g),
  )
  if (matched.length === 0) return null

  // Readiness 分類
  const counts: Record<Readiness, number> = { ready: 0, doing: 0, waiting: 0, done: 0 }
  const classified = matched.map(t => {
    const { readiness, waitingFor } = classifyTask(t, receipts)
    counts[readiness]++
    return { task: t, readiness, waitingFor }
  })

  return (
    <Section
      title={title}
      actionLabel={open ? '閉じる' : '開く'}
      onAction={() => setOpen(o => !o)}
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {(['ready', 'doing', 'waiting', 'done'] as Readiness[]).map(k => (
          <span
            key={k}
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              counts[k] === 0
                ? 'bg-gray-50 text-gray-400'
                : k === 'ready'   ? 'bg-amber-50 text-amber-700'
                : k === 'doing'   ? 'bg-brand-50 text-brand-700'
                : k === 'waiting' ? 'bg-gray-100 text-gray-700'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {LABEL[k]} {counts[k]}
          </span>
        ))}
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
              // Ready → 対応中 → Waiting → 完了 の順
              const rank: Record<Readiness, number> = { ready: 0, doing: 1, waiting: 2, done: 3 }
              return rank[a.readiness] - rank[b.readiness]
            })
            .map(({ task, readiness, waitingFor }) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-gray-50 text-[12px]"
              >
                <span className="w-12 text-center text-[10px] font-semibold">{LABEL[readiness]}</span>
                <span className={`flex-1 font-medium truncate ${readiness === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {task.title}
                </span>
                {waitingFor && <span className="text-[10px] text-gray-500 truncate max-w-[200px]">{waitingFor}</span>}
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
