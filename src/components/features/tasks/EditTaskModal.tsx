'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { TASK_PRIORITIES } from '@/lib/constants'
import { GYOMU_ALL } from '@/lib/serviceMaster'
import { WORK_ROLES } from '@/lib/constants'
import type { WorkRole } from '@/types'
import type { TaskRow, MemberRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  task: TaskRow
  caseMap: Record<string, { case_number: string; deal_name: string }>
  allMembers: MemberRow[]
  onSaved: () => void
}

// 業務区分 = task.phase（旧データの "PhaseN:" 接頭辞を除く）。
// 以前はここで旧フェーズ（phase1〜6）を選ばせていて、保存すると業務名が壊れて
// 実務タブとの紐づき・凍結確認ゲートが外れていた。業務名（GYOMU_ALL）から選ぶ形に直した。
const gyomuOf = (phase: string | null | undefined) => (phase ?? '').replace(/^Phase\d+[:：]\s*/, '').trim()

// タスクの現在値からフォームの初期値を作る
const formOf = (task: TaskRow) => ({
  title: task.title,
  gyomu: gyomuOf(task.phase),
  priority: (task.priority === '外出タスク' ? '通常' : task.priority) as string,
  dueDate: task.due_date ?? '',
  category: task.category ?? '',
  workRole: (task.work_role ?? '') as WorkRole | '',
})

export default function EditTaskModal({ isOpen, onClose, task, caseMap, allMembers: _allMembers, onSaved }: Props) {
  const router = useRouter()
  const [form, setForm] = useState(() => formOf(task))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const caseInfo = caseMap[task.case_id]

  // 開くたび・別のタスクに切り替わるたびに初期化する。
  // effect の中で setState すると lint に止められるので、レンダー中に前回値と比べて入れ直す。
  const openKey = isOpen ? task.id : ''
  const [appliedKey, setAppliedKey] = useState(openKey)
  if (openKey !== appliedKey) {
    setAppliedKey(openKey)
    if (isOpen) { setForm(formOf(task)); setError('') }
  }

  // 現在の値がマスタに無い（旧データ・自由入力）ときも、選択肢に残して見えなくならないようにする
  const gyomuOptions = form.gyomu && !GYOMU_ALL.includes(form.gyomu) ? [form.gyomu, ...GYOMU_ALL] : GYOMU_ALL

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError('タスク名は必須です')
      return
    }

    setSaving(true)
    setError('')

    const supabase = createClient()

    const { error: updateErr } = await supabase
      .from('tasks')
      .update({
        title: form.title.trim(),
        // phase には業務名をそのまま入れる（実務タブ・凍結ゲート・工程バッジはこの名前で判定する）
        phase: form.gyomu || null,
        priority: form.priority,
        due_date: form.dueDate || null,
        category: form.category || null,
        work_role: form.workRole || null,
      })
      .eq('id', task.id)

    if (updateErr) {
      setError(`更新に失敗しました: ${updateErr.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="タスク編集"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" onClick={handleSubmit} loading={saving}>
            {saving ? '保存中...' : '保存する'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
        )}

        {/* Case link + detail page button */}
        {caseInfo && (
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <span className="text-[13px] text-gray-400">案件：</span>
            <span className="text-[14px] font-mono text-gray-500">{caseInfo.case_number}</span>
            <span className="text-[14px] font-medium text-gray-700 flex-1">{caseInfo.deal_name}</span>
            <button
              onClick={() => { onClose(); router.push(`/tasks/${task.id}`) }}
              className="text-[13px] font-semibold text-brand-700 px-2 py-1 rounded bg-brand-50 hover:bg-brand-100 transition"
            >
              タスク詳細 →
            </button>
            <button
              onClick={() => { onClose(); router.push(`/cases/${task.case_id}?tab=tasks`) }}
              className="text-[13px] font-medium text-gray-600 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-50 transition border border-gray-200 bg-white"
            >
              案件詳細 →
            </button>
          </div>
        )}

        {/* Task name */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">タスク名 *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>

        {/* 業務（実務タブ・実施業務と同じ名前） */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">業務</label>
          <select
            value={form.gyomu}
            onChange={e => setForm(p => ({ ...p, gyomu: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          >
            <option value="">（未設定）</option>
            {gyomuOptions.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* ステータスはボタンで進行するため編集不可 */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-[13px] text-gray-500">💡 ステータスはタスク一覧・詳細画面のボタンで進行します（着手前 → 作業進行中 → 完了）</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Due date */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-500 mb-1">期限</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-500 mb-1">カテゴリ</label>
            <input
              type="text"
              value={form.category}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              placeholder="例：金融機関、不動産、税務"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
        </div>

        {/* 担当区分 */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">
            担当区分 <span className="text-gray-400 font-normal">（誰がやる作業か）</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, workRole: '' }))}
              className={`px-3 py-1.5 text-[13px] font-medium rounded-lg border transition-colors ${
                form.workRole === '' ? 'ring-2 ring-brand-400 ring-offset-1 bg-gray-100 text-gray-700 border-gray-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              未設定
            </button>
            {WORK_ROLES.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => setForm(p => ({ ...p, workRole: r.key }))}
                className={`flex items-center gap-1 px-3 py-1.5 text-[13px] font-semibold rounded-lg border transition-colors ${
                  form.workRole === r.key ? `ring-2 ring-brand-400 ring-offset-1 ${r.solid} border-transparent` : r.pill
                }`}
              >
                <r.Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">優先度</label>
          <div className="flex gap-1.5">
            {TASK_PRIORITIES.map(p => (
              <button
                key={p.key}
                onClick={() => setForm(prev => ({ ...prev, priority: p.key }))}
                className={`flex-1 px-3 py-1.5 text-[13px] font-medium rounded-lg border transition-colors ${
                  form.priority === p.key ? 'ring-2 ring-brand-400 ring-offset-1' : ''
                } ${p.style}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* 着手情報（読み取り専用） */}
        {task.started_by && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <span className="text-[13px] text-green-700 font-medium">
              着手済み {task.started_at && `(${new Date(task.started_at).toLocaleDateString('ja-JP')})`}
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}
