'use client'

import { createContext, useContext } from 'react'
import { isFormerSpouse, isHalfBloodSibling } from '@/lib/constants'
import { buildStirpes, PARENT_TYPES, relOf, type Stirps } from '@/lib/legalShare'
import type { CaseRow, HeirRow } from '@/types'

// 戸籍の取得状況オーバーレイ（氏名→状態＋進捗/結果）。指定時のみ枠色＋ホバーを表示。
export type PersonStatus = { status: string; body: string }
const StatusCtx = createContext<Record<string, PersonStatus>>({})

/**
 * 相続関係説明図 V2（法務局様式準拠）
 *
 * パターン（民法の順位。死亡している人は順位の判定に入れない）:
 *   1. 子（または代襲の孫）がいる … 被相続人＝配偶者（婚姻線）→ 子ら。死亡した子の下に孫
 *   2. 存命の父母がいる            … 父・母（上）→ 被相続人＝配偶者
 *   3. 兄弟姉妹（または甥・姪）     … 父母（故）→ 被相続人＋兄弟姉妹。死亡した兄弟姉妹の下に甥・姪
 *   4. どれもなし                  … 配偶者のみ等
 *
 * 代襲の親は heirs.parent_heir_id（行）か parent_relationship_type（続柄だけ）で結ぶ（legalShare.buildStirpes）。
 * 申出人は「（申出人）」ラベルを氏名横に付与。A4横 印刷に最適化。
 */

type Pattern = 'spouse_children' | 'children_only' | 'parents' | 'siblings'

const labelOf = (h: HeirRow, fallback?: string): string => relOf(h) || fallback || '相続人'
const isFormerSpouseHeir = (h: HeirRow) => isFormerSpouse(relOf(h))
const isHalfBloodHeir = (h: HeirRow) => isHalfBloodSibling(relOf(h))

const BOX_W = 150
const BOX_H = 150
const SPOUSE_GAP = 60
const CHILD_GAP = 24
const V_GAP = 80

/** 株ごとの横幅：親の箱1つ分か、代襲者を並べた幅の大きいほう */
const slotWidth = (s: Stirps) => Math.max(BOX_W, s.reps.length * BOX_W + Math.max(0, s.reps.length - 1) * CHILD_GAP)

