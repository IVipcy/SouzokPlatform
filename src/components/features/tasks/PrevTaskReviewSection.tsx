'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { TaskRow, TaskDependencyRow } from '@/types'

type Props = {
  task: TaskRow
  prereqDeps: TaskDependencyRow[]
  currentMemberId: string | null
}

type Evaluation = '不備なし' | '差戻し'

/**
 * 前段作業の確認セクション
 * - 前タスクの実施結果（実施者・完了日・主要 ext_data フィールド）を表示
 * - 内容評価ラジオ（○: 不備なし / ×: 差戻し）
 * - 「差戻し」を選んだ場合は理由 textarea + 保存で
 *   ・前タスクの status を「差戻し」に更新
 *   ・前タスクの担当者（started_by）に通知 (notifications insert)
 *   ・case_activities に履歴を残す
 * - 評価結果はこのタスクの ext_data.prev_task_evaluation / prev_task_defect_note に保存
 */
export default function PrevTaskReviewSection({ task, prereqDeps, currentMemberId }: Props) {
  const router = useRouter()
  const ext = useMemo(() => (task.ext_data ?? {}) as Record<string, unknown>, [task.ext_data])

  // 「前段作業」とみなすのは task_completed 型の依存。最初の1件を表示対象に。
  const primaryDep = prereqDeps.find(d => d.condition_type === 'task_completed' && d.from_task)
  const prevTask = primaryDep?.from_task

  const initialEval = (ext.prev_task_evaluation as Evaluation | undefined) ?? null
  const initialNote = (ext.prev_task_defect_note as string | undefined) ?? ''

  const [evaluation, setEvaluation] = useState<Evaluation | null>(initialEval)
  const [defectNote, setDefectNote] = useState<string>(initialNote)
  const [saving, setSaving] = useState(false)

  // 前段タスクの「実施結果」（前担当者が記入した自由記述）
  const prevExt = (prevTask?.ext_data ?? {}) as Record<string, unknown>
  const prevExecutionResult = typeof prevExt.execution_result === 'string'
    ? prevExt.execution_result
    : ''

  if (!prevTask) return null

  const handleSave = async () => {
    if (!evaluation) {
      showToast('評価を選んでください', 'error')
      return
    }
    if (evaluation === '差戻し' && defectNote.trim() === '') {
      showToast('差戻しの理由を記入してください', 'error')
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()

      // 1) このタスクの ext_data に評価を保存
      const nextExt = {
        ...ext,
        prev_task_evaluation: evaluation,
        prev_task_defect_note: evaluation === '差戻し' ? defectNote.trim() : null,
        prev_task_reviewed_at: new Date().toISOString(),
        prev_task_reviewed_by: currentMemberId,
      }
      const { error: updErr } = await supabase
        .from('tasks')
        .update({ ext_data: nextExt })
        .eq('id', task.id)
      if (updErr) throw updErr

      // 2) 差戻しの場合は前タスクのステータス更新 + 通知 + 活動履歴
      if (evaluation === '差戻し') {
        // 前タスクを「差戻し」へ + ext_data に差戻し理由を保存（再対応する人が理由を見られるように）
        const prevExtNow = (prevTask.ext_data ?? {}) as Record<string, unknown>
        const prevExtNext = {
          ...prevExtNow,
          returned_at: new Date().toISOString(),
          returned_by: currentMemberId,
          returned_reason: defectNote.trim(),
          returned_from_task_id: task.id,
        }
        const { error: prevErr } = await supabase
          .from('tasks')
          .update({ status: '差戻し', ext_data: prevExtNext })
          .eq('id', prevTask.id)
        if (prevErr) throw prevErr

        // 通知 insert (前タスクの担当者宛て)
        const notifyTo = prevTask.started_by
        if (notifyTo) {
          await supabase.from('notifications').insert({
            member_id: notifyTo,
            type: 'task_returned',
            case_id: task.case_id,
            task_id: prevTask.id,
            title: `「${prevTask.title}」が差戻されました`,
            body: defectNote.trim() ? `理由: ${defectNote.trim()}` : null,
          })
        }

        // 活動履歴
        if (currentMemberId) {
          await supabase.from('case_activities').insert({
            case_id: task.case_id,
            task_id: prevTask.id,
            member_id: currentMemberId,
            activity_type: 'status_change',
            description: `「${prevTask.title}」を差戻し（${defectNote.trim().slice(0, 60)}）`,
            activity_date: new Date().toISOString().split('T')[0],
          })
        }
        showToast('差戻しを記録し、担当者へ通知しました', 'success')
      } else {
        showToast('内容評価を保存しました', 'success')
      }
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

        {/* 内容評価（独立した行で横並び2ボタン） */}
        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1.5">内容評価</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEvaluation('不備なし')}
              className={`inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg border-2 text-[12px] font-bold transition-all ${
                evaluation === '不備なし'
                  ? 'bg-green-50 border-green-500 text-green-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-green-300 hover:bg-green-50/50'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.25} />
              ○ 不備なし
            </button>
            <button
              type="button"
              onClick={() => setEvaluation('差戻し')}
              className={`inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg border-2 text-[12px] font-bold transition-all ${
                evaluation === '差戻し'
                  ? 'bg-red-50 border-red-500 text-red-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:bg-red-50/50'
              }`}
            >
              <XCircle className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.25} />
              × 差戻し
            </button>
          </div>
        </div>

        {/* 不備内容（差戻しの場合のみ） */}
        {evaluation === '差戻し' && (
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">不備内容（差戻し理由）</div>
            <textarea
              value={defectNote}
              onChange={e => setDefectNote(e.target.value)}
              placeholder="例: 残高証明書の基準日が正しくありません。○月○日時点に再請求してください。"
              rows={3}
              className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
            />
          </div>
        )}

        {/* 保存ボタン */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {initialEval && (
            <span className="text-[12px] text-gray-500">
              現在の評価: <span className="font-semibold">{initialEval}</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !evaluation}
            className={`ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white shadow-sm transition-all
              ${saving || !evaluation
                ? 'bg-gray-300 cursor-not-allowed'
                : evaluation === '差戻し'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'}`}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {evaluation === '差戻し' ? '差戻しを保存' : '評価を保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
