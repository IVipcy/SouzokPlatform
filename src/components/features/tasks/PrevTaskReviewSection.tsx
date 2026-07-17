'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Info, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { TaskRow } from '@/types'

type Props = {
  task: TaskRow
  /** 同一案件の他タスク（前段＝着手OK元 or 同じ業務区分の最新完了を判定するために使う） */
  caseTasks: TaskRow[]
  currentMemberId: string | null
}

// 前段作業の3段階評価。〇=問題なし / △=軽微な不備 / ×=やり直し
type Rating = '問題なし' | '軽微な不備' | 'やり直し'

// 保存値を正規化（旧2択データ 不備なし/不備あり も吸収）
function normalizeRating(v: unknown): Rating | null {
  if (v === '問題なし' || v === '軽微な不備' || v === 'やり直し') return v
  if (v === '不備なし') return '問題なし'
  if (v === '不備あり') return 'やり直し'
  return null
}

// 評価の見た目定義（記号・ラベル・色）
const RATING_META: Record<Rating, { mark: string; label: string; onCls: string }> = {
  '問題なし': { mark: '〇', label: '問題なし', onCls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  '軽微な不備': { mark: '△', label: '軽微な不備', onCls: 'bg-amber-50 text-amber-800 border-amber-300' },
  'やり直し': { mark: '×', label: 'やり直し', onCls: 'bg-red-50 text-red-700 border-red-300' },
}
const RATING_ORDER: Rating[] = ['問題なし', '軽微な不備', 'やり直し']

/**
 * 前段作業の確認セクション
 * - 前タスク＝「着手OKにした元タスク」優先、無ければ「同じ業務区分の最新完了タスク」。
 * - 前段作業の実施結果を表示し、「不備なし / 不備あり」で評価（不備ありは内容を記載）。
 * - 不備の修正は前段担当ではなく、このタスクの担当者が行う（差し戻しはしない）。
 * - 評価は前段作業の実施者に紐づけて task_reviews に蓄積（担当別の苦手作業の可視化用）。
 */
export default function PrevTaskReviewSection({ task, caseTasks, currentMemberId }: Props) {
  const router = useRouter()
  const ext = useMemo(() => (task.ext_data ?? {}) as Record<string, unknown>, [task.ext_data])

  // 前段タスクの判定（実体のある前段だけ。自分自身は除外。完了日＝無ければ更新日 が新しい順）：
  //  ⓪ 完了ゲートでこのタスクを「着手OK」にした元タスク（明示的な前段）を最優先
  //  ① 同じ業務区分で最新に完了したタスク（同じ作業の流れ）
  const prevTask = useMemo(() => {
    const byDesc = (a: TaskRow, b: TaskRow) =>
      (b.completed_at ?? b.updated_at ?? '').localeCompare(a.completed_at ?? a.updated_at ?? '')
    const done = caseTasks.filter(t => t.id !== task.id && t.status === '完了')
    const fromId = typeof ext.ready_from_task_id === 'string' ? ext.ready_from_task_id : ''
    if (fromId) {
      const src = done.find(t => t.id === fromId)
      if (src) return src
    }
    const samePhase = done.filter(t => t.phase === task.phase).sort(byDesc)
    return samePhase[0] ?? null
  }, [caseTasks, task.id, task.phase, ext.ready_from_task_id])

  const initialResult = normalizeRating(ext.prev_task_evaluation)
  const reviewed = initialResult !== null
  const [result, setResult] = useState<Rating | null>(initialResult)
  const [detail, setDetail] = useState(typeof ext.prev_task_defect_detail === 'string' ? ext.prev_task_defect_detail : '')
  const [saving, setSaving] = useState(false)

  // 前段タスクの「実施結果」（前担当者が記入した自由記述）
  const prevExt = (prevTask?.ext_data ?? {}) as Record<string, unknown>
  const prevExecutionResult = typeof prevExt.execution_result === 'string' ? prevExt.execution_result : ''

  if (!prevTask) return null

  // 〇はそのまま保存可。△・×は不備内容の記入を必須にする。
  const needsDetail = result === '軽微な不備' || result === 'やり直し'
  const canSave = result === '問題なし' || (needsDetail && detail.trim().length > 0)

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const supabase = createClient()
      const gyomu = (prevTask.phase ?? '').replace(/^Phase\d+[:：]\s*/, '').trim()
      // 評価を蓄積（前段の作業者に紐づく）。同じ(評価タスク,前段タスク)は上書き。
      const { error: revErr } = await supabase.from('task_reviews').upsert({
        case_id: task.case_id,
        reviewed_task_id: prevTask.id,
        reviewer_task_id: task.id,
        reviewed_member_id: prevTask.started_by ?? null,
        reviewer_member_id: currentMemberId,
        result,
        defect_detail: needsDetail ? detail.trim() : null,
        gyomu: gyomu || null,
      }, { onConflict: 'reviewer_task_id,reviewed_task_id' })
      if (revErr) throw revErr
      // カードの確認済表示用に現タスクにも残す
      const nextExt = {
        ...ext,
        prev_task_evaluation: result,
        prev_task_defect_detail: needsDetail ? detail.trim() : null,
        prev_task_reviewed_at: new Date().toISOString(),
        prev_task_reviewed_by: currentMemberId,
      }
      const { error: updErr } = await supabase.from('tasks').update({ ext_data: nextExt }).eq('id', task.id)
      if (updErr) throw updErr
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
      {/* ヘッダー */}
      <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4 text-amber-700 flex-shrink-0" strokeWidth={2.25} />
          <h3 className="text-[14px] font-bold text-amber-800">前段作業の確認</h3>
          {reviewed && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-green-700">
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.25} />確認済み
            </span>
          )}
        </div>
        <p className="text-[11px] text-amber-700/80 mt-0.5 leading-tight">前タスクの結果を確認してから着手しましょう</p>
      </div>

      <div className="p-4 space-y-4">
        {/* 前のタスク */}
        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-0.5">前のタスク</div>
          <Link href={`/tasks/${prevTask.id}`} className="text-[14px] font-bold text-brand-700 hover:underline inline-flex items-center gap-1">
            {prevTask.title}
          </Link>
          <div className="text-[11px] text-gray-400 mt-0.5">
            作業実施者：{performerName || '未設定'}　・　{completedDate || '未完了'} {completedDate && '完了'}
          </div>
        </div>

        {/* 前段作業の実施結果 */}
        <div>
          <div className="text-[13px] font-semibold text-gray-700 mb-1">前段作業の実施結果・引継ぎ事項</div>
          <div className={`px-3 py-2 rounded-lg border text-[13px] whitespace-pre-line min-h-[48px] ${
            prevExecutionResult ? 'bg-white border-gray-300 text-gray-800' : 'bg-gray-50 border-gray-200 text-gray-400 italic'
          }`}>
            {prevExecutionResult || '前担当者の実施結果・引継ぎ事項はまだ記入されていません'}
          </div>
        </div>

        {/* 評価（〇 問題なし / △ 軽微な不備 / × やり直し） */}
        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1.5">前段作業の評価 <span className="text-red-500">*</span></div>
          <div className="flex gap-2">
            {RATING_ORDER.map(r => {
              const meta = RATING_META[r]
              const on = result === r
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setResult(r)}
                  className={`flex-1 flex flex-col items-center gap-0.5 text-[12.5px] py-2 rounded-lg border transition-colors ${
                    on ? `${meta.onCls} border-2 font-semibold` : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-[19px] leading-none">{meta.mark}</span>
                  <span>{meta.label}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-1.5 text-[10.5px] text-gray-400 leading-relaxed">
            〇=問題なし ／ △=一部不備あり（軽微） ／ ×=やり直し・明確に不備
          </div>
        </div>

        {/* 不備内容（△・×のとき必須） */}
        {needsDetail && (
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1">不備内容 <span className="text-red-500">*</span></div>
            <textarea
              value={detail}
              onChange={e => setDetail(e.target.value)}
              rows={3}
              placeholder="例：江東区分の本籍地が旧表記のまま。請求先区が1件漏れ。"
              className="w-full px-3 py-2 text-[13px] border border-red-200 rounded-lg outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300"
            />
          </div>
        )}

        {/* 修正担当の注記 */}
        <div className="flex items-start gap-1.5 text-[11px] text-gray-600 bg-gray-50 rounded-lg px-2.5 py-2">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" strokeWidth={2} />
          <span>不備の修正は<span className="font-semibold">このタスクの担当者（あなた）</span>が行います。前段担当へは差し戻しません。</span>
        </div>

        {/* 記録ボタン */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className={`w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white shadow-sm transition-all ${
            !canSave || saving ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />}
          {reviewed ? '評価を更新する' : '確認して記録'}
        </button>
      </div>
    </div>
  )
}
