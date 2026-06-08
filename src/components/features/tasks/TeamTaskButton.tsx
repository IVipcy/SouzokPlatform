'use client'

import { useState } from 'react'
import { ListChecks, ChevronDown, ChevronUp } from 'lucide-react'
import SystemTaskList from './SystemTaskList'
import type { TaskRow } from '@/types'

type Props = {
  tasks: TaskRow[]
  title?: string
  currentMemberId?: string
  /** 案件の受注担当・管理担当名（case_id → 名前） */
  caseAssignees?: Record<string, { salesName: string | null; managerName: string | null }>
}

/**
 * 「チームタスク」ボタン（赤）＋ インライン展開の一覧。
 * 押下するとその場に要対応のチームタスク一覧（SystemTaskList）が開く／閉じる（ポップアップではない）。
 */
export default function TeamTaskButton({ tasks, title = 'チームタスク', currentMemberId, caseAssignees }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-bold text-white bg-red-600 border border-red-700 hover:bg-red-700 shadow-sm transition-colors"
        >
          <ListChecks className="w-4 h-4" strokeWidth={2.25} />
          {title}
          {tasks.length > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-white/25 text-[12px] font-mono">
              {tasks.length}
            </span>
          )}
          {open ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={2.5} /> : <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />}
        </button>
      </div>

      {open && (
        <div className="mt-2">
          <SystemTaskList
            tasks={tasks}
            title={`${title}（要対応）`}
            emptyText="要対応のチームタスクはありません"
            showCase={true}
            includeCompleted={false}
            showAssignRole={true}
            currentMemberId={currentMemberId}
            caseAssignees={caseAssignees}
            seeAllHref="/tasks?kind=system"
          />
        </div>
      )}
    </div>
  )
}
