'use client'

// タスク完了ゲート（v3）。事務管理タスク(task_kind!=='system')を完了するとき必ず通す。
//   1) 実施結果・引継ぎ事項（必須）
//   2) 次に着手できるタスクを指定（無ければ「該当なし」）。各タスクは経路を選ぶ:
//        ・今すぐ着手OK   → ext_data.ready_reason（着手OK理由）
//        ・受領次第OK     → ext_data.ready_on_receipt=true + ready_wait_note（何の受領待ちか）
//      候補に無ければその場で新規タスクを追加（区分=事務/管理 も選ぶ）。
//   3) 次が判断できないときは「管理担当に確認」→ 管理担当確認タスクを起票し通知。
//   いずれの次タスクにも ext_data.ready_from_task_id（このタスク）を記録し前段表示に使う。

import { useEffect, useMemo, useState } from 'react'
import { Loader2, CheckCircle2, ArrowRight, Plus, HelpCircle, Compass, Puzzle, Package } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import TaskKeywordNudge from '@/components/features/tasks/TaskKeywordNudge'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { normalizeTaskStatus, getStartSignal, isWaitingReceipt } from '@/lib/taskReadiness'
import { koteiOf, koteiRank } from '@/lib/kotei'
import { KoteiBadge, GyomuBadge } from '@/components/ui/KoteiBadge'
import { createManagerReviewTask, type HelpType } from '@/lib/managerReviewTask'
import type { TaskRow } from '@/types'

type Cand = { id: string; title: string; phase: string | null; sort_order: number | null; status: string; ext_data?: Record<string, unknown> | null }
type Mode = 'now' | 'receipt'