export default function InheritanceDiagramV2({
  deceased,
  heirs,
  statusByName = {},
}: {
  deceased: CaseRow
  heirs: HeirRow[]
  statusByName?: Record<string, PersonStatus>
}) {
  const spouse = heirs.find(h => relOf(h) === '配偶者') ?? null
  const formerSpouses = heirs.filter(h => isFormerSpouse(relOf(h)))
  const father = heirs.find(h => relOf(h) === '父') ?? null
  const mother = heirs.find(h => relOf(h) === '母') ?? null
  const childStirpes = buildStirpes(heirs, '子')
  const siblingStirpes = buildStirpes(heirs, '兄弟姉妹')
  const known = new Set<string>([
    ...(spouse ? [spouse.id] : []), ...formerSpouses.map(f => f.id), ...(father ? [father.id] : []), ...(mother ? [mother.id] : []),
    ...childStirpes.flatMap(s => [...(s.head ? [s.head.id] : []), ...s.reps.map(r => r.id)]),
    ...siblingStirpes.flatMap(s => [...(s.head ? [s.head.id] : []), ...s.reps.map(r => r.id)]),
  ])
  const others = heirs.filter(h => !known.has(h.id) && !PARENT_TYPES.includes(relOf(h) as typeof PARENT_TYPES[number]))

  // パターン判定。死亡している人は順位の判定に入れない（死亡した父母がいても兄弟姉妹の図になる）
  const hasChildren = childStirpes.length > 0
  const hasAliveParent = !!((father && !father.is_deceased) || (mother && !mother.is_deceased))
  const pattern: Pattern =
    hasChildren ? (spouse ? 'spouse_children' : 'children_only')
    : hasAliveParent ? 'parents'
    : siblingStirpes.length > 0 ? 'siblings'
    : (spouse ? 'spouse_children' : 'children_only')

  if (pattern === 'parents') {
    return <StatusCtx.Provider value={statusByName}><ParentsLayout deceased={deceased} spouse={spouse} father={father} mother={mother} others={others} /></StatusCtx.Provider>
  }
  if (pattern === 'siblings') {
    return <StatusCtx.Provider value={statusByName}><SiblingsLayout deceased={deceased} spouse={spouse} stirpes={siblingStirpes} father={father} mother={mother} others={[...others, ...formerSpouses]} /></StatusCtx.Provider>
  }

  // ── 子のパターン（配偶者の有無で分岐） ──
  // 前妻・前夫がいる場合は 被相続人の左に並べ、離婚線（点線＋×）でつなぐ。
  // 子は「誰との子か」(other_parent_heir_id) でグループ分けし、線の出どころを変える。
  // 死亡した子の下には孫（代襲）を並べる。
  const formerIds = new Set(formerSpouses.map(f => f.id))
  const groupKeyOf = (s: Stirps) => {
    const h = s.head ?? s.reps[0]
    return h?.other_parent_heir_id && formerIds.has(h.other_parent_heir_id) ? h.other_parent_heir_id : 'current'
  }
  const otherStirpes: Stirps[] = others.map(o => ({ key: o.id, head: o, headLabel: labelOf(o, 'その他'), alive: !o.is_deceased, halfBlood: false, reps: [], orphan: false }))
  const allStirpes = [...childStirpes, ...otherStirpes]
  const groups = [
    ...formerSpouses.map(f => ({ key: f.id, kids: allStirpes.filter(s => groupKeyOf(s) === f.id) })),
    { key: 'current', kids: allStirpes.filter(s => groupKeyOf(s) === 'current') },
  ]
  const slots = groups.flatMap(g => g.kids)
  const hasReps = slots.some(s => s.reps.length > 0)

  const topCount = formerSpouses.length + 1 + (spouse ? 1 : 0)
  const topRowWidth = topCount * BOX_W + (topCount - 1) * SPOUSE_GAP
  const widths = slots.map(slotWidth)
  const childrenRowWidth = slots.length > 0 ? widths.reduce((a, b) => a + b, 0) + (slots.length - 1) * CHILD_GAP : 0

  const canvasWidth = Math.max(topRowWidth, childrenRowWidth, 400) + 80
  const topY = 30
  const childrenY = topY + BOX_H + V_GAP
  const repsY = childrenY + BOX_H + V_GAP
  const canvasHeight = (hasReps ? repsY + BOX_H : slots.length > 0 ? childrenY + BOX_H : topY + BOX_H) + 30

  const topStartX = (canvasWidth - topRowWidth) / 2
  const topBoxX = (i: number) => topStartX + i * (BOX_W + SPOUSE_GAP)
  const formerX = formerSpouses.map((_, i) => topBoxX(i))
  const deceasedX = topBoxX(formerSpouses.length)
  const spouseX = spouse ? topBoxX(formerSpouses.length + 1) : 0

  const marriageY = topY + BOX_H / 2
  const siblingBarY = topY + BOX_H + V_GAP / 2
  const childrenStartX = (canvasWidth - childrenRowWidth) / 2
  // 各株の左端と中心
  const slotX: number[] = []
  { let x = childrenStartX; for (const w of widths) { slotX.push(x); x += w + CHILD_GAP } }
  const slotCenterX = (i: number) => slotX[i] + widths[i] / 2
  const anchorXOf = (key: string) => {
    if (key !== 'current') {
      const i = formerSpouses.findIndex(f => f.id === key)
      return formerX[i] + BOX_W + SPOUSE_GAP / 2
    }
    return spouse ? deceasedX + BOX_W + SPOUSE_GAP / 2 : deceasedX + BOX_W / 2
  }
  let cursor = 0
  const groupSpans = groups.map(g => { const start = cursor; cursor += g.kids.length; return { key: g.key, count: g.kids.length, start } })

  return (
    <StatusCtx.Provider value={statusByName}>
    <div className="overflow-auto bg-white print:overflow-visible" style={{ minHeight: 300 }}>
      <div className="relative mx-auto" style={{ width: canvasWidth, height: canvasHeight }}>
        <svg className="absolute top-0 left-0 pointer-events-none" width={canvasWidth} height={canvasHeight} style={{ zIndex: 1 }}>
          {spouse && (
            <>
              <line x1={deceasedX + BOX_W} y1={marriageY - 3} x2={spouseX} y2={marriageY - 3} stroke="#111" strokeWidth="1.5" />
              <line x1={deceasedX + BOX_W} y1={marriageY + 3} x2={spouseX} y2={marriageY + 3} stroke="#111" strokeWidth="1.5" />
            </>
          )}
          {formerSpouses.map((f, i) => {
            const x1 = formerX[i] + BOX_W, x2 = deceasedX, mid = (x1 + x2) / 2
            return (
              <g key={f.id}>
                <line x1={x1} y1={marriageY - 3} x2={x2} y2={marriageY - 3} stroke="#111" strokeWidth="1.5" strokeDasharray="5 4" />
                <line x1={x1} y1={marriageY + 3} x2={x2} y2={marriageY + 3} stroke="#111" strokeWidth="1.5" strokeDasharray="5 4" />
                <line x1={mid - 7} y1={marriageY - 8} x2={mid + 7} y2={marriageY + 8} stroke="#111" strokeWidth="1.8" />
                <line x1={mid + 7} y1={marriageY - 8} x2={mid - 7} y2={marriageY + 8} stroke="#111" strokeWidth="1.8" />
              </g>
            )
          })}
          {/* 子への線。グループ（誰との子か）ごとに出どころを変える */}
          {groupSpans.filter(g => g.count > 0).map(g => {
            const ax = anchorXOf(g.key)
            const first = slotCenterX(g.start)
            const last = slotCenterX(g.start + g.count - 1)
            const fromY = g.key !== 'current' || spouse ? marriageY : topY + BOX_H
            return (
              <g key={g.key}>
                <line x1={ax} y1={fromY} x2={ax} y2={siblingBarY} stroke="#111" strokeWidth="1.5" />
                <line x1={Math.min(ax, first)} y1={siblingBarY} x2={Math.max(ax, last)} y2={siblingBarY} stroke="#111" strokeWidth="1.5" />
                {Array.from({ length: g.count }, (_, k) => {
                  const cx = slotCenterX(g.start + k)
                  return <line key={k} x1={cx} y1={siblingBarY} x2={cx} y2={childrenY} stroke="#111" strokeWidth="1.5" />
                })}
              </g>
            )
          })}
          {/* 代襲：死亡した子の真下に孫。子の箱の底 → 横線 → 各孫 */}
          <RepLines stirpes={slots} slotX={slotX} widths={widths} headY={childrenY} repsY={repsY} />
        </svg>

        {formerSpouses.map((f, i) => (
          <PersonBox key={f.id} x={formerX[i]} y={topY} width={BOX_W} label={labelOf(f, '前配偶者')} labelBg="bg-gray-50 text-gray-500"
            borderClass="border-[1.5px] border-dashed border-gray-400" name={f.name} birthDate={f.birth_date} address={f.address} registeredAddress={f.registered_address} notHeir />
        ))}
        <PersonBox x={deceasedX} y={topY} width={BOX_W} label="被相続人" labelBg="bg-gray-800 text-white" borderClass="border-[3px] border-black"
          name={deceased.deceased_name} birthDate={deceased.deceased_birth_date} deathDate={deceased.date_of_death} address={deceased.deceased_address} registeredAddress={deceased.deceased_registered_address} isDeceased />
        {spouse && <HeirBox heir={spouse} x={spouseX} y={topY} label="配偶者" />}

        {slots.map((s, i) => (
          <StirpsBoxes key={s.key} s={s} x={slotX[i]} width={widths[i]} headY={childrenY} repsY={repsY}
            noteBadge={groupKeyOf(s) !== 'current' ? '前婚の子' : undefined} fallbackLabel="子" />
        ))}
      </div>
    </div>
    </StatusCtx.Provider>
  )
}

