import type { TimelineReceipt } from '@/components/features/cases/CaseTimeline'

export type RelatedTask = { id: string; title: string }

/**
 * 取得物(タブの1行)に紐づく「関連タスク」を受信簿から引く（多対多・migration 111）。
 * 受信簿の到着物(item)を linked_kind/linked_id でこの行に対応づけ、その到着物に結ばれた
 * タスク(item_tasks)を集める。同じ行に複数の到着物・複数のタスクが結ばれていても重複排除して返す。
 */
export function relatedTasksFor(receipts: TimelineReceipt[], kind: string, rowId: string, field?: string): RelatedTask[] {
  const out = new Map<string, RelatedTask>()
  for (const r of receipts) {
    for (const it of r.items ?? []) {
      if (it.linked_kind !== kind || it.linked_id !== rowId) continue
      // field 指定時は受領カラム(linked_field)も一致する到着物だけ（例: 解約書類=cancellation_arrival_date）
      if (field && it.linked_field !== field) continue
      for (const lt of it.item_tasks ?? []) {
        if (lt.task) out.set(lt.task.id, lt.task)
      }
    }
  }
  return [...out.values()]
}

export type ReceiptFile = { bucket: string; path: string; name: string | null }

/**
 * 取得物(タブの1行)に紐づく「受領ファイル」を受信簿から引く。
 * 受信簿の到着物(item)を linked_kind/linked_id でこの行に対応づけ、その到着物に添付された
 * case_documents の受領ファイルを返す。複数あれば全部（新しい順序は呼び出し側）。
 */
export function receiptFilesFor(receipts: TimelineReceipt[], kind: string, rowId: string, field?: string): ReceiptFile[] {
  const out: ReceiptFile[] = []
  for (const r of receipts) {
    for (const it of r.items ?? []) {
      if (it.linked_kind !== kind || it.linked_id !== rowId) continue
      if (field && it.linked_field !== field) continue
      const cd = it.case_document
      if (cd?.received_file_path && cd.received_file_bucket) {
        out.push({ bucket: cd.received_file_bucket, path: cd.received_file_path, name: cd.received_file_name ?? it.item_name })
      }
    }
  }
  return out
}
