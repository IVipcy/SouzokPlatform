'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleCheck, Play, Loader2, Circle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { normalizeTaskStatus, getStartSignal } from '@/lib/taskReadiness'
import CompleteTaskModal from './CompleteTaskModal'
import type { TaskRow } from '@/types'

// 実務タブの行に紐づくタスクを、状態色つきチップで表示。クリックで着手／完了モーダル／詳細へ。
//   着手前(着手OK) → クリックで着手（対応中へ）
//   着手前(着手OK前) → グレー・押せない（着手OK待ち）
//   対応中 → クリックで完了モーダル
//   完了 → クリックでタスク詳細
export default function RowTaskChip({ task, onRefresh }: { task: TaskRow; onRefresh?: () => void }) {
  const router = useRouter()
  const memberId = useCurrentMember(null)
  const [busy, setBusy] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)

  const status = normalizeTaskStatus(task.status)
  const ready = getStartSignal(task).ready
  const t = task.title
  const short = t.includes('読込') ? '読込' : t.includes('請求') ? '請求' : t.includes('相続登記') ? '登記' : t

  const meta = status === '完了'
    ? { icon: <CircleCheck className="w-3 h-3" />, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: '完了' }
    : status === '対応中'
      ? { icon: <Play className="w-3 h-3" strokeWidth={2.5} />, cls: 'bg-brand-50 text-brand-700 border-brand-200', label: '対応中' }
      : ready
        ? { icon: <Play className="w-3 h-3" strokeWidth={2.5} />, cls: 'bg-amber-50 text-amber-800 border-amber-200', label: '着手OK' }
        : { icon: <Circle className="w-3 h-3" />, cls: 'bg-gray-50 text-gray-400 border-gray-200', label: '着手前' }

  const startTask = async () => {
    if (busy) return
    if (!window.confirm(`「${task.title}」に着手しますか？`)) return
    setBusy(true)
    const supabase = createClient()
    const patch: Record<string, unknown> = { status: '対応中' }
    if (!task.started_at) patch.started_at = new Date().toISOString()
    if (!task.started_by) patch.started_by = memberId
    const { error } = await supabase.from('tasks').update(patch).eq('id', task.id)
    setBusy(false)
    if (error) { showToast(`着手に失敗しました: ${error.message}`, 'error'); return }
    showToast('着手しました', 'success')
    onRefresh?.()
  }

  const onClick = () => {
    if (status === '完了') { router.push(`/tasks/${task.id}`); return }
    if (status === '対応中') { setCompleteOpen(true); return }
    if (ready) { startTask(); return }
    // 着手OK前は詳細へ（そこで前段確認などを見る）
    router.push(`/tasks/${task.id}`)
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title={status === '対応中' ? 'クリックで完了' : status === '完了' ? 'タスク詳細を開く' : ready ? 'クリックで着手' : '着手OK待ち（詳細を開く）'}
        className={`inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-full border text-[11px] cursor-pointer hover:brightness-95 disabled:opacity-50 ${meta.cls}`}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : meta.icon}
        <span className="truncate">{short}</span>
        <span className="opacity-70">{meta.label}</span>
      </button>
      {completeOpen && (
        <CompleteTaskModal
          task={task}
          onClose={() => setCompleteOpen(false)}
          onCompleted={() => { setCompleteOpen(false); onRefresh?.() }}
        />
      )}
    </>
  )
}
