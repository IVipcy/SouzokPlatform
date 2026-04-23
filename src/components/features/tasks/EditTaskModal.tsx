'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import { TASK_PRIORITIES } from '@/lib/constants'
import { DB_PHASES, getPhaseLabel } from '@/lib/phases'
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

export default function EditTaskModal({ isOpen, onClose, task, caseMap, allMembers, onSaved }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    title: '',
    phase: 'phase1' as string,
    priority: '通常' as string,
    dueDate: '',
    category: '',
    workRole: '' as WorkRole | '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const caseInfo = caseMap[task.case_id]

  useEffect(() => {
    if (isOpen && task) {
      setForm({
        title: task.title,
        phase: task.phase,
        priority: task.priority === '外出タスク' ? '通常' : task.priority,
        dueDate: task.due_date ?? '',
        category: task.category ?? '',
        workRole: (task.work_role ?? '') as WorkRole | '',
      })
      setError('')
    }
  }, [isOpen, task])

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
        phase: form.phase,
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
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? '保存中...' : '保存する'}
          </button>
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
            <span className="text-[11px] text-gray-400">案件：</span>
            <span className="text-[12px] font-mono text-gray-500">{caseInfo.case_number}</span>
            <span className="text-[12px] font-medium text-gray-700 flex-1">{caseInfo.deal_name}</span>
            <button
              onClick={() => { onClose(); router.push(`/tasks/${task.id}`) }}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition border border-blue-200 bg-white"
            >
              タスク詳細 →
            </button>
            <button
              onClick={() => { onClose(); router.push(`/cases/${task.case_id}?tab=tasks`) }}
              className="text-[11px] font-medium text-gray-600 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-50 transition border border-gray-200 bg-white"
            >
              案件詳細 →
            </button>
          </div>
        )}

        {/* Task name */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">タスク名 *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Phase */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">フェーズ</label>
          <select
            value={form.phase}
            onChange={e => setForm(p => ({ ...p, phase: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            {DB_PHASES.map(p => <option key={p} value={p}>{getPhaseLabel(p)}</option>)}
          </select>
        </div>

        {/* ステータスはボタンで進行するため編集不可 */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-[11px] text-gray-500">💡 ステータスはタスク一覧・詳細画面のボタンで進行します（着手前 → 対応中 → 完了）</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Due date */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">期限</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">カテゴリ</label>
            <input
              type="text"
              value={form.category}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              placeholder="例：金融機関、不動産、税務"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* 担当区分 */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">
            担当区分 <span className="text-gray-400 font-normal">（誰がやる作業か）</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, workRole: '' }))}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                form.workRole === '' ? 'ring-2 ring-blue-400 ring-offset-1 bg-gray-100 text-gray-700 border-gray-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              未設定
            </button>
            {WORK_ROLES.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => setForm(p => ({ ...p, workRole: r.key }))}
                className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                  form.workRole === r.key ? `ring-2 ring-blue-400 ring-offset-1 ${r.solid} border-transparent` : r.pill
                }`}
              >
                <span>{r.icon}</span>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">優先度</label>
          <div className="flex gap-1.5">
            {TASK_PRIORITIES.map(p => (
              <button
                key={p.key}
                onClick={() => setForm(prev => ({ ...prev, priority: p.key }))}
                className={`flex-1 px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                  form.priority === p.key ? 'ring-2 ring-blue-400 ring-offset-1' : ''
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
            <span className="text-[11px] text-green-700 font-medium">
              着手済み {task.started_at && `(${new Date(task.started_at).toLocaleDateString('ja-JP')})`}
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}
