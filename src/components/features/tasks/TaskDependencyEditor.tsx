'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import { TASK_SECTION_DEFS } from '@/lib/taskSectionDefs'
import type { TaskRow, TaskDependencyRow, TaskDependencyConditionType } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  task: TaskRow
  caseTasks: TaskRow[]
  dependencies: TaskDependencyRow[]
  onSaved: () => void
}

export default function TaskDependencyEditor({ isOpen, onClose, task, caseTasks, dependencies, onSaved }: Props) {
  const [mode, setMode] = useState<'list' | 'add'>('list')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [conditionType, setConditionType] = useState<TaskDependencyConditionType>('task_completed')
  const [checkpointField, setCheckpointField] = useState('')
  const [checkpointLabel, setCheckpointLabel] = useState('')
  const [saving, setSaving] = useState(false)

  // このタスクに関連する依存関係
  const outgoing = dependencies.filter(d => d.from_task_id === task.id)
  const incoming = dependencies.filter(d => d.to_task_id === task.id)

  // 選択可能なタスク（自分自身と既に依存関係があるものを除く）
  const existingFromIds = new Set(outgoing.map(d => d.to_task_id))
  const existingToIds = new Set(incoming.map(d => d.from_task_id))
  const availableTasks = caseTasks.filter(t =>
    t.id !== task.id &&
    !existingFromIds.has(t.id) &&
    !existingToIds.has(t.id)
  )

  // 選択されたタスクのカテゴリに基づくチェックポイントフィールド
  const selectedTask = caseTasks.find(t => t.id === selectedTaskId)
  const checkpointFields = selectedTask
    ? TASK_SECTION_DEFS
        .filter(s => s.showWhen(selectedTask.category))
        .flatMap(s => s.fields.filter(f => f.type === 'date' || f.type === 'checkbox'))
    : []

  const handleAdd = async () => {
    if (!selectedTaskId) return
    setSaving(true)

    const supabase = createClient()
    const { error } = await supabase.from('task_dependencies').insert({
      case_id: task.case_id,
      from_task_id: selectedTaskId,
      to_task_id: task.id,
      condition_type: conditionType,
      checkpoint_field: conditionType === 'checkpoint' ? checkpointField : null,
      label: conditionType === 'checkpoint' ? checkpointLabel : 'タスク完了',
    })

    setSaving(false)

    if (error) {
      showToast('依存関係の追加に失敗しました', 'error')
      return
    }

    showToast('依存関係を追加しました', 'success')
    resetForm()
    onSaved()
  }

  const handleDelete = async (depId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('task_dependencies').delete().eq('id', depId)
    if (error) {
      showToast('削除に失敗しました', 'error')
      return
    }
    showToast('依存関係を削除しました', 'success')
    onSaved()
  }

  const resetForm = () => {
    setMode('list')
    setSelectedTaskId('')
    setConditionType('task_completed')
    setCheckpointField('')
    setCheckpointLabel('')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { resetForm(); onClose() }}
      title="依存関係の管理"
      maxWidth="max-w-lg"
    >
      {mode === 'list' ? (
        <div className="space-y-4">
          {/* 前提条件（このタスクの前に必要なタスク） */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-2">前提条件（このタスクの前に必要）</h4>
            {incoming.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">なし</p>
            ) : (
              <div className="space-y-1.5">
                {incoming.map(dep => {
                  const fromTask = dep.from_task
                  return (
                    <div key={dep.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-xs font-medium text-gray-700 flex-1 truncate">
                        {fromTask?.title ?? '不明なタスク'}
                      </span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">
                        {dep.label ?? dep.condition_type}
                      </span>
                      <button
                        onClick={() => handleDelete(dep.id)}
                        className="text-red-400 hover:text-red-600 text-xs flex-shrink-0"
                        title="削除"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 次のタスク（このタスクの後のタスク） */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-2">次のタスク（このタスクの後）</h4>
            {outgoing.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">なし</p>
            ) : (
              <div className="space-y-1.5">
                {outgoing.map(dep => {
                  const toTask = dep.to_task
                  return (
                    <div key={dep.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-xs font-medium text-gray-700 flex-1 truncate">
                        {toTask?.title ?? '不明なタスク'}
                      </span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">
                        {dep.label ?? dep.condition_type}
                      </span>
                      <button
                        onClick={() => handleDelete(dep.id)}
                        className="text-red-400 hover:text-red-600 text-xs flex-shrink-0"
                        title="削除"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => setMode('add')}
            className="w-full px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
          >
            + 前提条件を追加
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">このタスクの前提となるタスクを選択してください</p>

          {/* タスク選択 */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">前提タスク</label>
            <select
              value={selectedTaskId}
              onChange={e => { setSelectedTaskId(e.target.value); setCheckpointField(''); setCheckpointLabel('') }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            >
              <option value="">選択してください</option>
              {availableTasks.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>

          {/* 条件タイプ */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">条件タイプ</label>
            <div className="flex gap-2">
              <button
                onClick={() => { setConditionType('task_completed'); setCheckpointField(''); setCheckpointLabel('') }}
                className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors ${
                  conditionType === 'task_completed'
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                タスク完了
              </button>
              <button
                onClick={() => setConditionType('checkpoint')}
                disabled={checkpointFields.length === 0}
                className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors ${
                  conditionType === 'checkpoint'
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                チェックポイント
              </button>
            </div>
          </div>

          {/* チェックポイントフィールド選択 */}
          {conditionType === 'checkpoint' && checkpointFields.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">チェックポイント項目</label>
              <select
                value={checkpointField}
                onChange={e => {
                  const field = checkpointFields.find(f => f.key === e.target.value)
                  setCheckpointField(e.target.value)
                  setCheckpointLabel(field ? `${field.label}が入力済` : '')
                }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
              >
                <option value="">選択してください</option>
                {checkpointFields.map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={resetForm}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              戻る
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !selectedTaskId || (conditionType === 'checkpoint' && !checkpointField)}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '追加中...' : '追加'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
