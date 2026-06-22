'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { DB_PHASES } from '@/lib/phases'
import type { TaskRow } from '@/types'

type Props = {
  task: TaskRow
  /** 同一案件の他タスク（前段＝同じフェーズの最新完了を自動判定するために使う） */
  caseTasks: TaskRow[]
  currentMemberId: string | null
}

/**
 * 前段作業の確認セクション
 * - 前タスク＝「同じフェーズ内で最新に完了したタスク」を自動表示（手動紐付けは廃止）。
 * - 前タスクの実施結果（実施者・完了日・実施結果メモ）を表示。
 * - 「確認（不備なし）」を保存すると、このタスクの ext_data.prev_task_evaluation に記録。
 */
export default function PrevTaskReviewSection({ task, caseTasks, currentMemberId }: Props) {
  const router = useRouter()
  const ext = useMemo(() => (task.ext_data ?? {}) as Record<string, unknown>, [task.ext_data])

  // 前段タスクの自動判定（自分自身は除外。完了日＝無ければ更新日 が新しい順）：
  //  ① 同じフェーズ内で最新に完了したタスク
  //  ② 無ければ（＝このフェーズの最初のタスク）、前のフェーズで最後に完了したタスク
  const prevTask = useMemo(() => {
    const ranks = DB_PHASES as readonly string[]
    const byDesc = (a: TaskRow, b: TaskRow) =>
      (b.completed_at ?? b.updated_at ?? '').localeCompare(a.completed_at ?? a.updated_at ?? '')
    const done = caseTasks.filter(t => t.id !== task.id && t.status === '完了')
    const samePhase = done.filter(t => t.phase === task.phase).sort(byDesc)
    if (samePhase[0]) return samePhase[0]
    const cur = ranks.indexOf(task.phase ?? '')
    if (cur < 0) return null
    const earlier = done
      .filter(t => { const r = ranks.indexOf(t.phase ?? ''); return r >= 0 && r < cur })
      .sort(byDesc)
    return earlier[0] ?? null
  }, [caseTasks, task.id, task.phase])

  const initialEval = (ext.prev_task_evaluation as string | undefined) ?? null
  const [confirmed, setConfirmed] = useState<boolean>(initialEval === '不備なし')
  const [saving, setSaving] = useState(false)

  // 前段タスクの「実施結果」（前担当者が記入した自由記述）
  const prevExt = (prevTask?.ext_data ?? {}) as Record<string, unknown>
  const prevExecutionResult = typeof prevExt.execution_result === 'string'
    ? prevExt.execution_result
    : ''

  if (!prevTask) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      const supabase = createClient()
      const nextExt = {
        ...ext,
        prev_task_evaluation: '不備なし',
        prev_task_reviewed_at: new Date().toISOString(),
        prev_task_reviewed_by: currentMemberId,
      }
      const { error: updErr } = await supabase
        .from('tasks')
        .update({ ext_data: nextExt })
        .eq('id', task.id)
      if (updErr) throw updErr
      setConfirmed(true)
      showToast('前段作業を確認しました', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  const completedDate = prevTask.completed_at ?? prevTask.updated_at?.slice(0, 10)
  const performerName = prevTask.started_by_member?.name

  return (
    <div className="bg-white rounded-xl border-2 border-amber-200 shadow-sm overflow-hidden">
      {/* ヘッダー（縦並びで省スペース） */}
      <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4 text-amber-700 flex-shrink-0" strokeWidth={2.25} />
          <h3 className="text-[14px] font-bold text-amber-800">前段作業の確認</h3>
        </div>
        <p className="text-[11px] text-amber-700/80 mt-0.5 leading-tight">
          前タスクの結果を確認してから着手しましょう
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* 前のタスクへのリンク */}
        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-0.5">前のタスク</div>
          <Link
            href={`/tasks/${prevTask.id}`}
            className="text-[14px] font-bold text-brand-700 hover:underline inline-flex items-center gap-1"
          >
            {prevTask.title}
          </Link>
        </div>

        {/* 前段作業の実施結果・引継ぎ事項 */}
        <div>
          <div className="text-[13px] font-semibold text-gray-700 mb-1">前段作業の実施結果・引継ぎ事項</div>
          <div className={`px-3 py-2 rounded-lg border text-[13px] whitespace-pre-line min-h-[64px] ${
            prevExecutionResult
              ? 'bg-white border-gray-300 text-gray-800'
              : 'bg-gray-50 border-gray-200 text-gray-400 italic'
          }`}>
            {prevExecutionResult || '前担当者の実施結果・引継ぎ事項はまだ記入されていません'}
          </div>
        </div>

        {/* 実施者 / 完了日（インライン2行で省スペース） */}
        <div className="space-y-1.5 text-[12px]">
          <div className="flex items-baseline gap-2">
            <span className="text-gray-500 font-semibold w-[72px] flex-shrink-0">作業実施者</span>
            <span className="text-gray-800 font-medium truncate">
              {performerName || <span className="text-gray-400 italic">未設定</span>}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-gray-500 font-semibold w-[72px] flex-shrink-0">作業完了日</span>
            <span className="text-gray-800 font-mono">
              {completedDate || <span className="text-gray-400 italic">未完了</span>}
            </span>
          </div>
        </div>

        {/* 確認アクション（不備なし） */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {confirmed && (
            <span className="inline-flex items-center gap-1 text-[12px] text-green-700 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.25} />確認済み（不備なし）
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white shadow-sm transition-all
              ${saving ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />
            {confirmed ? '確認済みにする' : '確認（不備なし）'}
          </button>
        </div>
      </div>
    </div>
  )
}