/** 株の親（または親の仮の箱）と、その下の代襲者 */
function StirpsBoxes({ s, x, width, headY, repsY, noteBadge, fallbackLabel }: { s: Stirps; x: number; width: number; headY: number; repsY: number; noteBadge?: string; fallbackLabel: string }) {
  const headX = x + (width - BOX_W) / 2
  const half = isHalfBloodSibling(s.headLabel)
  const badge = noteBadge ?? (half ? '半血（相続分1/2）' : undefined)
  return (
    <>
      {s.orphan ? (
        // 親の紐づけが無い代襲者は、そのまま1人分の箱として置く（親の欄で紐づけると下段に移る）
        <HeirBox heir={s.reps[0]} x={headX} y={headY} label={labelOf(s.reps[0], fallbackLabel)} noteBadge="親の紐づけなし" />
      ) : s.head ? (
        <HeirBox heir={s.head} x={headX} y={headY} label={labelOf(s.head, fallbackLabel)} noteBadge={badge} />
      ) : (
        // 親が行として登録されていない（続柄だけ）。点線の仮の箱を置いて、その下に代襲者を並べる
        <PersonBox x={headX} y={headY} width={BOX_W} label={s.headLabel} labelBg="bg-gray-50 text-gray-500" borderClass="border-[1.5px] border-dashed border-gray-400"
          name="（氏名未登録）" isDeceased noteBadge={half ? '半血（相続分1/2）' : undefined} />
      )}
      {!s.orphan && s.reps.map((r, k) => (
        <HeirBox key={r.id} heir={r} x={x + k * (BOX_W + CHILD_GAP)} y={repsY} label={labelOf(r)} noteBadge="代襲" />
      ))}
    </>
  )
}

