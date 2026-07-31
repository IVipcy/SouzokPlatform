// 担当区分バッジ。tasks.task_kind をひと目で判別できるように統一表示する。
//   case       → 事務管理（グレー）
//   system     → 受注/管理担当（紫）
//   touki_team → 相続登記チーム（水色）
// 到着管理簿の紐付け候補・完了モーダルの次タスク候補・一括生成候補 で共通利用する。
// デザインシステム(青=構造/緑=完了/琥珀=進行中/赤=危険)と衝突しない中間色を割り当て。

import { ClipboardList, Compass, Stamp } from 'lucide-react'

export type TaskKind = 'case' | 'system' | 'touki_team' | string | null | undefined

type Variant = {
  label: string
  cls: string       // 通常バッジ (薄背景+枠)
  chipCls: string   // 濃色チップ用 (選択済みピル内など)
  Icon: typeof ClipboardList
}

const VARIANTS: Record<'case' | 'system' | 'touki_team', Variant> = {
  case: {
    label: '事務管理',
    cls: 'bg-slate-100 text-slate-600 border-slate-300',
    chipCls: 'bg-white/25 text-white',
    Icon: ClipboardList,
  },
  system: {
    label: '受注/管理',
    cls: 'bg-violet-50 text-violet-700 border-violet-300',
    chipCls: 'bg-white/25 text-white',
    Icon: Compass,
  },
  touki_team: {
    label: '相続登記チーム',
    cls: 'bg-sky-50 text-sky-700 border-sky-300',
    chipCls: 'bg-white/25 text-white',
    Icon: Stamp,
  },
}

function variantFor(kind: TaskKind): Variant {
  if (kind === 'system') return VARIANTS.system
  if (kind === 'touki_team') return VARIANTS.touki_team
  return VARIANTS.case  // null/undefined/未知値 は事務管理扱い
}

// 通常バッジ（薄背景＋枠・アイコン付き）
export function TantoKubunBadge({ kind, size = 'sm', iconOnly = false, className = '' }: {
  kind: TaskKind
  size?: 'xs' | 'sm'
  iconOnly?: boolean
  className?: string
}) {
  const v = variantFor(kind)
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
export function TantoKubunChip({ kind }: { kind: TaskKind }) {
  const v = variantFor(kind)
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold ${v.chipCls}`}>
      {v.label}
    </span>
  )
}

export function tantoKubunLabel(kind: TaskKind): string {
  return variantFor(kind).label
}
