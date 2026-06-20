import type { TimelineReceipt } from '@/components/features/cases/CaseTimeline'

export type RelatedTask = { id: string; title: string }

/**
 * 取得物(タブの1行)に紐づく「関連タスク」を受信簿から引く（多対多・migration 111）。
 * 受信簿の到着物(item)を linked_kind/linked_id でこの行に対応づけ、その到着物に結ばれた
 * タスク(item_tasks)を集める。同じ行に複数の到着物・複数のタスクが結ばれていても重複排除して返す。
 */
export function relatedTasksFor(receipts: TimelineReceipt[], kind: string, rowId: string): RelatedTask[] {
  const out = new Map<string, RelatedTask>()
  for (const r of receipts) {
    for (const it of r.items ?? []) {
      if (it.linked_kind !== kind || it.linked_id !== rowId) continue
      for (const lt of it.item_tasks ?? []) {
        if (lt.task) out.set(lt.task.id, lt.task)
      }
    }
  }
  return [...out.values()]
}
