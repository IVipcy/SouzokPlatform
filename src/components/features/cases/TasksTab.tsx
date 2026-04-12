'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import EditTaskModal from '@/components/features/tasks/EditTaskModal'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUSES } from '@/lib/constants'
import { DB_PHASES, getPhaseLabel, getPhaseColor } from '@/lib/phases'
import type { TaskRow, MemberRow } from '@/types'

type Props = {
  tasks: TaskRow[]
  allMembers: MemberRow[]
  onBulkGenerate: () => void
  onAddTask: () => void
}

export default function TasksTab({ tasks, allMembers, onBulkGenerate, onAddTask }: Props) {
  const router = useRouter()
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [editTask, setEditTask] = useState<TaskRow | null>(null)
  const [deleteTask, setDeleteTask] = useState<TaskRow | null>(null)

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

  // 進捗率
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.status === '完了').length
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-bold text-gray-900 flex-1">タスク管理</h2>
        <button onClick={onBulkGenerate} className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          📋 一括生成
        </button>
        <button onClick={onAddTask} className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          ＋ タスク追加
        </button>
      </div>

      {/* 進捗バー */}
      {totalTasks > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">案件進捗</span>
            <span className="text-sm font-bold text-blue-600">{progressPercent}% <span className="text-gray-400 font-normal text-xs">({completedTasks}/{totalTasks})</span></span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="h-2.5 rounded-full transition-all duration-500"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: progressPercent === 100 ? '#059669' : progressPercent > 50 ? '#2563EB' : '#D97706',
              }}
            />
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-gray-500">
            <span>未着手: {tasks.filter(t => t.status === '未着手').length}</span>
            <span>対応中: {tasks.filter(t => t.status === '対応中').length}</span>
            <span>完了: {completedTasks}</span>
          </div>
        </div>
      )}

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

            return (
              <div key={group.phase} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
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
                        allMembers={allMembers}
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

function TaskItem({ task, allMembers, onEdit, onDelete, onStatusChange }: {
  task: TaskRow
  allMembers: MemberRow[]
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (taskId: string, status: string) => void
}) {
  const statusDef = TASK_STATUSES.find(s => s.key === task.status)
  const startedMember = task.started_by ? allMembers.find(m => m.id === task.started_by) ?? task.started_by_member : null

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 group`}>
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

      {/* 着手者 */}
      <div className="flex items-center flex-shrink-0 min-w-[60px]">
        {startedMember ? (
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
            style={{ backgroundColor: startedMember.avatar_color }} title={`着手: ${startedMember.name}`}>
            {startedMember.name.charAt(0)}
          </span>
        ) : (
          <span className="text-[9px] text-gray-300">—</span>
        )}
      </div>

      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="w-6 h-6 rounded flex items-center justify-center text-[11px] text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition" title="編集">✏️</button>
        <button onClick={onDelete} className="w-6 h-6 rounded flex items-center justify-center text-[11px] text-gray-400 hover:bg-red-50 hover:text-red-500 transition" title="削除">🗑</button>
      </div>
    </div>
  )
}