/** 代襲者への線（親の箱の底から横線、各代襲者へ縦線） */
function RepLines({ stirpes, slotX, widths, headY, repsY }: { stirpes: Stirps[]; slotX: number[]; widths: number[]; headY: number; repsY: number }) {
  const barY = headY + BOX_H + V_GAP / 2
  return (
    <>
      {stirpes.map((s, i) => {
        if (s.orphan || s.reps.length === 0) return null
        const headCx = slotX[i] + widths[i] / 2
        const first = slotX[i] + BOX_W / 2
        const last = slotX[i] + (s.reps.length - 1) * (BOX_W + CHILD_GAP) + BOX_W / 2
        return (
          <g key={s.key}>
            <line x1={headCx} y1={headY + BOX_H} x2={headCx} y2={barY} stroke="#111" strokeWidth="1.5" />
            <line x1={Math.min(headCx, first)} y1={barY} x2={Math.max(headCx, last)} y2={barY} stroke="#111" strokeWidth="1.5" />
            {s.reps.map((r, k) => {
              const cx = slotX[i] + k * (BOX_W + CHILD_GAP) + BOX_W / 2
              return <line key={r.id} x1={cx} y1={barY} x2={cx} y2={repsY} stroke="#111" strokeWidth="1.5" />
            })}
          </g>
        )
      })}
    </>
  )
}

// ─── 親パターン用レイアウト（存命の父母がいる） ───
function ParentsLayout({ deceased, spouse, father, mother, others }: {
  deceased: CaseRow; spouse: HeirRow | null; father: HeirRow | null; mother: HeirRow | null; others: HeirRow[]
}) {
  const parents = [father, mother].filter((p): p is HeirRow => !!p)
  const parentsRowWidth = parents.length * BOX_W + (parents.length - 1) * SPOUSE_GAP
  const middleRowWidth = spouse ? BOX_W * 2 + SPOUSE_GAP : BOX_W
  const bottomRowWidth = others.length > 0 ? others.length * BOX_W + (others.length - 1) * CHILD_GAP : 0
  const canvasWidth = Math.max(parentsRowWidth, middleRowWidth, bottomRowWidth, 400) + 80
  const parentsY = 30
  const middleY = parentsY + BOX_H + V_GAP
  const bottomY = middleY + BOX_H + V_GAP
  const canvasHeight = (others.length > 0 ? bottomY + BOX_H : middleY + BOX_H) + 30
  const parentsStartX = (canvasWidth - parentsRowWidth) / 2
  const middleStartX = (canvasWidth - middleRowWidth) / 2
  const deceasedX = middleStartX
  const spouseX = spouse ? middleStartX + BOX_W + SPOUSE_GAP : 0
  const parentsAnchorX = parents.length === 2 ? parentsStartX + BOX_W + SPOUSE_GAP / 2 : parentsStartX + BOX_W / 2
  const deceasedTopX = deceasedX + BOX_W / 2

  return (
    <div className="overflow-auto bg-white print:overflow-visible" style={{ minHeight: 300 }}>
      <div className="relative mx-auto" style={{ width: canvasWidth, height: canvasHeight }}>
        <svg className="absolute top-0 left-0 pointer-events-none" width={canvasWidth} height={canvasHeight} style={{ zIndex: 1 }}>
          {parents.length === 2 && (
            <>
              <line x1={parentsStartX + BOX_W} y1={parentsY + BOX_H / 2 - 3} x2={parentsStartX + BOX_W + SPOUSE_GAP} y2={parentsY + BOX_H / 2 - 3} stroke="#111" strokeWidth="1.5" />
              <line x1={parentsStartX + BOX_W} y1={parentsY + BOX_H / 2 + 3} x2={parentsStartX + BOX_W + SPOUSE_GAP} y2={parentsY + BOX_H / 2 + 3} stroke="#111" strokeWidth="1.5" />
            </>
          )}
          <line x1={parentsAnchorX} y1={parents.length === 2 ? parentsY + BOX_H / 2 : parentsY + BOX_H} x2={parentsAnchorX} y2={middleY - V_GAP / 2} stroke="#111" strokeWidth="1.5" />
          <line x1={parentsAnchorX} y1={middleY - V_GAP / 2} x2={deceasedTopX} y2={middleY - V_GAP / 2} stroke="#111" strokeWidth="1.5" />
          <line x1={deceasedTopX} y1={middleY - V_GAP / 2} x2={deceasedTopX} y2={middleY} stroke="#111" strokeWidth="1.5" />
          {spouse && (
            <>
              <line x1={deceasedX + BOX_W} y1={middleY + BOX_H / 2 - 3} x2={spouseX} y2={middleY + BOX_H / 2 - 3} stroke="#111" strokeWidth="1.5" />
              <line x1={deceasedX + BOX_W} y1={middleY + BOX_H / 2 + 3} x2={spouseX} y2={middleY + BOX_H / 2 + 3} stroke="#111" strokeWidth="1.5" />
            </>
          )}
        </svg>
        {parents.map((p, i) => <HeirBox key={p.id} heir={p} x={parentsStartX + i * (BOX_W + SPOUSE_GAP)} y={parentsY} label={labelOf(p, '親')} />)}
        <PersonBox x={deceasedX} y={middleY} width={BOX_W} label="被相続人" labelBg="bg-gray-800 text-white" borderClass="border-[3px] border-black"
          name={deceased.deceased_name} birthDate={deceased.deceased_birth_date} deathDate={deceased.date_of_death} address={deceased.deceased_address} registeredAddress={deceased.deceased_registered_address} isDeceased />
        {spouse && <HeirBox heir={spouse} x={spouseX} y={middleY} label="配偶者" />}
        {others.map((o, i) => <HeirBox key={o.id} heir={o} x={(canvasWidth - bottomRowWidth) / 2 + i * (BOX_W + CHILD_GAP)} y={bottomY} label={labelOf(o, 'その他')} />)}
      </div>
    </div>
  )
}

