'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import EditTaskModal from '@/components/features/tasks/EditTaskModal'
import BulkAssignBar from '@/components/features/tasks/BulkAssignBar'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUSES } from '@/lib/constants'
import { DB_PHASES, getPhaseLabel, getPhaseColor } from '@/lib/phases'
import type { TaskRow, MemberRow } from '@/types'

type Props = {
  tasks: TaskRow[]
  allMembers: MemberRow[]
  onBulkGenerate: () => void
  onAssigneeManage: () => void
  onAddTask: () => void
}

export default function TasksTab({ tasks, allMembers, onBulkGenerate, onAssigneeManage, onAddTask }: Props) {
  const router = useRouter()
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [editTask, setEditTask] = useState<TaskRow | null>(null)
  const [deleteTask, setDeleteTask] = useState<TaskRow | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())

  const tasksByPhase = DB_PHASES.map(phase => ({
    phase,
    label: getPhaseLabel(phase),
    color: getPhaseColor(phase),
    tasks: tasks.filter(t => t.phase === phase),
  })).filter(g => g.tasks.length > 0)

  const togglePhase = (phase: string) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev)
      if (next.has(phase)) next.delete(phase)
      else next.add(phase)
      return next
    })
  }

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const toggleAllInPhase = (phaseTasks: TaskRow[]) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      const allSelected = phaseTasks.every(t => next.has(t.id))
      if (allSelected) {
        phaseTasks.forEach(t => next.delete(t.id))
      } else {
        phaseTasks.forEach(t => next.add(t.id))
      }
      return next
    })
  }

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const supabase = createClient()
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deleteTask) return
    const supabase = createClient()
    await supabase.from('task_assignees').delete().eq('task_id', deleteTask.id)
    const { error } = await supabase.from('tasks').delete().eq('id', deleteTask.id)
    if (error) throw new Error(error.message)
    setDeleteTask(null)
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-bold text-gray-900 flex-1">タスク管理</h2>
        <button onClick={onAssigneeManage} className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          👥 担当者変更
        </button>
        <button onClick={onBulkGenerate} className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          📋 一括生成
        </button>
        <button onClick={onAddTask} className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          ＋ タスク追加
        </button>
      </div>

      {/* Bulk assign bar */}
      <BulkAssignBar
        selectedTaskIds={Array.from(selectedTaskIds)}
        allMembers={allMembers}
        onDone={() => router.refresh()}
        onClearSelection={() => setSelectedTaskIds(new Set())}
      />

      {tasksByPhase.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-400 text-sm mb-3">タスクがありません</p>
          <button onClick={onBulkGenerate} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            テンプレートからタスクを一括生成
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tasksByPhase.map(group => {
            const completed = group.tasks.filter(t => t.status === '完了').length
            const isCollapsed = collapsedPhases.has(group.phase)
            const allChecked = group.tasks.every(t => selectedTaskIds.has(t.id))

            return (
              <div key={group.phase} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={allChecked && group.tasks.length > 0}
                    onChange={() => toggleAllInPhase(group.tasks)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    onClick={e => e.stopPropagation()}
                  />
                  <button onClick={() => togglePhase(group.phase)} className="flex items-center gap-3 flex-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                    <span className="text-sm font-semibold text-gray-900 flex-1 text-left">{group.label}</span>
                    <span className="text-xs text-gray-400 font-mono">{completed}/{group.tasks.length}</span>
                    <span className={`text-xs text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>▾</span>
                  </button>
                </div>

                {!isCollapsed && (
                  <div className="border-t border-gray-100">
                    {group.tasks.map(task => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        checked={selectedTaskIds.has(task.id)}
                        onToggle={() => toggleTask(task.id)}
                        onEdit={() => setEditTask(task)}
                        onDelete={() => setDeleteTask(task)}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editTask && (
        <EditTaskModal
          isOpen={!!editTask}
          onClose={() => setEditTask(null)}
          task={editTask}
          caseMap={{}}
          allMembers={allMembers}
          onSaved={() => { setEditTask(null); router.refresh() }}
        />
      )}

      <DeleteConfirmModal
        isOpen={!!deleteTask}
        onClose={() => setDeleteTask(null)}
        title="タスク削除"
        message={`「${deleteTask?.title}」を削除しますか？この操作は取り消せません。`}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function TaskItem({ task, checked, onToggle, onEdit, onDelete, onStatusChange }: {
  task: TaskRow
  checked: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (taskId: string, status: string) => void
}) {
  const statusDef = TASK_STATUSES.find(s => s.key === task.status)
  const primaryAssignee = task.task_assignees?.find(a => a.role === 'primary')
  const subAssignees = task.task_assignees?.filter(a => a.role === 'sub') ?? []

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 group ${checked ? 'bg-blue-50/50' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
      />

      <select
        value={task.status}
        onChange={(e) => onStatusChange(task.id, e.target.value)}
        className="w-4 h-4 rounded flex-shrink-0 appearance-none cursor-pointer border-none outline-none p-0"
        style={{ backgroundColor: statusDef?.color ?? '#6B7280', color: 'transparent', WebkitAppearance: 'none' }}
        title={`ステータス: ${task.status}`}
      >
        {TASK_STATUSES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
      </select>

      <a
        href={`/tasks/${task.id}`}
        className={`flex-1 text-sm font-medium cursor-pointer hover:text-blue-600 ${task.status === '完了' ? 'text-gray-400 line-through' : 'text-gray-700'}`}
      >
        {task.title}
      </a>

      {task.category && <span className="text-[10px] text-gray-400 font-mono">{task.category}</span>}
      {statusDef && <Badge label={statusDef.key} color={statusDef.color} />}
      {task.due_date && <span className="text-xs text-gray-400 font-mono min-w-[64px] text-right">{task.due_date}</span>}

      <div className="flex items-center -space-x-1.5 flex-shrink-0">
        {primaryAssignee?.members && (
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
            style={{ backgroundColor: primaryAssignee.members.avatar_color }} title={primaryAssignee.members.name}>
            {primaryAssignee.members.name.charAt(0)}
          </span>
        )}
        {subAssignees.map(a => a.members && (
          <span key={a.id} className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white border-2 border-white"
            style={{ backgroundColor: a.members.avatar_color }} title={a.members.name}>
            {a.members.name.charAt(0)}
          </span>
        ))}
      </div>

      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="w-6 h-6 rounded flex items-center justify-center text-[11px] text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition" title="編集">✏️</button>
        <button onClick={onDelete} className="w-6 h-6 rounded flex items-center justify-center text-[11px] text-gray-400 hover:bg-red-50 hover:text-red-500 transition" title="削除">🗑</button>
      </div>
    </div>
  )
}
