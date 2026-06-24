'use client'

import { useState } from 'react'
import { ListChecks, X } from 'lucide-react'
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
 * 「チームタスク」ボタン（赤）。チーム名のすぐ右に置き、押すと要対応のチームタスク一覧を
 * モーダルで開く（以前のインライン展開からモーダルに変更）。
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
          <span className="ml-0.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-white/25 text-[12px] font-mono">{tasks.length}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="mt-10 w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-red-600" strokeWidth={2.25} />
                <h3 className="text-[15px] font-bold text-gray-900">{title}</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700" aria-label="閉じる"><X className="w-5 h-5" /></button>
            </header>
            <div className="max-h-[72vh] overflow-y-auto p-4">
              <SystemTaskList
                tasks={tasks}
                title={`${title}（要対応）`}
                emptyText="要対応のチームタスクはありません"
                showCase={true}
                includeCompleted={false}
                showAssignRole={true}
                teamMode={true}
                currentMemberId={currentMemberId}
                caseAssignees={caseAssignees}
                seeAllHref="/tasks?kind=system"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