// ─── 兄弟姉妹パターン用レイアウト ───
// 父母（故）から 被相続人＋兄弟姉妹 を横並びに接続。死亡した兄弟姉妹の下に甥・姪（代襲）。
// 父母が行として登録されていれば、その名前を「故」で上の箱に出す。
function SiblingsLayout({ deceased, spouse, stirpes, father, mother, others }: {
  deceased: CaseRow; spouse: HeirRow | null; stirpes: Stirps[]; father: HeirRow | null; mother: HeirRow | null; others: HeirRow[]
}) {
  const otherStirpes: Stirps[] = others.map(o => ({ key: o.id, head: o, headLabel: labelOf(o, 'その他'), alive: !o.is_deceased, halfBlood: false, reps: [], orphan: false }))
  const slots = [...stirpes, ...otherStirpes]
  const widths = slots.map(slotWidth)
  const hasReps = slots.some(s => s.reps.length > 0)

  const deceasedX = 40
  const spouseX = spouse ? deceasedX + BOX_W + SPOUSE_GAP : null
  const postStartX = spouse ? spouseX! + BOX_W + SPOUSE_GAP : deceasedX + BOX_W + CHILD_GAP
  const postWidth = slots.length > 0 ? widths.reduce((a, b) => a + b, 0) + (slots.length - 1) * CHILD_GAP : 0
  const canvasWidth = Math.max(postStartX + postWidth - deceasedX + 80, 500)

  const parentsY = 30
  const topY = parentsY + 60
  const repsY = topY + BOX_H + V_GAP
  const canvasHeight = (hasReps ? repsY + BOX_H : topY + BOX_H) + 30

  const slotX: number[] = []
  { let x = postStartX; for (const w of widths) { slotX.push(x); x += w + CHILD_GAP } }
  const slotCenterX = (i: number) => slotX[i] + widths[i] / 2
  const deceasedCenterX = deceasedX + BOX_W / 2
  const lastCenterX = slots.length > 0 ? slotCenterX(slots.length - 1) : deceasedCenterX
  const virtualParentX = (deceasedCenterX + lastCenterX) / 2
  const siblingBarY = topY - V_GAP / 2

  const parentText = (() => {
    const parts: string[] = []
    if (father) parts.push(`故 父 ${father.name || ''}`.trim())
    if (mother) parts.push(`故 母 ${mother.name || ''}`.trim())
    return parts.length > 0 ? parts.join('　') : '父母（死亡）'
  })()
  const parentBoxW = Math.max(110, parentText.length * 11 + 24)

  return (
    <div className="overflow-auto bg-white print:overflow-visible" style={{ minHeight: 300 }}>
      <div className="relative mx-auto" style={{ width: canvasWidth, height: canvasHeight }}>
        <svg className="absolute top-0 left-0 pointer-events-none" width={canvasWidth} height={canvasHeight} style={{ zIndex: 1 }}>
          <rect x={virtualParentX - parentBoxW / 2} y={parentsY} width={parentBoxW} height="32" fill="white" stroke="#999" strokeWidth="1" strokeDasharray="4 3" />
          <text x={virtualParentX} y={parentsY + 20} textAnchor="middle" fontSize="11" fill="#666">{parentText}</text>
          <line x1={virtualParentX} y1={parentsY + 32} x2={virtualParentX} y2={siblingBarY} stroke="#999" strokeWidth="1" strokeDasharray="4 3" />
          {slots.length > 0 && <line x1={deceasedCenterX} y1={siblingBarY} x2={lastCenterX} y2={siblingBarY} stroke="#111" strokeWidth="1.5" />}
          <line x1={deceasedCenterX} y1={siblingBarY} x2={deceasedCenterX} y2={topY} stroke="#111" strokeWidth="1.5" />
          {slots.map((_, i) => <line key={i} x1={slotCenterX(i)} y1={siblingBarY} x2={slotCenterX(i)} y2={topY} stroke="#111" strokeWidth="1.5" />)}
          {spouse && spouseX !== null && (
            <>
              <line x1={deceasedX + BOX_W} y1={topY + BOX_H / 2 - 3} x2={spouseX} y2={topY + BOX_H / 2 - 3} stroke="#111" strokeWidth="1.5" />
              <line x1={deceasedX + BOX_W} y1={topY + BOX_H / 2 + 3} x2={spouseX} y2={topY + BOX_H / 2 + 3} stroke="#111" strokeWidth="1.5" />
            </>
          )}
          <RepLines stirpes={slots} slotX={slotX} widths={widths} headY={topY} repsY={repsY} />
        </svg>

        <PersonBox x={deceasedX} y={topY} width={BOX_W} label="被相続人" labelBg="bg-gray-800 text-white" borderClass="border-[3px] border-black"
          name={deceased.deceased_name} birthDate={deceased.deceased_birth_date} deathDate={deceased.date_of_death} address={deceased.deceased_address} registeredAddress={deceased.deceased_registered_address} isDeceased />
        {slots.map((s, i) => <StirpsBoxes key={s.key} s={s} x={slotX[i]} width={widths[i]} headY={topY} repsY={repsY} fallbackLabel="兄弟姉妹" />)}
        {spouse && spouseX !== null && <HeirBox heir={spouse} x={spouseX} y={topY} label="配偶者" />}
      </div>
    </div>
  )
}

