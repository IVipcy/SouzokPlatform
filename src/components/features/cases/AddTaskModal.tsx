'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import { DB_PHASES, getPhaseLabel } from '@/lib/phases'
import type { MemberRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseId: string
  allMembers: MemberRow[]
  onSaved: () => void
}

const PRIORITIES = [
  { key: '通常', label: '通常', style: 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50' },
  { key: '急ぎ', label: '🚨 急ぎ', style: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' },
  { key: '外出タスク', label: '🚗 外出', style: 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50' },
] as const

export default function AddTaskModal({ isOpen, onClose, caseId, allMembers, onSaved }: Props) {
  const [form, setForm] = useState({
    title: '',
    phase: 'phase1' as string,
    primaryAssignee: '',
    subAssignees: [] as string[],
    dueDate: '',
    priority: '通常' as string,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError('タスク名は必須です')
      return
    }

    setSaving(true)
    setError('')

    const supabase = createClient()

    // Insert task
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .insert({
        case_id: caseId,
        title: form.title.trim(),
        phase: form.phase,
        category: '',
        status: '未着手',
        priority: form.priority,
        due_date: form.dueDate || null,
        sort_order: 99,
      })
      .select('id')
      .single()

    if (taskErr || !task) {
      setError(`追加に失敗しました: ${taskErr?.message}`)
      setSaving(false)
      return
    }

    // Insert assignees
    const assignees = []
    if (form.primaryAssignee) {
      assignees.push({ task_id: task.id, member_id: form.primaryAssignee, role: 'primary' })
    }
    for (const subId of form.subAssignees) {
      assignees.push({ task_id: task.id, member_id: subId, role: 'sub' })
    }
    if (assignees.length > 0) {
      await supabase.from('task_assignees').insert(assignees)
    }

    setSaving(false)
    setForm({ title: '', phase: 'phase1', primaryAssignee: '', subAssignees: [], dueDate: '', priority: '通常' })
    onSaved()
    onClose()
  }

  const toggleSub = (memberId: string) => {
    setForm(prev => ({
      ...prev,
      subAssignees: prev.subAssignees.includes(memberId)
        ? prev.subAssignees.filter(id => id !== memberId)
        : [...prev.subAssignees, memberId],
    }))
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="＋ タスク追加"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '追加中...' : '追加する'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
        )}

        {/* Task name */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">タスク名 *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="例：三菱UFJ銀行 残高証明取得"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Phase */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">フェーズ</label>
            <select
              value={form.phase}
              onChange={e => setForm(p => ({ ...p, phase: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {DB_PHASES.map(p => (
                <option key={p} value={p}>{getPhaseLabel(p)}</option>
              ))}
            </select>
          </div>

          {/* Primary assignee */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">主担当</label>
            <select
              value={form.primaryAssignee}
              onChange={e => setForm(p => ({ ...p, primaryAssignee: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">未割当</option>
              {allMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Sub assignees */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">副担当（複数可）</label>
          <div className="flex flex-wrap gap-1.5">
            {allMembers.map(m => (
              <button
                key={m.id}
                onClick={() => toggleSub(m.id)}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white transition-all ${
                  form.subAssignees.includes(m.id)
                    ? 'ring-2 ring-blue-400 ring-offset-1'
                    : 'opacity-40 hover:opacity-70'
                }`}
                style={{ backgroundColor: m.avatar_color }}
                title={m.name}
              >
                {m.name.charAt(0)}
              </button>
            ))}
          </div>
        </div>

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

        {/* Priority */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">優先度</label>
          <div className="flex gap-1.5">
            {PRIORITIES.map(p => (
              <button
                key={p.key}
                onClick={() => setForm(prev => ({ ...prev, priority: p.key }))}
                className={`flex-1 px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                  form.priority === p.key
                    ? 'ring-2 ring-blue-400 ring-offset-1'
                    : ''
                } ${p.style}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
