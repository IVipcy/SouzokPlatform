'use client'

import { useState } from 'react'
import { ListChecks } from 'lucide-react'
import Modal from '@/components/ui/Modal'
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
 * ダッシュボード見出しの右に置く「チームタスク」ボタン。
 * 押下するとモーダルで要対応のチームタスク一覧（SystemTaskList）を表示する。
 */
export default function TeamTaskButton({ tasks, title = 'チームタスク', currentMemberId, caseAssignees }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-bold text-white bg-red-600 border border-red-700 hover:bg-red-700 shadow-sm transition-colors"
      >
        <ListChecks className="w-4 h-4" strokeWidth={2.25} />
        {title}
        {tasks.length > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-white/25 text-[12px] font-mono">
            {tasks.length}
          </span>
        )}
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={`${title}（要対応）`} maxWidth="max-w-6xl">
        <SystemTaskList
          tasks={tasks}
          title={title}
          emptyText="要対応のチームタスクはありません"
          showCase={true}
          includeCompleted={false}
          showAssignRole={true}
          currentMemberId={currentMemberId}
          caseAssignees={caseAssignees}
          seeAllHref="/tasks?kind=system"
        />
      </Modal>
    </>
  )
}
