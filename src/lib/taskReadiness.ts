// 事務管理タスクのステータス正規化と「書類状態」補助情報を提供するヘルパー。
//
// 設計方針:
//   - ステータスは 着手前 / 対応中 / 完了 の 3 段階に正規化する（旧 Wチェック待ち・保留・差戻し は対応中、キャンセルは完了に吸収）。
//   - 過去にあった「Ready / Waiting」の機械判定は廃止。
//     書類関係ない待ち事由（人待ち・口頭確認待ち等）を機械では判定できないため、
//     誤判定を避けて 着手前 の中に統合した。
//   - 代わりに、紐づき書類の受領状況だけは自動で取れるので、
//     getTaskDocStatus() で「受領済 / 受領待ち / 紐付けなし」を返し、
//     カード等に補助情報として併記する用途で使う。
//
// 受信簿（document_receipts）のうち、started_task_id または item_tasks 経由でタスクに
// 紐づくものを、toReadinessReceipts() で 1 行 1 タスクの形に展開する。

import type { TaskRow } from '@/types'

// 受信簿の最低限な行型（このヘルパーに必要なフィールドだけ）
export type ReadinessReceipt = {
  started_task_id: string | null
  received_date: string | null
  /** 表示用のラベル（例: "戸籍 江東区役所" or "金融資産 みずほ銀行"）。任意。 */
  display_label?: string | null
}

// 受信簿（TimelineReceipt 形式）を ReadinessReceipt に変換する。
// started_task_id と item_tasks（複数タスク紐付け）を 1 行ずつに展開する。
type TimelineReceiptShape = {
  received_date: string | null
  started_task_id?: string | null
  items?: { item_name: string; item_tasks?: { task: { id: string } | null }[] | null }[] | null
}
export function toReadinessReceipts(receipts: TimelineReceiptShape[] | undefined | null): ReadinessReceipt[] {
  if (!receipts) return []
  const out: ReadinessReceipt[] = []
  for (const r of receipts) {
    const itemLabels = (r.items ?? []).map(i => i.item_name).filter(Boolean)
    const label: string | null = itemLabels.length > 0 ? itemLabels.join(' / ') : null
    const stids = new Set<string>()
    if (r.started_task_id) stids.add(r.started_task_id)
    for (const it of r.items ?? []) for (const itk of it.item_tasks ?? []) if (itk.task?.id) stids.add(itk.task.id)
    if (stids.size === 0) {
      out.push({ started_task_id: null, received_date: r.received_date, display_label: label })
    } else {
      for (const tid of stids) out.push({ started_task_id: tid, received_date: r.received_date, display_label: label })
    }
  }
  return out
}

// タスクのステータスを 3 段階（着手前 / 対応中 / 完了）に正規化する。
export function normalizeTaskStatus(status: string): string {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '保留', '差戻し'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

// タスクの「書類状態」補助情報。
//   - 'received'  : 紐付け書類があり、すべて受領済（着手の手がかり）
//   - 'waiting'   : 紐付け書類のうち未受領のものがある（着手前なら書類受領待ち）
//   - 'none'      : 紐付け書類なし（人待ち・自由スタート等は機械では判定できない）
export type DocStatus =
  | { state: 'none' }
  | { state: 'received'; label: string }
  | { state: 'waiting'; label: string }

function summarizeLabels(labels: string[], suffix: string, fallbackCount: number): string {
  const clean = labels.filter(v => v && v.trim() !== '')
  if (clean.length === 0) return `${suffix}（${fallbackCount}件）`
  return `${clean.slice(0, 2).join(' / ')}${clean.length > 2 ? ` ほか${clean.length - 2}件` : ''} ${suffix}`
}

export function getTaskDocStatus(taskId: string, receipts: ReadinessReceipt[] = []): DocStatus {
  const linked = receipts.filter(r => r.started_task_id === taskId)
  if (linked.length === 0) return { state: 'none' }
  const pending = linked.filter(r => !r.received_date)
  if (pending.length > 0) {
    return {
      state: 'waiting',
      label: summarizeLabels(pending.map(r => r.display_label ?? ''), '受領待ち', pending.length),
    }
  }
  return {
    state: 'received',
    label: summarizeLabels(linked.map(r => r.display_label ?? ''), '受領済', linked.length),
  }
}

// タスクが「書類受領待ち」状態か（着手前 かつ 紐付き書類で未受領のものがある）。
// 案件進捗ダッシュボード等のフィルタで使う。
export function isWaitingForDocument(task: TaskRow, receipts: ReadinessReceipt[] = []): boolean {
  if (normalizeTaskStatus(task.status) !== '着手前') return false
  return getTaskDocStatus(task.id, receipts).state === 'waiting'
}

// 「着手OK」の合図。ステータスとは別レイヤーの"旗"で、着手前タスクにだけ立つ。
//   source='doc'    : 紐付き書類が受領済（自動・第1層）
//   source='manual' : 人が「次やれる」を付けた（任意・第2層。ext_data.ready_reason / ready）
// reason は「なぜ着手OKか」を常に併記するための文言。
export type StartSignal = { ready: boolean; reason: string | null; source: 'doc' | 'manual' | null }

export function getStartSignal(task: TaskRow, receipts: ReadinessReceipt[] = []): StartSignal {
  if (normalizeTaskStatus(task.status) !== '着手前') return { ready: false, reason: null, source: null }
  // 第1層: 書類受領（自動）
  const doc = getTaskDocStatus(task.id, receipts)
  if (doc.state === 'received') return { ready: true, reason: doc.label, source: 'doc' }
  // 第2層: 手動フラグ（任意）。ext_data.ready_reason（文言）or ready=true
  const ext = (task.ext_data ?? {}) as Record<string, unknown>
  const manual = typeof ext.ready_reason === 'string' ? ext.ready_reason.trim() : ''
  if (manual || ext.ready === true) return { ready: true, reason: manual || '着手OK', source: 'manual' }
  return { ready: false, reason: null, source: null }
}
