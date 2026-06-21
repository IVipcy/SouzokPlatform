'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import AddTaskModal from './AddTaskModal'

/**
 * 調査タブ等に置く「＋タスクを作成」ボタン。タスクタブへ移動せずその場でタスクを作れる。
 * defaultPhase でそのタブの業務（相続人調査=phase1 / 財産調査=phase2 / 不動産=phase3）を初期選択。
 */
export default function AddTaskButton({ caseId, defaultPhase, label = 'タスクを作成' }: { caseId: string; defaultPhase?: string; label?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-semibold text-brand-600 bg-brand-50 border border-brand-200 rounded-md hover:bg-brand-100 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2.25} />{label}
      </button>
      {open && (
        <AddTaskModal
          isOpen
          onClose={() => setOpen(false)}
          caseId={caseId}
          allMembers={[]}
          defaultPhase={defaultPhase}
          onSaved={() => { setOpen(false); router.refresh() }}
        />
      )}
    </>
  )
}
