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
] as const

export default function AddTaskModal({ isOpen, onClose, caseId, allMembers, onSaved }: Props) {
  const [form, setForm] = useState({
    title: '',
    phase: 'phase1' as string,
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

    const { error: taskErr } = await supabase
      .from('tasks')
      .insert({
        case_id: caseId,
        title: form.title.trim(),
        phase: form.phase,
        category: '',
        status: '着手前',
        priority: form.priority,
        due_date: form.dueDate || null,
        sort_order: 99,
      })

    if (taskErr) {
      setError(`追加に失敗しました: ${taskErr.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    setForm({ title: '', phase: 'phase1', dueDate: '', priority: '通常' })
    onSaved()
    onClose()
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

        <div className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          💡 タスクの担当は事前に割り振りません。パートタイマーが出勤時にタスク一覧から「着手する」で開始します。
        </div>
      </div>
    </Modal>
  )
}