// 着手OK経路に応じた ext_data を作る
function extForMode(base: Record<string, unknown>, mode: Mode, note: string, fromTaskId: string): Record<string, unknown> {
  const n = note.trim()
  if (mode === 'receipt') {
    return { ...base, ready_on_receipt: true, ready_wait_note: n, ready_reason: null, ready_from_task_id: fromTaskId }
  }
  return { ...base, ready_reason: n || '着手OK', ready_on_receipt: false, ready_wait_note: null, ready_from_task_id: fromTaskId }
}

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
  const [mode, setMode] = useState<Record<string, Mode>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [work, setWork] = useState<Record<string, string>>({})  // 次タスクの作業内容（任意・先に記入）
  const [noNext, setNoNext] = useState(false)
  const [showOthers, setShowOthers] = useState(false)

  // 新規追加タスク
  const [newTitle, setNewTitle] = useState('')
  const [newRole, setNewRole] = useState<'assistant' | 'manager'>('assistant')
  const [newMode, setNewMode] = useState<Mode>('now')
  const [newNote, setNewNote] = useState('')

  // 管理担当ヘルプ（完了時は①次を教えて／②巻き取り）
  const [mgrOn, setMgrOn] = useState(false)
  const [mgrType, setMgrType] = useState<Extract<HelpType, 'next_unknown' | 'too_hard'>>('next_unknown')
  const [mgrContent, setMgrContent] = useState('')

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase.from('tasks')
        .select('id,title,phase,sort_order,status,task_kind,ext_data')
        .eq('case_id', task.case_id)
        .order('sort_order')
      const rows = ((data ?? []) as Array<Cand & { task_kind: string | null }>)
        .filter(t => {
          if (t.id === task.id || t.task_kind === 'system') return false
          // 着手前のタスクだけが対象（対応中＝着手済み・完了は候補にしない）
          if (normalizeTaskStatus(t.status) !== '着手前') return false
          // 既に着手OK／受領次第OK のタスクは「次に着手できる」候補から除外（引き上げる意味がないため）
          const tr = t as unknown as TaskRow
          if (getStartSignal(tr).ready || isWaitingReceipt(tr)) return false
          return true
        })
      setCands(rows)
      setLoading(false)
    })()
  }, [task.case_id, task.id])

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
  const modeOf = (id: string): Mode => mode[id] ?? 'now'
  // 複数選択OK。「今すぐ着手OK」は理由を任意（空なら「着手OK」）、
  // 「受領次第OK」だけ何の受領待ちかの入力を必須にする。
  const selectedOk = selectedIds.every(id => modeOf(id) !== 'receipt' || (note[id] ?? '').trim().length > 0)
  const newOk = !newTitle.trim() || newMode !== 'receipt' || newNote.trim().length > 0
  const mgrOk = !mgrOn || mgrContent.trim().length > 0
  const hasAction = noNext || selectedIds.length > 0 || newTitle.trim().length > 0 || (mgrOn && mgrContent.trim().length > 0)
  const canSubmit = result.trim().length > 0 && selectedOk && newOk && mgrOk && hasAction

  const toggle = (id: string) => { setNoNext(false); setSel(prev => ({ ...prev, [id]: !prev[id] })) }

  const submit = async () => {
    if (!canSubmit || saving) return
    setSaving(true)
    const supabase = createClient()

    // 1) 完了本体（実施結果をmerge）
    const ext = { ...((task.ext_data ?? {}) as Record<string, unknown>), execution_result: result.trim() }
    const { error } = await supabase.from('tasks').update({ status: '完了', ext_data: ext }).eq('id', task.id)
    if (error) { setSaving(false); showToast(`完了に失敗しました: ${error.message}`, 'error'); return }

    // 2) 選んだ既存タスクに着手OK / 受領次第OK を付与（着手前のものだけ）
    if (selectedIds.length > 0) {
      const { data: rows } = await supabase.from('tasks').select('id, ext_data, status').in('id', selectedIds)
      for (const row of (rows ?? []) as Array<{ id: string; ext_data: Record<string, unknown> | null; status: string }>) {
        if (normalizeTaskStatus(row.status) !== '着手前') continue
        const next = extForMode(row.ext_data ?? {}, modeOf(row.id), note[row.id] ?? '', task.id)
        const patch: Record<string, unknown> = { ext_data: next }
        const wc = (work[row.id] ?? '').trim()
        if (wc) patch.procedure_text = wc  // 先に記入した作業内容を次タスクへ反映
        await supabase.from('tasks').update(patch).eq('id', row.id)
      }
    }

    // 3) 新規タスクを追加して着手OK / 受領次第OK
    if (newTitle.trim()) {
      const newExt = extForMode({}, newMode, newNote, task.id)
      await supabase.from('tasks').insert({
        case_id: task.case_id, title: newTitle.trim(), task_kind: 'case', work_role: newRole,
        phase: task.phase ?? '', category: task.phase ?? '', status: '着手前', priority: '通常',
        ext_data: newExt, sort_order: 99,
      })
    }

    // 4) 管理担当ヘルプタスク
    if (mgrOn && mgrContent.trim()) {
      await createManagerReviewTask({ caseId: task.case_id, content: mgrContent.trim(), helpType: mgrType, fromTaskTitle: task.title, fromTaskId: task.id, requestedBy: memberId })
    }

    // 5) 活動履歴
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

  // 着手OK / 受領次第OK のトグル＋理由欄（既存・新規で共用）。
  // ※ コンポーネントではなく関数として呼ぶ（入力中のフォーカス喪失を防ぐ）
  const renderModePicker = ({ value, onChange, note: nv, onNote, idKey }: { value: Mode; onChange: (m: Mode) => void; note: string; onNote: (v: string) => void; idKey: string }) => (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <button type="button" onClick={() => onChange('now')} className={`flex-1 text-center text-[12px] py-1 rounded-md border transition-colors ${value === 'now' ? 'bg-emerald-50 text-emerald-700 border-emerald-300 border-2 font-semibold' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>今すぐ着手OK</button>
        <button type="button" onClick={() => onChange('receipt')} className={`flex-1 inline-flex items-center justify-center gap-1 text-[12px] py-1 rounded-md border transition-colors ${value === 'receipt' ? 'bg-amber-50 text-amber-800 border-amber-300 border-2 font-semibold' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}><Package className="w-3 h-3" strokeWidth={2} />受領次第OK</button>
      </div>
      <input
        type="text"
        value={nv}
        onChange={e => onNote(e.target.value)}
        placeholder={value === 'receipt' ? '何の受領待ちか（例：戸籍一式が届いたら）' : '着手OK理由（任意・例：相続人が確定したため）'}
        className={`w-full px-2.5 py-1.5 text-[12px] border rounded-lg outline-none ${value === 'receipt' ? 'border-amber-200 bg-amber-50/40 focus:border-amber-400' : 'border-emerald-200 bg-emerald-50/30 focus:border-emerald-400'}`}
        data-key={idKey}
      />
    </div>
  )

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
          <div className="px-2.5 pb-2 space-y-1.5">
            {renderModePicker({ value: modeOf(c.id), onChange: m => setMode(prev => ({ ...prev, [c.id]: m })), note: note[c.id] ?? '', onNote: v => setNote(prev => ({ ...prev, [c.id]: v })), idKey: c.id })}
            <div>
              <div className="text-[10.5px] text-gray-400 mb-0.5">作業内容（任意・先に書いておける）</div>
              <textarea
                value={work[c.id] ?? ''}
                onChange={e => setWork(prev => ({ ...prev, [c.id]: e.target.value }))}
                rows={2}
                placeholder="例：墨田区分の戸籍を読み込み、相関図に反映。転籍先を確認。"
                className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-brand-500 bg-gray-50/60 focus:bg-white resize-none"
                data-key={`work-${c.id}`}
              />
            </div>
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
            <ArrowRight className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />次に着手できるタスク
            <span className="ml-1 font-normal text-gray-400">（複数選択できます / 無ければ「該当なし」）</span>
          </label>
          {loading ? (
            <div className="py-5 text-center text-[12px] text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />読み込み中…</div>
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

          {/* 候補に無い → 新規追加（区分＋経路） */}
          <div className="mt-2 rounded-lg border border-dashed border-gray-300 px-2.5 py-2 space-y-2">
            <div className="text-[11.5px] text-gray-500 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" />候補に無い → タスクを追加</div>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="追加するタスク名（任意）"
              className="w-full px-2.5 py-1.5 text-[12.5px] border border-gray-200 rounded-lg outline-none focus:border-brand-400"
            />
            <TaskKeywordNudge title={newTitle} caseId={task.case_id} />
            {newTitle.trim() && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500">区分</span>
                  <button type="button" onClick={() => setNewRole('manager')} className={`inline-flex items-center gap-1 text-[11.5px] px-2 py-0.5 rounded-md border ${newRole === 'manager' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200'}`}><Compass className="w-3 h-3" />管理担当</button>
                  <button type="button" onClick={() => setNewRole('assistant')} className={`inline-flex items-center gap-1 text-[11.5px] px-2 py-0.5 rounded-md border ${newRole === 'assistant' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200'}`}><Puzzle className="w-3 h-3" />事務管理</button>
                </div>
                {renderModePicker({ value: newMode, onChange: setNewMode, note: newNote, onNote: setNewNote, idKey: 'new' })}
              </>
            )}
          </div>

          {/* 管理担当にヘルプ（完了時＝①次を教えて／②巻き取り） */}
          <div className={`mt-2 rounded-lg border px-2.5 py-2 transition-colors ${mgrOn ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={mgrOn} onChange={e => setMgrOn(e.target.checked)} className="w-4 h-4 accent-amber-500" />
              <HelpCircle className="w-3.5 h-3.5 text-amber-600" strokeWidth={2} />
              <span className="text-[12.5px] font-semibold text-amber-800">管理担当にヘルプを依頼</span>
            </label>
            {mgrOn && (
              <div className="mt-2 space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { key: 'next_unknown', label: '次が分からない', sub: '次を教えてほしい' },
                    { key: 'too_hard', label: '次が難しい', sub: '巻き取ってほしい' },
                  ] as const).map(o => {
                    const on = mgrType === o.key
                    return (
                      <button key={o.key} type="button" onClick={() => setMgrType(o.key)}
                        className={`text-left px-2.5 py-1.5 rounded-lg border text-[12px] transition-colors ${on ? 'border-2 border-amber-400 bg-white' : 'border-gray-200 bg-white hover:bg-amber-50/40'}`}>
                        <div className={`font-semibold ${on ? 'text-amber-800' : 'text-gray-700'}`}>{o.label}</div>
                        <div className="text-[10.5px] text-gray-500">{o.sub}</div>
                      </button>
                    )
                  })}
                </div>
                <textarea
                  value={mgrContent}
                  onChange={e => setMgrContent(e.target.value)}
                  rows={2}
                  placeholder={mgrType === 'too_hard' ? '巻き取ってほしいタスク・難しい理由' : '次に何をすべきか分からない点・状況'}
                  className="w-full px-2.5 py-1.5 text-[12px] border border-amber-200 bg-white rounded-lg outline-none focus:border-amber-400"
                />
              </div>
            )}
          </div>

          <label className={`mt-2 flex items-center gap-2 text-[12.5px] rounded-lg px-2.5 py-1.5 cursor-pointer border transition-colors ${noNext ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white border-dashed border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            <input type="checkbox" checked={noNext} onChange={e => { setNoNext(e.target.checked); if (e.target.checked) setSel({}) }} className="w-4 h-4 accent-gray-500" />
            該当なし（次に進められるタスクはまだ無い）
          </label>
        </div>
      </div>
    </Modal>
  )
}