/** 相続人の行から PersonBox を描く（属性の受け渡しをまとめる） */
function HeirBox({ heir, x, y, label, noteBadge }: { heir: HeirRow; x: number; y: number; label: string; noteBadge?: string }) {
  const former = isFormerSpouseHeir(heir)
  return (
    <PersonBox
      x={x} y={y} width={BOX_W} label={label}
      labelBg={former ? 'bg-gray-50 text-gray-500' : 'bg-gray-100 text-gray-700'}
      borderClass={former ? 'border-[1.5px] border-dashed border-gray-400' : 'border-[1.5px] border-black'}
      name={heir.name} birthDate={heir.birth_date} address={heir.address} registeredAddress={heir.registered_address}
      isLegalHeir={heir.is_legal_heir} livedTogether={heir.lived_together} isDeceased={heir.is_deceased}
      isApplicant={heir.is_applicant} isClient={heir.is_client} notHeir={former}
      noteBadge={noteBadge ?? (isHalfBloodHeir(heir) ? '半血（相続分1/2）' : undefined)}
    />
  )
}

// ─── 人物ボックス ───
function PersonBox({
  x, y, width, label, labelBg, borderClass,
  name, birthDate, deathDate, address, registeredAddress,
  isDeceased, isLegalHeir, isApplicant, isClient, livedTogether, notHeir, noteBadge,
}: {
  x: number
  y: number
  width: number
  label: string
  labelBg: string
  borderClass: string
  name?: string | null
  birthDate?: string | null
  deathDate?: string | null
  address?: string | null
  registeredAddress?: string | null
  isDeceased?: boolean
  isLegalHeir?: boolean
  isApplicant?: boolean
  /** この案件を依頼した相続人（heirs.is_client）。誰が窓口かひと目で分かるように出す */
  isClient?: boolean
  /** 被相続人と同居していた相続人。書類回収・連絡の起点になるため図で分かるようにする。 */
  livedTogether?: boolean
  /** 相続人ではない関係者（前妻・前夫）。「相続人ではない」と明記する。 */
  notHeir?: boolean
  /** 氏名の下に出す注記バッジ（前婚の子・半血・代襲 など） */
  noteBadge?: string
}) {
  // 戸籍取得状況オーバーレイ（指定時のみ）：完了=太緑/対応中=青/追加調査中=オレンジ/未着手=既定枠
  const statusMap = useContext(StatusCtx)
  const ps = name ? statusMap[name.trim()] : undefined
  const statusBorder = ps?.status === '完了' ? 'border-[3px] border-emerald-600'
    : ps?.status === '対応中' ? 'border-2 border-blue-500'
    : ps?.status === '追加調査中' ? 'border-2 border-amber-500'
    : borderClass
  const statusBadge = ps && ps.status !== '未着手' ? ps.status : (ps ? '未着手' : null)
  const badgeCls = ps?.status === '完了' ? 'bg-emerald-50 text-emerald-700'
    : ps?.status === '対応中' ? 'bg-blue-50 text-blue-600'
    : ps?.status === '追加調査中' ? 'bg-amber-50 text-amber-600'
    : 'bg-gray-100 text-gray-400'
  return (
    <div className="absolute" style={{ left: x, top: y, width, zIndex: 2 }} title={ps?.body ? `【${ps.status}】${ps.body}` : undefined}>
      <div className={`${ps ? statusBorder : borderClass} bg-white text-center`}>
        <div className={`text-[11px] tracking-widest py-1 border-b border-black font-semibold ${labelBg} relative`}>
          {label}
          {statusBadge && <span className={`absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-semibold px-1.5 rounded-full ${badgeCls}`}>{statusBadge}</span>}
        </div>
        <div className="p-2 flex flex-col items-center gap-1">
          <div className="text-[13px] font-bold tracking-wider flex items-center gap-1 flex-wrap justify-center">
            {name ?? '—'}
            {isClient && <span className="text-[9.5px] font-bold text-brand-700 bg-brand-50 border border-brand-200 rounded px-1 py-px">依頼者</span>}
            {isApplicant && <span className="text-[11px] font-semibold text-red-600">（申出人）</span>}
            {livedTogether && <span className="text-[9.5px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1 py-px">同居</span>}
            {noteBadge && <span className="text-[9.5px] font-bold text-gray-600 bg-gray-100 border border-gray-200 rounded px-1 py-px">{noteBadge}</span>}
          </div>
          <div className="text-[11px] text-gray-700 text-left w-full px-1 leading-relaxed">
            {birthDate && <div><span className="text-gray-400">出生</span> {birthDate}</div>}
            {deathDate && <div><span className="text-gray-400">死亡</span> {deathDate}</div>}
            {address && <div className="truncate" title={address}><span className="text-gray-400">{isDeceased ? '最後の住所' : '住所'}</span> {address}</div>}
            {registeredAddress && <div className="truncate" title={registeredAddress}><span className="text-gray-400">{isDeceased ? '最後の本籍' : '本籍'}</span> {registeredAddress}</div>}
          </div>
          {isDeceased && (
            <div className="w-[30px] h-[30px] border-[1.5px] border-red-600 rounded-full flex items-center justify-center text-[10px] text-red-600 font-bold mt-1">死亡</div>
          )}
          {!isDeceased && isLegalHeir && !notHeir && <div className="text-[11px] text-green-700 font-semibold mt-1">（法定相続人）</div>}
          {notHeir && <div className="text-[11px] text-gray-400 font-semibold mt-1">（相続人ではない）</div>}
        </div>
      </div>
    </div>
  )
}
