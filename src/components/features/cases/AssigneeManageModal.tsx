'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import { ROLES } from '@/lib/constants'
import { getPhaseLabel } from '@/lib/phases'
import type { CaseMemberRow, TaskRow, MemberRow, RoleKey } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseId: string
  caseMembers: CaseMemberRow[]
  tasks: TaskRow[]
  allMembers: MemberRow[]
  onSaved: () => void
}

type CaseRoleAssignment = Record<RoleKey, string[]>

type TaskAssignment = {
  taskId: string
  primaryId: string
  subIds: string[]
}

export default function AssigneeManageModal({ isOpen, onClose, caseId, caseMembers, tasks, allMembers, onSaved }: Props) {
  const initCaseRoles = (): CaseRoleAssignment => {
    const roles: CaseRoleAssignment = { sales: [], manager: [], sub_manager: [], assistant: [], lp: [], accounting: [] }
    caseMembers.forEach(cm => {
      if (roles[cm.role]) roles[cm.role].push(cm.member_id)
    })
    return roles
  }

  const initTaskAssignments = (): TaskAssignment[] => {
    return tasks.map(task => ({
      taskId: task.id,
      primaryId: task.task_assignees?.find(a => a.role === 'primary')?.member_id ?? '',
      subIds: task.task_assignees?.filter(a => a.role === 'sub').map(a => a.member_id) ?? [],
    }))
  }

  const [caseRoles, setCaseRoles] = useState<CaseRoleAssignment>(initCaseRoles)
  const [taskAssignments, setTaskAssignments] = useState<TaskAssignment[]>(initTaskAssignments)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<'case' | 'tasks'>('case')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const supabase = createClient()

    try {
      const { error: delError } = await supabase.from('case_members').delete().eq('case_id', caseId)
      if (delError) throw delError

      const caseMemberInserts = Object.entries(caseRoles).flatMap(([role, memberIds]) =>
        memberIds.map(member_id => ({ case_id: caseId, member_id, role }))
      )
      if (caseMemberInserts.length > 0) {
        const { error: insError } = await supabase.from('case_members').insert(caseMemberInserts)
        if (insError) throw insError
      }

      for (const ta of taskAssignments) {
        if (!ta.primaryId && ta.subIds.length === 0) continue
        await supabase.from('task_assignees').delete().eq('task_id', ta.taskId)
        const inserts = []
        if (ta.primaryId) inserts.push({ task_id: ta.taskId, member_id: ta.primaryId, role: 'primary' })
        for (const subId of ta.subIds) inserts.push({ task_id: ta.taskId, member_id: subId, role: 'sub' })
        if (inserts.length > 0) {
          const { error: taError } = await supabase.from('task_assignees').insert(inserts)
          if (taError) throw taError
        }
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(`保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const setCaseRole = (role: RoleKey, memberId: string) => {
    setCaseRoles(prev => ({ ...prev, [role]: memberId ? [memberId] : [] }))
  }

  const setTaskPrimary = (taskId: string, memberId: string) => {
    setTaskAssignments(prev => prev.map(ta =>
      ta.taskId === taskId ? { ...ta, primaryId: memberId } : ta
    ))
  }

  const addTaskSub = (taskId: string, memberId: string) => {
    setTaskAssignments(prev => prev.map(ta => {
      if (ta.taskId !== taskId || ta.subIds.includes(memberId)) return ta
      return { ...ta, subIds: [...ta.subIds, memberId] }
    }))
  }

  const removeTaskSub = (taskId: string, memberId: string) => {
    setTaskAssignments(prev => prev.map(ta => {
      if (ta.taskId !== taskId) return ta
      return { ...ta, subIds: ta.subIds.filter(id => id !== memberId) }
    }))
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="担当者割振り"
      maxWidth="max-w-3xl"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </>
      }
    >
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveSection('case')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeSection === 'case' ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          案件担当者
        </button>
        <button
          onClick={() => setActiveSection('tasks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeSection === 'tasks' ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          タスク別担当（{tasks.length}件）
        </button>
      </div>

      {/* Case role assignment */}
      {activeSection === 'case' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 mb-3">各ロールにメンバーを割り当てます</p>
          {ROLES.map(role => (
            <div key={role.key} className="flex items-center gap-4">
              <label className="w-40 text-sm font-medium text-gray-700">{role.label}</label>
              <SearchableSelect
                members={allMembers}
                value={caseRoles[role.key as RoleKey]?.[0] ?? ''}
                onChange={v => setCaseRole(role.key as RoleKey, v)}
                placeholder="メンバーを選択..."
              />
            </div>
          ))}
        </div>
      )}

      {/* Task assignee management */}
      {activeSection === 'tasks' && (
        <div className="space-y-1">
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">タスクがありません</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_180px_1fr] gap-2 px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <span>タスク</span>
                <span>主担当</span>
                <span>副担当</span>
              </div>
              <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
                {tasks.map(task => {
                  const ta = taskAssignments.find(a => a.taskId === task.id)
                  if (!ta) return null
                  return (
                    <div key={task.id} className="grid grid-cols-[1fr_180px_1fr] gap-2 px-2 py-2 items-center hover:bg-gray-50 rounded">
                      <div>
                        <div className="text-sm font-medium text-gray-700 truncate">{task.title}</div>
                        <div className="text-[10px] text-gray-400">{getPhaseLabel(task.phase)}</div>
                      </div>
                      <SearchableSelect
                        members={allMembers}
                        value={ta.primaryId}
                        onChange={v => setTaskPrimary(task.id, v)}
                        placeholder="主担当..."
                        compact
                      />
                      <MultiSearchableSelect
                        members={allMembers}
                        selectedIds={ta.subIds}
                        onAdd={id => addTaskSub(task.id, id)}
                        onRemove={id => removeTaskSub(task.id, id)}
                        placeholder="副担当を追加..."
                        compact
                      />
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

// ─── Searchable Select (single) ───
function SearchableSelect({ members, value, onChange, placeholder, compact }: {
  members: MemberRow[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  compact?: boolean
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
  const filtered = query
    ? members.filter(m => m.name.toLowerCase().includes(query.toLowerCase()))
    : members

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery('') }}
        className={`w-full text-left border border-gray-200 rounded-lg flex items-center gap-2 transition hover:border-gray-300 ${
          compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'
        }`}
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
        <span className="text-gray-300 text-[10px] flex-shrink-0">▼</span>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-1.5 border-b border-gray-100">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="名前で検索..."
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400"
              autoFocus
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            <button
              onClick={() => { onChange(''); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
            >
              未割当
            </button>
            {filtered.map(m => (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-blue-50 transition ${
                  m.id === value ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                }`}
              >
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>
                  {m.name.charAt(0)}
                </span>
                {m.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400 text-center">該当なし</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Multi Searchable Select (副担当用) ───
function MultiSearchableSelect({ members, selectedIds, onAdd, onRemove, placeholder, compact }: {
  members: MemberRow[]
  selectedIds: string[]
  onAdd: (id: string) => void
  onRemove: (id: string) => void
  placeholder?: string
  compact?: boolean
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
  const availableMembers = query
    ? members.filter(m => !selectedIds.includes(m.id) && m.name.toLowerCase().includes(query.toLowerCase()))
    : members.filter(m => !selectedIds.includes(m.id))

  return (
    <div ref={ref} className="relative">
      <div
        className={`border border-gray-200 rounded-lg flex flex-wrap items-center gap-1 cursor-text transition hover:border-gray-300 ${
          compact ? 'px-1.5 py-1 min-h-[28px]' : 'px-2 py-1.5 min-h-[36px]'
        }`}
        onClick={() => { setOpen(true); setQuery('') }}
      >
        {selectedMembers.map(m => (
          <span key={m.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 text-[10px] font-medium">
            <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>
              {m.name.charAt(0)}
            </span>
            {m.name}
            <button onClick={(e) => { e.stopPropagation(); onRemove(m.id) }} className="text-blue-400 hover:text-red-500 ml-0.5">✕</button>
          </span>
        ))}
        {selectedIds.length === 0 && (
          <span className="text-gray-400 text-xs">{placeholder ?? '選択...'}</span>
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden" style={{ minWidth: 200 }}>
          <div className="p-1.5 border-b border-gray-100">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="名前で検索..."
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400"
              autoFocus
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {availableMembers.map(m => (
              <button
                key={m.id}
                onClick={() => { onAdd(m.id); setQuery('') }}
                className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-blue-50 transition text-gray-700"
              >
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>
                  {m.name.charAt(0)}
                </span>
                {m.name}
              </button>
            ))}
            {availableMembers.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400 text-center">
                {query ? '該当なし' : '全員選択済み'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
