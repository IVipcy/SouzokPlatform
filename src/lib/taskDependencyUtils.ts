/**
 * タスク依存関係の条件評価ユーティリティ
 */

import type { TaskRow, TaskDependencyRow } from '@/types'

const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '差戻し', '保留'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

/**
 * 依存関係の条件が満たされているか評価する
 */
export function evaluateCondition(
  fromTask: TaskRow,
  dep: TaskDependencyRow
): boolean {
  if (dep.condition_type === 'task_completed') {
    return normalizeStatus(fromTask.status) === '完了'
  }

  if (dep.condition_type === 'checkpoint' && dep.checkpoint_field) {
    const ext = (fromTask.ext_data ?? {}) as Record<string, unknown>
    const value = ext[dep.checkpoint_field]
    // 値が存在し、空文字やfalseでなければクリア
    return value !== null && value !== undefined && value !== '' && value !== false
  }

  return false
}

/**
 * 依存関係の表示ラベルを生成する
 */
export function getDependencyDisplayLabel(
  dep: TaskDependencyRow,
  taskTitle: string
): string {
  if (dep.label) {
    return `${taskTitle} - ${dep.label}`
  }
  if (dep.condition_type === 'task_completed') {
    return `${taskTitle} が完了`
  }
  return `${taskTitle} のチェックポイント達成`
}

/**
 * タスクの全前提条件がクリアされているか判定する
 */
export function areAllPrerequisitesMet(
  taskId: string,
  dependencies: TaskDependencyRow[],
  allTasks: TaskRow[]
): boolean {
  const prerequisites = dependencies.filter(d => d.to_task_id === taskId)
  if (prerequisites.length === 0) return true

  const taskMap = new Map(allTasks.map(t => [t.id, t]))

  return prerequisites.every(dep => {
    const fromTask = taskMap.get(dep.from_task_id)
    if (!fromTask) return false
    return evaluateCondition(fromTask, dep)
  })
}
