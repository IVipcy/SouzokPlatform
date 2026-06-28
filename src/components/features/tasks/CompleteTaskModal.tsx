'use client'

// タスク完了ゲート。事務管理タスク(task_kind!=='system')を完了するとき必ず通す。
//   1) 実施結果・引継ぎ事項（必須）
//   2) 次に着手できるタスクを1つ以上選んで着手OK理由を記載（無ければ「該当なし」）
// 選んだ次タスクには ext_data.ready_reason を立て、着手OKにする。
// 着手は別（このモーダルは完了のみ）。

import { useEffect, useMemo, useState } from 'react'
import { Loader2, CheckCircle2, ArrowRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { normalizeTaskStatus } from '@/lib/taskReadiness'
import { koteiOf, koteiRank } from '@/lib/kotei'
import { KoteiBadge, GyomuBadge } from '@/components/ui/KoteiBadge'
import type { TaskRow } from '@/types'

type Cand = { id: string; title: string; phase: string | null; sort_order: number | null; status: string }

export default function CompleteTaskModal({ task, onClose, onCompleted }: {
  task: TaskRow
  onClose: () => void
  onCompleted: () => void
}) {
  const memberId = useCurrentMember(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cands, setCands] = useState<Cand[]>([])

  const initialResult = (() => {
    const ext = (task.ext_data ?? {}) as Record<string, unknown>
    return typeof ext.execution_result === 'string' ? ext.execution_result : ''
  })()
  const [result, setResult] = useState(initialResult)
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [noNext, setNoNext] = useState(false)
  const [showOthers, setShowOthers] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase.from('tasks')
        .select('id,title,phase,sort_order,status,task_kind')
        .eq('case_id', task.case_id)
        .order('sort_order')
      const rows = ((data ?? []) as Array<Cand & { task_kind: string | null }>)
        .filter(t => t.id !== task.id && t.task_kind !== 'system' && normalizeTaskStatus(t.status) !== '完了')
      setCands(rows)
      setLoading(false)
    })()
  }, [task.case_id, task.id])

  // 同じ工程＋次工程を「おすすめ」、それ以外を折りたたみ
  const curRank = koteiRank(koteiOf(task.phase))
  const { recommend, others } = useMemo(() => {
    const rec: Cand[] = [], oth: Cand[] = []
    for (const c of cands) {
      const r = koteiRank(koteiOf(c.phase))
      if (r === curRank || r === curRank + 1) rec.push(c); else oth.push(c)
    }
    const bySort = (a: Cand, b: Cand) => koteiRank(koteiOf(a.phase)) - koteiRank(koteiOf(b.phase)) || (a.sort_order ?? 0) - (b.sort_order ?? 0)
    return { recommend: rec.sort(bySort), others: oth.sort(bySort) }
  }, [cands, curRank])

  const selectedIds = Object.keys(sel).filter(id => sel[id])
  const canSubmit = result.trim().length > 0 && (noNext || selectedIds.length > 0)

  const toggle = (id: string) => {
    setNoNext(false)
    setSel(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const submit = async () => {
    if (!canSubmit || saving) return
    setSaving(true)
    const supabase = createClient()

    // 1) 完了本体（実施結果をmerge）
    const ext = { ...((task.ext_data ?? {}) as Record<string, unknown>), execution_result: result.trim() }
    const { error } = await supabase.from('tasks').update({ status: '完了', ext_data: ext }).eq('id', task.id)
    if (error) { setSaving(false); showToast(`完了に失敗しました: ${error.message}`, 'error'); return }

    // 2) 選んだ次タスクに着手OK旗（理由をmerge）。着手前のものだけ。
    if (!noNext && selectedIds.length > 0) {
      const { data: rows } = await supabase.from('tasks').select('id, ext_data, status').in('id', selectedIds)
      for (const row of (rows ?? []) as Array<{ id: string; ext_data: Record<string, unknown> | null; status: string }>) {
        if (normalizeTaskStatus(row.status) !== '着手前') continue
        const reason = (reasons[row.id] ?? '').trim() || `${task.title}が完了したため`
        // 着手OKにした元タスク（このタスクを完了したことで着手可になった）を記録。
        // 後続タスクを開いたとき、前段作業の確認でこの元タスクを優先表示する。
        const next = { ...(row.ext_data ?? {}), ready_reason: reason, ready_from_task_id: task.id }
        await supabase.from('tasks').update({ ext_data: next }).eq('id', row.id)
      }
    }

    // 3) 活動履歴
    if (memberId) {
      await supabase.from('case_activities').insert({
        case_id: task.case_id, task_id: task.id, member_id: memberId,
        activity_type: 'task_completed',
        description: `${task.title} を完了`,
        activity_date: new Date().toISOString().split('T')[0],
      })
    }

    setSaving(false)
    showToast(`「${task.title}」を完了しました`, 'success')
    onCompleted()
  }

  const renderCand = (c: Cand) => {
    const on = !!sel[c.id]
    return (
      <div key={c.id} className={`rounded-lg border transition-colors ${on ? 'border-brand-300 bg-brand-50/60' : 'border-gray-200'}`}>
        <label className="flex items-center gap-2 px-2.5 py-2 cursor-pointer">
          <input type="checkbox" checked={on} onChange={() => toggle(c.id)} className="w-4 h-4 accent-brand-600" />
          <KoteiBadge phase={c.phase} width={92} />
          <GyomuBadge phase={c.phase} width={52} />
          <span className="text-[13px] text-gray-800 truncate">{c.title}</span>
        </label>
        {on && (
          <div className="px-2.5 pb-2">
            <input
              type="text"
              value={reasons[c.id] ?? ''}
              onChange={e => setReasons(prev => ({ ...prev, [c.id]: e.target.value }))}
              placeholder="着手OK理由（例：相続人が確定したため）"
              className="w-full px-2.5 py-1.5 text-[12px] border border-amber-200 bg-amber-50/40 rounded-lg outline-none focus:border-amber-400"
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="タスクを完了する"
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!canSubmit}>
            <CheckCircle2 className="w-4 h-4" /> 完了する
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="text-[13px] font-semibold text-gray-700 mb-1">「{task.title}」</div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">実施結果・引継ぎ事項 <span className="text-red-500">*</span></label>
          <textarea
            value={result}
            onChange={e => setResult(e.target.value)}
            rows={3}
            placeholder="何をして、どうなったか。次の担当への引継ぎ事項も。"
            className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">
            <ArrowRight className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />次に着手できるタスク <span className="text-red-500">*</span>
            <span className="ml-1 font-normal text-gray-400">（1つ以上 / 無ければ「該当なし」）</span>
          </label>
          {loading ? (
            <div className="py-5 text-center text-[12px] text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />読み込み中…</div>
          ) : cands.length === 0 ? (
            <p className="text-[12px] text-gray-400 mb-2">この案件に他の未完了タスクはありません。</p>
          ) : (
            <div className="space-y-1.5">
              {recommend.length > 0 && <div className="text-[10.5px] text-gray-400">同じ工程・次の工程</div>}
              {recommend.map(renderCand)}
              {others.length > 0 && (showOthers
                ? <><div className="text-[10.5px] text-gray-400 mt-1">その他の工程</div>{others.map(renderCand)}</>
                : <button type="button" onClick={() => setShowOthers(true)} className="text-[12px] text-brand-600 hover:text-brand-700 font-semibold">＋ 他の工程のタスクも表示（{others.length}）</button>
              )}
            </div>
          )}
          <label className={`mt-2 flex items-center gap-2 text-[12.5px] rounded-lg px-2.5 py-1.5 cursor-pointer border transition-colors ${noNext ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white border-dashed border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            <input type="checkbox" checked={noNext} onChange={e => { setNoNext(e.target.checked); if (e.target.checked) setSel({}) }} className="w-4 h-4 accent-gray-500" />
            該当なし（次に進められるタスクはまだ無い）
          </label>
        </div>
      </div>
    </Modal>
  )
}
