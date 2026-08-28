// 人（被相続人・相続人）を、戸籍画像のマーカーと同じ色で示す表示部品。
//
// 戸籍まわりの画面では、氏名よりも「誰なのか（続柄・被相続人・依頼者）」で
// 判断することが多いので、続柄を主・氏名を従にする。
//
// 色は戸籍画像に塗るマーカー（imageAnnotations.ts の MARKER_COLORS）と同じ定義を使う。
// 画像に黄色で塗った人が一覧でも黄色になるので、画像と一覧を行き来しても迷わない。
// 続柄そのものでは色を分けない（長男も二男も同じ緑）。マーカーが
// 「被相続人／相続人／亡くなっている相続人」の3区分で定義されているため。

import { MARKER_COLORS } from '@/lib/imageAnnotations'

export type PersonRoleKind = 'deceased' | 'heir' | 'deceasedHeir'

const CSS = Object.fromEntries(MARKER_COLORS.map(c => [c.key, c.css])) as Record<string, string>

/** 区分 → マーカー色。use（被相続人/相続人/亡くなっている相続人）で引くので定義がずれない。 */
export const ROLE_COLOR: Record<PersonRoleKind, string> = {
  deceased: CSS.yellow,
  heir: CSS.green,
  deceasedHeir: CSS.blue,
}

/** 被相続人か・相続人が亡くなっているかで区分を決める */
export function roleKindOf({ isDeceasedPerson, isDeceasedHeir }: {
  isDeceasedPerson?: boolean
  isDeceasedHeir?: boolean | null
}): PersonRoleKind {
  if (isDeceasedPerson) return 'deceased'
  return isDeceasedHeir ? 'deceasedHeir' : 'heir'
}

/** 背景に薄く敷く色（色帯より薄く、文字が読める濃さ） */
export const roleBg = (kind: PersonRoleKind) => `${ROLE_COLOR[kind]}22`

/**
 * 続柄を主・氏名を従に出すチップ。左端の帯がマーカー色。
 * 続柄が未設定なら氏名を主にする（空欄が主役になるのを避ける）。
 */
export function PersonRoleChip({ role, name, kind, isClient = false, note, compact = false }: {
  /** 続柄（被相続人／長男／前妻の子 など） */
  role: string | null | undefined
  name: string | null | undefined
  kind: PersonRoleKind
  /** 依頼者バッジを出すか。色は3色に固定したいので、依頼者は色ではなくバッジで示す */
  isClient?: boolean
  /** 氏名の下に足す一言（「死亡」など） */
  note?: string | null
  compact?: boolean
}) {
  const r = (role ?? '').trim()
  const n = (name ?? '').trim()
  const head = r || n || '未設定'
  const sub = r ? n : ''
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span
        className={`inline-flex flex-col min-w-0 rounded-md ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}
        style={{ borderLeft: `4px solid ${ROLE_COLOR[kind]}`, background: roleBg(kind) }}
      >
        <span className={`${compact ? 'text-[12px]' : 'text-[13px]'} font-semibold text-gray-900 leading-tight truncate`}>{head}</span>
        {(sub || note) && (
          <span className="text-[10.5px] text-gray-500 leading-tight truncate">
            {sub}{sub && note ? ' ・ ' : ''}{note}
          </span>
        )}
      </span>
      {isClient && (
        <span className="flex-none text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-100">依頼者</span>
      )}
    </span>
  )
}

/** 一覧の上などに置く色の凡例。画像のマーカーと同じ意味だと分かるようにする。 */
export function PersonRoleLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 flex-wrap text-[11px] text-gray-500 ${className}`}>
      <span className="text-gray-400">色＝戸籍画像のマーカーと同じ</span>
      {MARKER_COLORS.map(c => (
        <span key={c.key} className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: c.css }} />
          {c.use}
        </span>
      ))}
    </div>
  )
}
