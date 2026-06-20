'use client'

import { useEffect, useState } from 'react'
import { Trash2, Plus, ListChecks } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { SectionHeading } from '@/components/ui/InlineFields'
import { getCaseStatusLabel } from '@/lib/constants'

// 受注担当/管理担当タスクのサブ分類（Phaseは事務管理タスク専用なのでここでは使わない）
const ADD_CATEGORIES = ['初期対応', '契約手続き残']

// ステータス別に「初期対応タスク」として確認対象にするシステムタスク（template_key）。
// 056/076 の generate_system_tasks_on_status_change が生成するものに対応。
// ※ 初期タスクあげ（sys_initial_tasks_create）は廃止（migration 107）。
const INITIAL_TASK_KEYS: Record<string, string[]> = {
  受注: [
    'sys_order_sheet',
    'sys_contract_send',
    'sys_case_handover',
    'sys_advance_invoice',
    'sys_advance_payment_confirm',
  ],
  検討中: ['sys_review_status'],
  '検討中（契約書待ち）': ['sys_review_status', 'sys_contract_send'],
}

type GenRow = { id: string; title: string; keep: boolean }
type AddRow = { title: string; category: string }

type Props = {
  isOpen: boolean
  status: string | null // このポップアップを開いた契機のステータス
  caseId: string
  onApplied: () => void // 反映後（refresh等は呼び出し側）
  onClose: () => void
}

/**
 * 初期対応タスクの確認ポップアップ。
 * ステータスが受注/検討中/検討中（契約書待ち）に変わると、DBトリガーが初期タスクを自動生成する。
 * 生成済みタスクを一覧し、不要なものはチェックを外して削除、必要なものを追加できるようにする。
 * （生成前確認ではなく「生成後レビュー」方式。トリガーは常に生成し、ここで取捨選択する。）
 */
export default function InitialTaskReviewModal({ isOpen, status, caseId, onApplied, onClose }: Props) {
  // 親で key={status} により契機ステータスごとに再マウントするため、初期状態でリセットされる。
  const [rows, setRows] = useState<GenRow[]>([])
  const [adds, setAdds] = useState<AddRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const keys = status ? INITIAL_TASK_KEYS[status] ?? [] : []
    if (keys.length === 0) return
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('tasks')
        .select('id, title, sort_order')
        .eq('case_id', caseId)
        .eq('task_kind', 'system')
        .in('template_key', keys)
        .neq('status', '完了')
        .order('sort_order', { ascending: true })
      if (cancelled) return
      setRows((data ?? []).map(t => ({ id: t.id as string, title: t.title as string, keep: true })))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [status, caseId])

  const apply = async () => {
    setSaving(true)
    const supabase = createClient()

    // ① チェックを外したタスクを削除（依存・担当も先に削除）
    const toDelete = rows.filter(r => !r.keep).map(r => r.id)
    if (toDelete.length > 0) {
      await supabase.from('task_assignees').delete().in('task_id', toDelete)
      await supabase
        .from('task_dependencies')
        .delete()
        .or(`from_task_id.in.(${toDelete.join(',')}),to_task_id.in.(${toDelete.join(',')})`)
      const { error } = await supabase.from('tasks').delete().in('id', toDelete)
      if (error) { setSaving(false); showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    }

    // ② 追加タスク（タイトル入力済みのみ）を受注担当/管理担当タスク（system）として作成。
    //    Phaseは使わず、サブ分類(初期対応/契約手続き残)を category に持たせる。
    const newTasks = adds
      .filter(a => a.title.trim())
      .map(a => ({
        case_id: caseId,
        title: a.title.trim(),
        task_kind: 'system',
        phase: 'system',
        category: a.category,
        status: '着手前',
        priority: '通常',
        sort_order: 99,
      }))
    if (newTasks.length > 0) {
      const { error } = await supabase.from('tasks').insert(newTasks)
      if (error) { setSaving(false); showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
    }

    setSaving(false)
    const removed = toDelete.length
    const added = newTasks.length
    if (removed || added) {
      showToast(`初期タスクを更新しました（削除${removed}件 / 追加${added}件）`, 'success')
    }
    onApplied()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-brand-600" />
          初期対応タスクの確認
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>このまま生成</Button>
          <Button variant="primary" onClick={apply} loading={saving}>この内容で確定</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-gray-500 leading-relaxed">
          {status ? `「${getCaseStatusLabel(status)}」` : ''}に伴い、以下の初期タスクを生成しました。
          <br />
          不要なタスクはチェックを外すと削除されます。必要なタスクは下部で追加できます。
        </p>

        {/* 生成済みタスク（チェックを外す＝削除） */}
        <div>
          <SectionHeading title="生成された初期タスク" className="mb-2" />
          {loading ? (
            <div className="text-[13px] text-gray-400 px-1 py-3">読み込み中...</div>
          ) : rows.length === 0 ? (
            <div className="text-[13px] text-gray-400 bg-gray-50 rounded-lg px-3 py-3 border border-gray-100">
              生成された初期タスクはありません。
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {rows.map(r => (
                <label
                  key={r.id}
                  className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                    r.keep ? 'hover:bg-gray-50' : 'bg-red-50/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={r.keep}
                    onChange={e => setRows(prev => prev.map(x => (x.id === r.id ? { ...x, keep: e.target.checked } : x)))}
                    className="w-4 h-4 accent-brand-600 shrink-0"
                  />
                  <span className={`text-[13px] ${r.keep ? 'text-gray-700' : 'text-gray-400 line-through'}`}>
                    {r.title}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* 追加タスク */}
        <div>
          <SectionHeading title="タスクを追加" className="mb-2" />
          {adds.length > 0 && (
            <div className="space-y-2 mb-2">
              {adds.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={a.title}
                    onChange={e => setAdds(prev => prev.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)))}
                    placeholder="タスク名"
                    className="flex-1 px-2.5 py-1.5 text-[13px] border border-gray-300 rounded-lg outline-none focus:border-brand-500"
                  />
                  <select
                    value={a.category}
                    onChange={e => setAdds(prev => prev.map((x, idx) => (idx === i ? { ...x, category: e.target.value } : x)))}
                    className="px-2 py-1.5 text-[12px] border border-gray-300 rounded-lg bg-white outline-none focus:border-brand-500"
                  >
                    {ADD_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setAdds(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-gray-300 hover:text-red-500"
                    title="削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setAdds(prev => [...prev, { title: '', category: '初期対応' }])}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"
          >
            <Plus className="w-3.5 h-3.5" /> タスクを追加
          </button>
        </div>
      </div>
    </Modal>
  )
}
