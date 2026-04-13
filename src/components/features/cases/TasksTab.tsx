'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import EditTaskModal from '@/components/features/tasks/EditTaskModal'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUSES } from '@/lib/constants'
import { DB_PHASES, getPhaseLabel, getPhaseColor } from '@/lib/phases'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { showToast } from '@/components/ui/Toast'
import type { TaskRow, MemberRow } from '@/types'

type Props = {
  tasks: TaskRow[]
  allMembers: MemberRow[]
  currentMemberId: string | null
  onBulkGenerate: () => void
  onAddTask: () => void
}

// ステータス正規化
const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '差戻し', '保留'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

export default function TasksTab({ tasks, allMembers, currentMemberId: serverMemberId, onBulkGenerate, onAddTask }: Props) {
  const router = useRouter()
  const currentMemberId = useCurrentMember(serverMemberId)
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

  // ─── ステータス進行 ───
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null)

  const handleAdvance = useCallback(async (task: TaskRow) => {
    const current = normalizeStatus(task.status)
    if (current === '完了' || loadingTaskId) return

    setLoadingTaskId(task.id)
    try {
      const supabase = createClient()
      const memberId = currentMemberId

      if (current === '着手前') {
        const updates: Record<string, unknown> = { status: '対応中' }
        if (memberId) {
          updates.started_by = memberId
          updates.started_at = new Date().toISOString()
        }
        const { error } = await supabase.from('tasks').update(updates).eq('id', task.id)
        if (error) { showToast(`エラー: ${error.message}`, 'error'); return }
        if (memberId) {
          await supabase.from('case_activities').insert({
            case_id: task.case_id, task_id: task.id, member_id: memberId,
            activity_type: 'task_started',
            description: `${task.title} に着手`,
            activity_date: new Date().toISOString().split('T')[0],
          })
        }
        showToast(`「${task.title}」に着手しました`)
      } else {
        const { error } = await supabase.from('tasks').update({ status: '完了' }).eq('id', task.id)
        if (error) { showToast(`エラー: ${error.message}`, 'error'); return }
        if (memberId) {
          await supabase.from('case_activities').insert({
            case_id: task.case_id, task_id: task.id, member_id: memberId,
            activity_type: 'task_completed',
            description: `${task.title} を完了`,
            activity_date: new Date().toISOString().split('T')[0],
          })
        }
        showToast(`「${task.title}」を完了しました`)
      }
      router.refresh()
    } catch {
      showToast('通信エラーが発生しました', 'error')
    } finally {
      setLoadingTaskId(null)
    }
  }, [currentMemberId, loadingTaskId, router])

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
  const completedTasks = tasks.filter(t => normalizeStatus(t.status) === '完了').length
  const doingTasks = tasks.filter(t => normalizeStatus(t.status) === '対応中').length
  const todoTasks = tasks.filter(t => normalizeStatus(t.status) === '着手前').length
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
            <span>着手前: {todoTasks}</span>
            <span>対応中: {doingTasks}</span>
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
            const completed = group.tasks.filter(t => normalizeStatus(t.status) === '完了').length
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
                        onAdvance={() => handleAdvance(task)}
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

function TaskItem({ task, allMembers, onEdit, onDelete, onAdvance }: {
  task: TaskRow
  allMembers: MemberRow[]
  onEdit: () => void
  onDelete: () => void
  onAdvance: () => void
}) {
  const current = normalizeStatus(task.status)
  const statusDef = TASK_STATUSES.find(s => s.key === current)
  const startedMember = task.started_by ? allMembers.find(m => m.id === task.started_by) ?? task.started_by_member : null

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 group">
      {/* 進行ボタン */}
      <div className="flex-shrink-0">
        {current === '着手前' && (
          <button onClick={onAdvance}
            className="w-6 h-6 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 transition-colors flex items-center justify-center"
            title="着手する">
            <span className="text-[8px] text-gray-400 group-hover:text-green-600">▶</span>
          </button>
        )}
        {current === '対応中' && (
          <button onClick={onAdvance}
            className="w-6 h-6 rounded-full border-2 border-blue-400 bg-blue-50 hover:border-blue-600 hover:bg-blue-100 transition-colors flex items-center justify-center"
            title="完了にする">
            <span className="text-[10px] text-blue-500">✓</span>
          </button>
        )}
        {current === '完了' && (
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
            <span className="text-[10px] text-white font-bold">✓</span>
          </div>
        )}
      </div>

      <a
        href={`/tasks/${task.id}`}
        className={`flex-1 text-sm font-medium cursor-pointer hover:text-blue-600 ${current === '完了' ? 'text-gray-400 line-through' : 'text-gray-700'}`}
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
