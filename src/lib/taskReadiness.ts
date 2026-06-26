// 事務管理タスクの「Readiness」判定。
// 着手前タスクを Ready（着手OK）／ Waiting（待ち） に分類する。
//
// Phase 1（現状）：
//   - 完了/対応中はそのまま
//   - 着手前は既定 Ready（明示的に待ち事由がなければ着手可能）
//   - 受信簿 (document_receipts) で started_task_id がタスクに紐づくが
//     received_date が null のものがあれば「●●受領待ち」として Waiting
//
// 将来：前提タスク（dependsOn）が追加された時点で「●●完了待ち」も判定する。

import type { TaskRow } from '@/types'

export type Readiness = 'ready' | 'doing' | 'waiting' | 'done'

// 受信簿の最低限な行型（このヘルパーに必要なフィールドだけ）
export type ReadinessReceipt = {
  started_task_id: string | null
  received_date: string | null
  /** 表示用のラベル（例: "戸籍 江東区役所" or "金融資産 みずほ銀行"）。任意。 */
  display_label?: string | null
}

// 受信簿（TimelineReceipt 形式）を Readiness 判定用に変換する。
// started_task_id と item_tasks（複数タスク紐付け）を1行ずつに展開する。
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

const normalize = (s: string) => {
  if (s === '未着手') return '着手前'
  if (['Wチェック待ち', '保留', '差戻し'].includes(s)) return '対応中'
  if (s === 'キャンセル') return '完了'
  return s
}

export function classifyTask(task: TaskRow, receipts: ReadinessReceipt[] = []): { readiness: Readiness; waitingFor?: string } {
  const s = normalize(task.status)
  if (s === '完了') return { readiness: 'done' }
  if (s === '対応中') return { readiness: 'doing' }

  // 着手前のとき：このタスクに紐づく受信簿アイテムを探す
  const linked = receipts.filter(r => r.started_task_id === task.id)
  const pending = linked.filter(r => !r.received_date)
  if (pending.length > 0) {
    const labels = pending.map(r => r.display_label).filter((v): v is string => !!v && v.trim() !== '')
    const waitingFor = labels.length > 0
      ? `${labels.slice(0, 2).join(' / ')}${labels.length > 2 ? ` ほか${labels.length - 2}件` : ''} 受領待ち`
      : `受領待ち（${pending.length}件）`
    return { readiness: 'waiting', waitingFor }
  }

  // Ready：着手前 かつ 紐づく書類が無い or 全部受領済み
  // received_date があるアイテムがあれば「届いた書類で着手可能」を示す
  const arrived = linked.filter(r => r.received_date)
  if (arrived.length > 0) {
    const labels = arrived.map(r => r.display_label).filter((v): v is string => !!v && v.trim() !== '')
    const arrivedNote = labels.length > 0
      ? `${labels.slice(0, 2).join(' / ')}${labels.length > 2 ? ` ほか${labels.length - 2}件` : ''} 受領済`
      : `受領済（${arrived.length}件）`
    return { readiness: 'ready', waitingFor: arrivedNote }
  }
  return { readiness: 'ready' }
}

export const READINESS_META: Record<Readiness, { label: string; dot: string; bg: string; text: string }> = {
  ready:   { label: '🔔 着手OK', dot: 'bg-amber-500',    bg: 'bg-amber-50',    text: 'text-amber-700' },
  doing:   { label: '🟡 対応中', dot: 'bg-brand-500',    bg: 'bg-brand-50',    text: 'text-brand-700' },
  waiting: { label: '⏳ 待ち',   dot: 'bg-gray-400',     bg: 'bg-gray-50',     text: 'text-gray-600' },
  done:    { label: '✓ 完了',   dot: 'bg-emerald-500',  bg: 'bg-emerald-50',  text: 'text-emerald-700' },
}
