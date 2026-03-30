'use client'

import { useState } from 'react'
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

type CaseRoleAssignment = Record<RoleKey, string[]> // role -> member_ids

type TaskAssignment = {
  taskId: string
  primaryId: string
  subIds: string[]
}

export default function AssigneeManageModal({ isOpen, onClose, caseId, caseMembers, tasks, allMembers, onSaved }: Props) {
  // Initialize case role assignments from existing data
  const initCaseRoles = (): CaseRoleAssignment => {
    const roles: CaseRoleAssignment = { sales: [], manager: [], assistant: [], lp: [], accounting: [] }
    caseMembers.forEach(cm => {
      if (roles[cm.role]) roles[cm.role].push(cm.member_id)
    })
    return roles
  }

  // Initialize task assignments from existing data
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
      // 1. Save case members
      const { error: delError } = await supabase
        .from('case_members')
        .delete()
        .eq('case_id', caseId)

      if (delError) throw delError

      const caseMemberInserts = Object.entries(caseRoles).flatMap(([role, memberIds]) =>
        memberIds.map(member_id => ({
          case_id: caseId,
          member_id,
          role,
        }))
      )

      if (caseMemberInserts.length > 0) {
        const { error: insError } = await supabase
          .from('case_members')
          .insert(caseMemberInserts)
        if (insError) throw insError
      }

      // 2. Save task assignees
      for (const ta of taskAssignments) {
        if (!ta.primaryId && ta.subIds.length === 0) continue

        await supabase
          .from('task_assignees')
          .delete()
          .eq('task_id', ta.taskId)

        const inserts = []
        if (ta.primaryId) {
          inserts.push({ task_id: ta.taskId, member_id: ta.primaryId, role: 'primary' })
        }
        for (const subId of ta.subIds) {
          inserts.push({ task_id: ta.taskId, member_id: subId, role: 'sub' })
        }
        if (inserts.length > 0) {
          const { error: taError } = await supabase
            .from('task_assignees')
            .insert(inserts)
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
    setCaseRoles(prev => ({
      ...prev,
      [role]: memberId ? [memberId] : [],
    }))
  }

  const setTaskPrimary = (taskId: string, memberId: string) => {
    setTaskAssignments(prev => prev.map(ta =>
      ta.taskId === taskId ? { ...ta, primaryId: memberId } : ta
    ))
  }

  const toggleTaskSub = (taskId: string, memberId: string) => {
    setTaskAssignments(prev => prev.map(ta => {
      if (ta.taskId !== taskId) return ta
      const subIds = ta.subIds.includes(memberId)
        ? ta.subIds.filter(id => id !== memberId)
        : [...ta.subIds, memberId]
      return { ...ta, subIds }
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
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </>
      }
    >
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {/* Section toggle */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveSection('case')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeSection === 'case'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          案件ロール
        </button>
        <button
          onClick={() => setActiveSection('tasks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeSection === 'tasks'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          タスク別担当（{tasks.length}件）
        </button>
      </div>

      {/* Case role assignment */}
      {activeSection === 'case' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 mb-3">
            各ロールにメンバーを割り当てます
          </p>
          {ROLES.map(role => (
            <div key={role.key} className="flex items-center gap-4">
              <label className="w-40 text-sm font-medium text-gray-700">{role.label}</label>
              <select
                value={caseRoles[role.key as RoleKey]?.[0] ?? ''}
                onChange={e => setCaseRole(role.key as RoleKey, e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">未割当</option>
                {allMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
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
              <div className="grid grid-cols-[1fr_160px_160px] gap-2 px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <span>タスク</span>
                <span>主担当</span>
                <span>副担当</span>
              </div>
              <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
                {tasks.map(task => {
                  const ta = taskAssignments.find(a => a.taskId === task.id)
                  if (!ta) return null
                  return (
                    <div
                      key={task.id}
                      className="grid grid-cols-[1fr_160px_160px] gap-2 px-2 py-2 items-center hover:bg-gray-50 rounded"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-700 truncate">{task.title}</div>
                        <div className="text-[10px] text-gray-400">{getPhaseLabel(task.phase)}</div>
                      </div>
                      <select
                        value={ta.primaryId}
                        onChange={e => setTaskPrimary(task.id, e.target.value)}
                        className="border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      >
                        <option value="">未割当</option>
                        {allMembers.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-1">
                        {allMembers.slice(0, 5).map(m => (
                          <button
                            key={m.id}
                            onClick={() => toggleTaskSub(task.id, m.id)}
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white transition-all ${
                              ta.subIds.includes(m.id)
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
