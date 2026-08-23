// 担当区分バッジ。そのタスクを誰が持つのかをひと目で判別できるように統一表示する。
//   事務管理担当 … ピンク   （task_kind='case'）
//   管理担当     … 薄い緑   （task_kind='system' で管理担当あて）
//   受注担当     … 薄い青   （task_kind='system' で受注担当あて）
//   相続登記T    … 薄い紫   （task_kind='touki_team'）
//
// 以前は「受注/管理」をひとまとめにしていたが、誰のタスクなのかが読めなかったので分けた。
// 事務管理＝ピンク／管理担当＝みどり は事務管理進捗の線表の丸の色とそろえている。
//
// タスク一覧の担当区分列・到着管理簿の紐付け候補・完了モーダルの次タスク候補・
// タスク追加の候補一覧 で共通利用する。

import { ClipboardList, Compass, Megaphone, Stamp } from 'lucide-react'

export type TaskKind = 'case' | 'system' | 'touki_team' | string | null | undefined
export type TantoKubun = 'assistant' | 'manager' | 'sales' | 'touki'

type Variant = {
  label: string
  cls: string       // 通常バッジ (薄背景+枠)
  chipCls: string   // 濃色チップ用 (選択済みピル内など)
  Icon: typeof ClipboardList
}

const VARIANTS: Record<TantoKubun, Variant> = {
  assistant: {
    label: '事務管理担当',
    cls: 'bg-pink-50 text-pink-700 border-pink-200',
    chipCls: 'bg-white/25 text-white',
    Icon: ClipboardList,
  },
  manager: {
    label: '管理担当',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    chipCls: 'bg-white/25 text-white',
    Icon: Compass,
  },
  sales: {
    label: '受注担当',
    cls: 'bg-sky-50 text-sky-700 border-sky-200',
    chipCls: 'bg-white/25 text-white',
    Icon: Megaphone,
  },
  touki: {
    label: '相続登記T',
    cls: 'bg-violet-50 text-violet-700 border-violet-200',
    chipCls: 'bg-white/25 text-white',
    Icon: Stamp,
  },
}

/** タスク（の担当区分に関わる列）から担当区分を求める。system は受注/管理を役割で分ける。 */
export function tantoKubunOf(t: {
  task_kind?: TaskKind
  work_role?: string | null
  assign_role?: string | null
}): TantoKubun {
  if (t.task_kind === 'touki_team') return 'touki'
  if (t.task_kind === 'system') {
    const role = t.assign_role ?? t.work_role
    return role === 'sales' ? 'sales' : 'manager'   // 役割が入っていない古いデータは管理担当扱い
  }
  return 'assistant'   // case / null / 未知値
}

// 通常バッジ（薄背景＋枠・アイコン付き）
export function TantoKubunBadge({ task, size = 'sm', iconOnly = false, className = '' }: {
  task: { task_kind?: TaskKind; work_role?: string | null; assign_role?: string | null }
  size?: 'xs' | 'sm'
  iconOnly?: boolean
  className?: string
}) {
  const v = VARIANTS[tantoKubunOf(task)]
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
  const iconSz = size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-semibold whitespace-nowrap align-middle ${pad} ${v.cls} ${className}`}
      title={`担当区分：${v.label}`}
    >
      <v.Icon className={iconSz} strokeWidth={2} />
      {!iconOnly && v.label}
    </span>
  )
}

// 濃色ピル（選択済みピル）内で使う 小型ラベル（背景は親の濃色に乗せる）
export function TantoKubunChip({ task }: { task: { task_kind?: TaskKind; work_role?: string | null; assign_role?: string | null } }) {
  const v = VARIANTS[tantoKubunOf(task)]
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold ${v.chipCls}`}>
      {v.label}
    </span>
  )
}

export function tantoKubunLabel(task: { task_kind?: TaskKind; work_role?: string | null; assign_role?: string | null }): string {
  return VARIANTS[tantoKubunOf(task)].label
}
