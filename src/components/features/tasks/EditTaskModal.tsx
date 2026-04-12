'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/constants'
import { DB_PHASES, getPhaseLabel } from '@/lib/phases'
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
    status: '未着手' as string,
    phase: 'phase1' as string,
    priority: '通常' as string,
    dueDate: '',
    category: '',
    primaryAssignee: '',
    subAssignees: [] as string[],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const caseInfo = caseMap[task.case_id]

  useEffect(() => {
    if (isOpen && task) {
      const primary = task.task_assignees?.find(a => a.role === 'primary')
      const subs = task.task_assignees?.filter(a => a.role === 'sub').map(a => a.member_id) ?? []
      setForm({
        title: task.title,
        status: task.status,
        phase: task.phase,
        priority: task.priority === '外出タスク' ? '通常' : task.priority,
        dueDate: task.due_date ?? '',
        category: task.category ?? '',
        primaryAssignee: primary?.member_id ?? '',
        subAssignees: subs,
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
        status: form.status,
        phase: form.phase,
        priority: form.priority,
        due_date: form.dueDate || null,
        category: form.category || null,
      })
      .eq('id', task.id)

    if (updateErr) {
      setError(`更新に失敗しました: ${updateErr.message}`)
      setSaving(false)
      return
    }

    // Replace assignees
    await supabase.from('task_assignees').delete().eq('task_id', task.id)

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
    onSaved()
    onClose()
  }

  const addSub = (memberId: string) => {
    if (!form.subAssignees.includes(memberId)) {
      setForm(prev => ({ ...prev, subAssignees: [...prev.subAssignees, memberId] }))
    }
  }

  const removeSub = (memberId: string) => {
    setForm(prev => ({ ...prev, subAssignees: prev.subAssignees.filter(id => id !== memberId) }))
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

        <div className="grid grid-cols-2 gap-3">
          {/* Status */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">ステータス</label>
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {TASK_STATUSES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
            </select>
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Primary assignee - searchable */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">主担当</label>
            <SearchableSelect
              members={allMembers}
              value={form.primaryAssignee}
              onChange={v => setForm(p => ({ ...p, primaryAssignee: v }))}
              placeholder="主担当を選択..."
            />
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

        {/* Sub assignees - searchable multi */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">副担当（複数可）</label>
          <MultiSearchableSelect
            members={allMembers}
            selectedIds={form.subAssignees}
            onAdd={addSub}
            onRemove={removeSub}
            placeholder="副担当を追加..."
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
      </div>
    </Modal>
  )
}

// ─── Searchable Select (single) ───
function SearchableSelect({ members, value, onChange, placeholder }: {
  members: MemberRow[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = members.find(m => m.id === value)
  const filtered = query ? members.filter(m => m.name.toLowerCase().includes(query.toLowerCase())) : members

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery('') }}
        className="w-full text-left px-3 py-2 border border-gray-300 rounded-lg text-xs flex items-center gap-2 hover:border-gray-400 transition"
      >
        {selected ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ backgroundColor: selected.avatar_color }}>
              {selected.name.charAt(0)}
            </span>
            <span className="truncate text-gray-700">{selected.name}</span>
          </div>
        ) : (
          <span className="text-gray-400 flex-1">{placeholder ?? '選択...'}</span>
        )}
        <span className="text-gray-300 text-[10px]">▼</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-1.5 border-b border-gray-100">
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="名前で検索..."
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400" autoFocus />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            <button onClick={() => { onChange(''); setOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50">未割当</button>
            {filtered.map(m => (
              <button key={m.id} onClick={() => { onChange(m.id); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-blue-50 transition ${m.id === value ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'}`}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>{m.name.charAt(0)}</span>
                {m.name}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-2 text-xs text-gray-400 text-center">該当なし</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Multi Searchable Select ───
function MultiSearchableSelect({ members, selectedIds, onAdd, onRemove, placeholder }: {
  members: MemberRow[]
  selectedIds: string[]
  onAdd: (id: string) => void
  onRemove: (id: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectedMembers = members.filter(m => selectedIds.includes(m.id))
  const available = query
    ? members.filter(m => !selectedIds.includes(m.id) && m.name.toLowerCase().includes(query.toLowerCase()))
    : members.filter(m => !selectedIds.includes(m.id))

  return (
    <div ref={ref} className="relative">
      <div
        className="border border-gray-300 rounded-lg px-2 py-1.5 min-h-[36px] flex flex-wrap items-center gap-1 cursor-text hover:border-gray-400 transition"
        onClick={() => { setOpen(true); setQuery('') }}
      >
        {selectedMembers.map(m => (
          <span key={m.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 text-[10px] font-medium">
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>{m.name.charAt(0)}</span>
            {m.name}
            <button onClick={e => { e.stopPropagation(); onRemove(m.id) }} className="text-blue-400 hover:text-red-500 ml-0.5">✕</button>
          </span>
        ))}
        {selectedIds.length === 0 && <span className="text-gray-400 text-xs">{placeholder}</span>}
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-1.5 border-b border-gray-100">
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="名前で検索..."
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400" autoFocus />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {available.map(m => (
              <button key={m.id} onClick={() => { onAdd(m.id); setQuery('') }}
                className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-blue-50 transition text-gray-700">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>{m.name.charAt(0)}</span>
                {m.name}
              </button>
            ))}
            {available.length === 0 && <div className="px-3 py-2 text-xs text-gray-400 text-center">{query ? '該当なし' : '全員選択済み'}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
