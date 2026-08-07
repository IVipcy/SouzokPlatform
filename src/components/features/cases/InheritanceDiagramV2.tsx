'use client'

import { createContext, useContext } from 'react'
import { isFormerSpouse, isHalfBloodSibling } from '@/lib/constants'
import AnnotatedImage from './AnnotatedImage'
import type { Anno } from '@/lib/imageAnnotations'
import type { CaseRow, HeirRow } from '@/types'

// 戸籍の取得状況オーバーレイ（氏名→状態＋進捗/結果）。指定時のみ枠色＋ホバーを表示。
export type PersonStatus = { status: string; body: string }
const StatusCtx = createContext<Record<string, PersonStatus>>({})

// 各人の戸籍画像（氏名→画像）。図の箱の右に小さく並べ、押すと拡大できる。
// 印刷（相続関係説明図そのもの）には出さない。
export type DiagramImage = { id: string; url?: string; annos: Anno[]; label?: string | null }
type ImagesCtxValue = { byName: Record<string, DiagramImage[]>; onOpen?: (img: DiagramImage) => void }
const ImagesCtx = createContext<ImagesCtxValue>({ byName: {} })
/** 箱の右に出すサムネイルの幅（px）。この分だけ箱の間隔を広げる */
const THUMB_W = 48
const THUMB_GAP = 6
const MAX_THUMBS = 3
/** 画像を出すときに図の右へ足す余白（右端の人のサムネイルがはみ出さないように） */
function useImagePad() {
  const { byName } = useContext(ImagesCtx)
  return Object.values(byName).some(v => v.length > 0) ? THUMB_W + THUMB_GAP * 2 : 0
}

/**
 * 相続関係説明図 V2（法務局様式準拠・3パターン対応）
 *
 * 対応パターン:
 *   1. 配偶者＋子         … 被相続人＝配偶者（婚姻線）→ 子ら（兄弟姉妹線）
 *   2. 子のみ             … 被相続人 → 子ら
 *   3. 配偶者＋親         … 父・母（上）→ 被相続人＝配偶者
 *
 * 申出人は「（申出人）」ラベルを氏名横に付与。
 * A4横 印刷に最適化。
 */

type Pattern = 'spouse_children' | 'children_only' | 'parents' | 'siblings'

// 箱に出す続柄ラベル。面談シートは relationship_type（長男・二女など）に保存するため、
// まずそれを使う。大分類（子・兄弟姉妹）に丸めるのは、どちらも未入力のときだけ。
// ※ レイアウトが複数コンポーネントに分かれているのでモジュールスコープに置く。
const labelOf = (h: HeirRow, fallback?: string): string =>
  h.relationship_type || h.relationship || fallback || '相続人'
/** 前妻・前夫の行か（相続人ではないが、その人との子の線の出どころになるので図に描く） */
const isFormerSpouseHeir = (h: HeirRow) => isFormerSpouse(h.relationship_type || h.relationship)
/** 半血のきょうだいか（相続分が全血の1/2） */
const isHalfBloodHeir = (h: HeirRow) => isHalfBloodSibling(h.relationship_type || h.relationship)

export default function InheritanceDiagramV2({
  deceased,
  heirs,
  statusByName = {},
  imagesByName = {},
  onOpenImage,
}: {
  deceased: CaseRow
  heirs: HeirRow[]
  statusByName?: Record<string, PersonStatus>
  /** 氏名→その人の戸籍画像。渡すと各箱の右にサムネイルが並ぶ */
  imagesByName?: Record<string, DiagramImage[]>
  onOpenImage?: (img: DiagramImage) => void
}) {
  // 続柄を相関図のカテゴリ（配偶者/子/父/母/兄弟姉妹/その他）に正規化。
  // relationship_type（長男・次男・孫 等）も relationship（フリー）も同じ判定に通す。
  type Cat = '配偶者' | '前配偶者' | '子' | '父' | '母' | '兄弟姉妹' | 'その他'
  const typeOf = (h: HeirRow): Cat => {
    const r = h.relationship_type || h.relationship || ''
    if (r === '配偶者') return '配偶者'
    // 前妻・前夫は相続人ではないが、その人との子の線を引くために図には描く
    if (isFormerSpouse(r)) return '前配偶者'
    // 第1順位＝子（実子・養子）と代襲（孫・ひ孫）は子（直系卑属）として扱う
    if (['子', '長男', '長女', '二男', '二女', '三男', '三女', '養子', '次男', '次女', '孫', 'ひ孫'].includes(r)) return '子'
    if (r === '父') return '父'
    if (r === '母') return '母'
    // 第3順位＝兄弟姉妹と代襲（甥・姪）。異母／異父（半血）も同じ位置に置き、箱に「半血」バッジを出す
    if (['兄弟姉妹', '兄', '姉', '弟', '妹', '甥', '姪', '異母兄弟姉妹', '異父兄弟姉妹'].includes(r)) return '兄弟姉妹'
    return 'その他'
  }

  const spouse = heirs.find(h => typeOf(h) === '配偶者') ?? null
  const formerSpouses = heirs.filter(h => typeOf(h) === '前配偶者')
  const children = heirs.filter(h => typeOf(h) === '子')
  const father = heirs.find(h => typeOf(h) === '父') ?? null
  const mother = heirs.find(h => typeOf(h) === '母') ?? null
  const siblings = heirs.filter(h => typeOf(h) === '兄弟姉妹')
  const others = heirs.filter(h => typeOf(h) === 'その他')

  // パターン判定（民法順位ベース）
  // 1. 子がいる → 配偶者＋子 or 子のみ
  // 2. 親がいる（子なし） → 配偶者＋親
  // 3. 兄弟姉妹がいる（子・親なし） → 配偶者＋兄弟姉妹 or 兄弟姉妹のみ
  // 4. どれもなし → 子パターンにフォールバック（配偶者のみ等）
  const pattern: Pattern =
    children.length > 0
      ? (spouse ? 'spouse_children' : 'children_only')
      : (father || mother)
      ? 'parents'
      : siblings.length > 0
      ? 'siblings'
      : (spouse ? 'spouse_children' : 'children_only')

  const BOX_W = 150
  const BOX_H = 150
  // 画像を出すときは、箱の右のサムネイルが隣の箱に重ならないよう間隔を広げる。
  const hasImages = Object.values(imagesByName).some(v => v.length > 0)
  const extra = hasImages ? THUMB_W + THUMB_GAP * 2 : 0
  const SPOUSE_GAP = 60 + extra
  const CHILD_GAP = 24 + extra
  const V_GAP = 80
  const imagesCtx: ImagesCtxValue = { byName: imagesByName, onOpen: onOpenImage }

  // ─── パターン別レイアウト ───
  if (pattern === 'parents') {
    return <StatusCtx.Provider value={statusByName}><ImagesCtx.Provider value={imagesCtx}><ParentsLayout
      deceased={deceased} spouse={spouse} father={father} mother={mother} others={others}
      BOX_W={BOX_W} BOX_H={BOX_H} SPOUSE_GAP={SPOUSE_GAP} CHILD_GAP={CHILD_GAP} V_GAP={V_GAP}
    /></ImagesCtx.Provider></StatusCtx.Provider>
  }

  if (pattern === 'siblings') {
    return <StatusCtx.Provider value={statusByName}><ImagesCtx.Provider value={imagesCtx}><SiblingsLayout
      deceased={deceased} spouse={spouse} siblings={siblings} others={[...others, ...formerSpouses]}
      BOX_W={BOX_W} BOX_H={BOX_H} SPOUSE_GAP={SPOUSE_GAP} CHILD_GAP={CHILD_GAP} V_GAP={V_GAP}
    /></ImagesCtx.Provider></StatusCtx.Provider>
  }

  // パターン1 & 2 は共通（配偶者の有無で分岐）
  // 前妻・前夫がいる場合は 被相続人の左に並べ、離婚線（点線＋×）でつなぐ。
  // 子は「誰との子か」(other_parent_heir_id) でグループ分けし、線の出どころを変える。
  // 未設定の子は現配偶者との子として扱う＝前妻がいない案件はこれまでと同じ描画になる。
  const formerIds = new Set(formerSpouses.map(f => f.id))
  const groupKeyOf = (h: HeirRow) =>
    h.other_parent_heir_id && formerIds.has(h.other_parent_heir_id) ? h.other_parent_heir_id : 'current'
  const allDescendants = [...children, ...others]
  const groups = [
    ...formerSpouses.map(f => ({ key: f.id, kids: allDescendants.filter(d => groupKeyOf(d) === f.id) })),
    { key: 'current', kids: allDescendants.filter(d => groupKeyOf(d) === 'current') },
  ]
  // 子の並びはグループ順（前妻の子 → 現配偶者の子）。線が交差しない。
  const descendants = groups.flatMap(g => g.kids)

  const topCount = formerSpouses.length + 1 + (spouse ? 1 : 0)
  const topRowWidth = topCount * BOX_W + (topCount - 1) * SPOUSE_GAP
  const childrenRowWidth =
    descendants.length > 0 ? descendants.length * BOX_W + (descendants.length - 1) * CHILD_GAP : 0

  const canvasWidth = Math.max(topRowWidth, childrenRowWidth, 400) + 80 + extra
  const topY = 30
  const childrenY = topY + BOX_H + V_GAP
  const canvasHeight = descendants.length > 0 ? childrenY + BOX_H + 30 : topY + BOX_H + 30

  const topStartX = (canvasWidth - topRowWidth) / 2
  const topBoxX = (i: number) => topStartX + i * (BOX_W + SPOUSE_GAP)
  const formerX = formerSpouses.map((_, i) => topBoxX(i))
  const deceasedX = topBoxX(formerSpouses.length)
  const spouseX = spouse ? topBoxX(formerSpouses.length + 1) : 0

  const marriageY = topY + BOX_H / 2
  const siblingBarY = topY + BOX_H + V_GAP / 2
  const childrenStartX = (canvasWidth - childrenRowWidth) / 2
  const childCenterX = (i: number) => childrenStartX + i * (BOX_W + CHILD_GAP) + BOX_W / 2
  // 各グループの線の出どころ＝婚姻線／離婚線の中点（配偶者がいなければ被相続人の真下）
  const anchorXOf = (key: string) => {
    if (key !== 'current') {
      const i = formerSpouses.findIndex(f => f.id === key)
      return formerX[i] + BOX_W + SPOUSE_GAP / 2
    }
    return spouse ? deceasedX + BOX_W + SPOUSE_GAP / 2 : deceasedX + BOX_W / 2
  }
  // グループごとの子の位置（descendants 内の連番）
  let cursor = 0
  const groupSpans = groups.map(g => {
    const start = cursor; cursor += g.kids.length
    return { key: g.key, count: g.kids.length, start }
  })

  return (
    <StatusCtx.Provider value={statusByName}><ImagesCtx.Provider value={imagesCtx}>
    <div className="overflow-auto bg-white print:overflow-visible" style={{ minHeight: 300 }}>
      <div className="relative mx-auto" style={{ width: canvasWidth, height: canvasHeight }}>
        <svg className="absolute top-0 left-0 pointer-events-none" width={canvasWidth} height={canvasHeight} style={{ zIndex: 1 }}>
          {/* 婚姻線（二重線） */}
          {spouse && (
            <>
              <line x1={deceasedX + BOX_W} y1={marriageY - 3} x2={spouseX} y2={marriageY - 3} stroke="#111" strokeWidth="1.5" />
              <line x1={deceasedX + BOX_W} y1={marriageY + 3} x2={spouseX} y2={marriageY + 3} stroke="#111" strokeWidth="1.5" />
            </>
          )}

          {/* 離婚線（点線の二重線＋×）。前妻・前夫は被相続人の左に置く。 */}
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

          {/* 子への線。グループ（誰との子か）ごとに出どころを変える。 */}
          {groupSpans.filter(g => g.count > 0).map(g => {
            const ax = anchorXOf(g.key)
            const first = childCenterX(g.start)
            const last = childCenterX(g.start + g.count - 1)
            // 縦線の始点：配偶者/前配偶者がいれば婚姻・離婚線の高さ、いなければ箱の底
            const fromY = g.key !== 'current' || spouse ? marriageY : topY + BOX_H
            return (
              <g key={g.key}>
                <line x1={ax} y1={fromY} x2={ax} y2={siblingBarY} stroke="#111" strokeWidth="1.5" />
                <line x1={Math.min(ax, first)} y1={siblingBarY} x2={Math.max(ax, last)} y2={siblingBarY} stroke="#111" strokeWidth="1.5" />
                {Array.from({ length: g.count }, (_, k) => {
                  const cx = childCenterX(g.start + k)
                  return <line key={k} x1={cx} y1={siblingBarY} x2={cx} y2={childrenY} stroke="#111" strokeWidth="1.5" />
                })}
              </g>
            )
          })}
        </svg>

        {/* 前妻・前夫（相続人ではないので点線の箱） */}
        {formerSpouses.map((f, i) => (
          <PersonBox
            key={f.id}
            x={formerX[i]} y={topY} width={BOX_W}
            label={labelOf(f, '前配偶者')}
            labelBg="bg-gray-50 text-gray-500"
            borderClass="border-[1.5px] border-dashed border-gray-400"
            name={f.name}
            birthDate={f.birth_date}
            address={f.address}
            registeredAddress={f.registered_address}
            notHeir
          />
        ))}

        <PersonBox
          x={deceasedX} y={topY} width={BOX_W}
          label="被相続人"
          labelBg="bg-gray-800 text-white"
          borderClass="border-[3px] border-black"
          name={deceased.deceased_name}
          birthDate={deceased.deceased_birth_date}
          deathDate={deceased.date_of_death}
          address={deceased.deceased_address}
          registeredAddress={deceased.deceased_registered_address}
          isDeceased
        />

        {spouse && (
          <PersonBox
            x={spouseX} y={topY} width={BOX_W}
            label="配偶者"
            labelBg="bg-gray-100 text-gray-700"
            borderClass="border-[1.5px] border-black"
            name={spouse.name}
            birthDate={spouse.birth_date}
            address={spouse.address}
            registeredAddress={spouse.registered_address}
            isLegalHeir={spouse.is_legal_heir}
            livedTogether={spouse.lived_together}
            isApplicant={spouse.is_applicant}
          />
        )}

        {descendants.map((heir, i) => (
          <PersonBox
            key={heir.id}
            x={childrenStartX + i * (BOX_W + CHILD_GAP)}
            y={childrenY}
            width={BOX_W}
            label={labelOf(heir)}
            labelBg="bg-gray-100 text-gray-700"
            borderClass="border-[1.5px] border-black"
            name={heir.name}
            birthDate={heir.birth_date}
            address={heir.address}
            registeredAddress={heir.registered_address}
            isLegalHeir={heir.is_legal_heir}
            livedTogether={heir.lived_together}
            isApplicant={heir.is_applicant}
            noteBadge={groupKeyOf(heir) !== 'current' ? '前婚の子' : undefined}
          />
        ))}
      </div>
    </div>
    </ImagesCtx.Provider></StatusCtx.Provider>
  )
}

// ─── 親パターン用レイアウト ───
function ParentsLayout({
  deceased, spouse, father, mother, others,
  BOX_W, BOX_H, SPOUSE_GAP, CHILD_GAP, V_GAP,
}: {
  deceased: CaseRow
  spouse: HeirRow | null
  father: HeirRow | null
  mother: HeirRow | null
  others: HeirRow[]
  BOX_W: number; BOX_H: number; SPOUSE_GAP: number; CHILD_GAP: number; V_GAP: number
}) {
  const imgPad = useImagePad()
  const parents = [father, mother].filter((p): p is HeirRow => !!p)
  const parentsRowWidth = parents.length * BOX_W + (parents.length - 1) * SPOUSE_GAP
  const middleRowWidth = spouse ? BOX_W * 2 + SPOUSE_GAP : BOX_W
  const bottomRowWidth =
    others.length > 0 ? others.length * BOX_W + (others.length - 1) * CHILD_GAP : 0

  const canvasWidth = Math.max(parentsRowWidth, middleRowWidth, bottomRowWidth, 400) + 80 + imgPad

  const parentsY = 30
  const middleY = parentsY + BOX_H + V_GAP
  const bottomY = middleY + BOX_H + V_GAP
  const canvasHeight = (others.length > 0 ? bottomY + BOX_H : middleY + BOX_H) + 30

  const parentsStartX = (canvasWidth - parentsRowWidth) / 2
  const middleStartX = (canvasWidth - middleRowWidth) / 2
  const deceasedX = middleStartX
  const spouseX = spouse ? middleStartX + BOX_W + SPOUSE_GAP : 0

  // 親中央 → 被相続人へ縦線
  const parentsAnchorX =
    parents.length === 2
      ? parentsStartX + BOX_W + SPOUSE_GAP / 2
      : parentsStartX + BOX_W / 2
  const deceasedTopX = deceasedX + BOX_W / 2

  return (
    <div className="overflow-auto bg-white print:overflow-visible" style={{ minHeight: 300 }}>
      <div className="relative mx-auto" style={{ width: canvasWidth, height: canvasHeight }}>
        <svg className="absolute top-0 left-0 pointer-events-none" width={canvasWidth} height={canvasHeight} style={{ zIndex: 1 }}>
          {/* 父母の婚姻線（二重線） */}
          {parents.length === 2 && (
            <>
              <line x1={parentsStartX + BOX_W} y1={parentsY + BOX_H / 2 - 3} x2={parentsStartX + BOX_W + SPOUSE_GAP} y2={parentsY + BOX_H / 2 - 3} stroke="#111" strokeWidth="1.5" />
              <line x1={parentsStartX + BOX_W} y1={parentsY + BOX_H / 2 + 3} x2={parentsStartX + BOX_W + SPOUSE_GAP} y2={parentsY + BOX_H / 2 + 3} stroke="#111" strokeWidth="1.5" />
            </>
          )}
          {/* 親 → 被相続人 */}
          <line x1={parentsAnchorX} y1={parents.length === 2 ? parentsY + BOX_H / 2 : parentsY + BOX_H} x2={parentsAnchorX} y2={middleY - V_GAP / 2} stroke="#111" strokeWidth="1.5" />
          <line x1={parentsAnchorX} y1={middleY - V_GAP / 2} x2={deceasedTopX} y2={middleY - V_GAP / 2} stroke="#111" strokeWidth="1.5" />
          <line x1={deceasedTopX} y1={middleY - V_GAP / 2} x2={deceasedTopX} y2={middleY} stroke="#111" strokeWidth="1.5" />

          {/* 被相続人＝配偶者 婚姻線 */}
          {spouse && (
            <>
              <line x1={deceasedX + BOX_W} y1={middleY + BOX_H / 2 - 3} x2={spouseX} y2={middleY + BOX_H / 2 - 3} stroke="#111" strokeWidth="1.5" />
              <line x1={deceasedX + BOX_W} y1={middleY + BOX_H / 2 + 3} x2={spouseX} y2={middleY + BOX_H / 2 + 3} stroke="#111" strokeWidth="1.5" />
            </>
          )}
        </svg>

        {/* 父母 */}
        {parents.map((p, i) => (
          <PersonBox
            key={p.id}
            x={parentsStartX + i * (BOX_W + SPOUSE_GAP)}
            y={parentsY}
            width={BOX_W}
            label={p.relationship_type ?? p.relationship ?? '親'}
            labelBg="bg-gray-100 text-gray-700"
            borderClass="border-[1.5px] border-black"
            name={p.name}
            birthDate={p.birth_date}
            address={p.address}
            registeredAddress={p.registered_address}
            isLegalHeir={p.is_legal_heir}
            livedTogether={p.lived_together}
            isApplicant={p.is_applicant}
          />
        ))}

        {/* 被相続人 */}
        <PersonBox
          x={deceasedX} y={middleY} width={BOX_W}
          label="被相続人"
          labelBg="bg-gray-800 text-white"
          borderClass="border-[3px] border-black"
          name={deceased.deceased_name}
          birthDate={deceased.deceased_birth_date}
          deathDate={deceased.date_of_death}
          address={deceased.deceased_address}
          registeredAddress={deceased.deceased_registered_address}
          isDeceased
        />

        {/* 配偶者 */}
        {spouse && (
          <PersonBox
            x={spouseX} y={middleY} width={BOX_W}
            label="配偶者"
            labelBg="bg-gray-100 text-gray-700"
            borderClass="border-[1.5px] border-black"
            name={spouse.name}
            birthDate={spouse.birth_date}
            address={spouse.address}
            registeredAddress={spouse.registered_address}
            isLegalHeir={spouse.is_legal_heir}
            livedTogether={spouse.lived_together}
            isApplicant={spouse.is_applicant}
          />
        )}
      </div>
    </div>
  )
}

// ─── 兄弟姉妹パターン用レイアウト ───
// 共通の親（仮想ノード）から 被相続人＋兄弟姉妹 を横並びに接続
// 配偶者は被相続人の右に婚姻線で接続
function SiblingsLayout({
  deceased, spouse, siblings, others,
  BOX_W, BOX_H, SPOUSE_GAP, CHILD_GAP, V_GAP,
}: {
  deceased: CaseRow
  spouse: HeirRow | null
  siblings: HeirRow[]
  others: HeirRow[]
  BOX_W: number; BOX_H: number; SPOUSE_GAP: number; CHILD_GAP: number; V_GAP: number
}) {
  const imgPad = useImagePad()
  // レイアウト: [被相続人] [gap配偶者gap] [兄弟姉妹1] [兄弟姉妹2] ... [その他]
  // 兄弟姉妹線は被相続人と兄弟姉妹の頂点のみ結ぶ（配偶者を跨ぐ）
  const postDeceasedHeirs = [
    ...siblings.map(s => ({ kind: 'sibling' as const, heir: s })),
    ...others.map(o => ({ kind: 'other' as const, heir: o })),
  ]

  const deceasedX = 40
  const spouseX = spouse ? deceasedX + BOX_W + SPOUSE_GAP : null
  const postStartX = spouse
    ? spouseX! + BOX_W + SPOUSE_GAP
    : deceasedX + BOX_W + CHILD_GAP

  const postWidth = postDeceasedHeirs.length > 0
    ? postDeceasedHeirs.length * BOX_W + (postDeceasedHeirs.length - 1) * CHILD_GAP
    : 0

  const contentWidth = postStartX + postWidth - deceasedX
  const canvasWidth = Math.max(contentWidth + 80 + imgPad, 500)

  const topY = 30 + 60
  const virtualParentY = 30
  const canvasHeight = topY + BOX_H + 30

  // 被相続人と兄弟姉妹の中心X
  const deceasedCenterX = deceasedX + BOX_W / 2
  const lastHeirCenterX = postDeceasedHeirs.length > 0
    ? postStartX + (postDeceasedHeirs.length - 1) * (BOX_W + CHILD_GAP) + BOX_W / 2
    : deceasedCenterX

  // 仮想親（被相続人と兄弟姉妹の中心の真上）
  const virtualParentX = (deceasedCenterX + lastHeirCenterX) / 2
  const siblingBarY = topY - V_GAP / 2

  return (
    <div className="overflow-auto bg-white print:overflow-visible" style={{ minHeight: 300 }}>
      <div className="relative mx-auto" style={{ width: canvasWidth, height: canvasHeight }}>
        <svg className="absolute top-0 left-0 pointer-events-none" width={canvasWidth} height={canvasHeight} style={{ zIndex: 1 }}>
          {/* 仮想親ノード（点線で「父母（故）」と表示） */}
          <rect
            x={virtualParentX - 55} y={virtualParentY}
            width="110" height="32"
            fill="white" stroke="#999" strokeWidth="1" strokeDasharray="4 3"
          />
          <text x={virtualParentX} y={virtualParentY + 20} textAnchor="middle" fontSize="11" fill="#666">父母（死亡）</text>

          {/* 親 → 兄弟姉妹線 */}
          <line x1={virtualParentX} y1={virtualParentY + 32} x2={virtualParentX} y2={siblingBarY} stroke="#999" strokeWidth="1" strokeDasharray="4 3" />

          {/* 兄弟姉妹線（横）: 被相続人中心 → 最終兄弟姉妹中心 */}
          {postDeceasedHeirs.length > 0 && (
            <line
              x1={deceasedCenterX}
              y1={siblingBarY}
              x2={lastHeirCenterX}
              y2={siblingBarY}
              stroke="#111"
              strokeWidth="1.5"
            />
          )}

          {/* 被相続人への縦線 */}
          <line x1={deceasedCenterX} y1={siblingBarY} x2={deceasedCenterX} y2={topY} stroke="#111" strokeWidth="1.5" />

          {/* 各兄弟姉妹・その他への縦線 */}
          {postDeceasedHeirs.map((_, i) => {
            const cx = postStartX + i * (BOX_W + CHILD_GAP) + BOX_W / 2
            return <line key={i} x1={cx} y1={siblingBarY} x2={cx} y2={topY} stroke="#111" strokeWidth="1.5" />
          })}

          {/* 配偶者の婚姻線（被相続人の右） */}
          {spouse && spouseX !== null && (
            <>
              <line x1={deceasedX + BOX_W} y1={topY + BOX_H / 2 - 3} x2={spouseX} y2={topY + BOX_H / 2 - 3} stroke="#111" strokeWidth="1.5" />
              <line x1={deceasedX + BOX_W} y1={topY + BOX_H / 2 + 3} x2={spouseX} y2={topY + BOX_H / 2 + 3} stroke="#111" strokeWidth="1.5" />
            </>
          )}
        </svg>

        {/* 被相続人 */}
        <PersonBox
          x={deceasedX} y={topY} width={BOX_W}
          label="被相続人"
          labelBg="bg-gray-800 text-white"
          borderClass="border-[3px] border-black"
          name={deceased.deceased_name}
          birthDate={deceased.deceased_birth_date}
          deathDate={deceased.date_of_death}
          address={deceased.deceased_address}
          registeredAddress={deceased.deceased_registered_address}
          isDeceased
        />

        {/* 兄弟姉妹＋その他 */}
        {postDeceasedHeirs.map((item, i) => {
          const heir = item.heir
          return (
            <PersonBox
              key={heir.id}
              x={postStartX + i * (BOX_W + CHILD_GAP)}
              y={topY}
              width={BOX_W}
              label={labelOf(heir, item.kind === 'sibling' ? '兄弟姉妹' : 'その他')}
              labelBg={isFormerSpouseHeir(heir) ? 'bg-gray-50 text-gray-500' : 'bg-gray-100 text-gray-700'}
              borderClass={isFormerSpouseHeir(heir) ? 'border-[1.5px] border-dashed border-gray-400' : 'border-[1.5px] border-black'}
              name={heir.name}
              birthDate={heir.birth_date}
              address={heir.address}
              registeredAddress={heir.registered_address}
              isLegalHeir={heir.is_legal_heir}
              livedTogether={heir.lived_together}
              isApplicant={heir.is_applicant}
              notHeir={isFormerSpouseHeir(heir)}
              noteBadge={isHalfBloodHeir(heir) ? '半血（相続分1/2）' : undefined}
            />
          )
        })}

        {/* 配偶者 */}
        {spouse && spouseX !== null && (
          <PersonBox
            x={spouseX} y={topY} width={BOX_W}
            label="配偶者"
            labelBg="bg-gray-100 text-gray-700"
            borderClass="border-[1.5px] border-black"
            name={spouse.name}
            birthDate={spouse.birth_date}
            address={spouse.address}
            registeredAddress={spouse.registered_address}
            isLegalHeir={spouse.is_legal_heir}
            livedTogether={spouse.lived_together}
            isApplicant={spouse.is_applicant}
          />
        )}
      </div>
    </div>
  )
}

// ─── 人物ボックス ───
function PersonBox({
  x, y, width, label, labelBg, borderClass,
  name, birthDate, deathDate, address, registeredAddress,
  isDeceased, isLegalHeir, isApplicant, livedTogether, notHeir, noteBadge,
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
  /** 被相続人と同居していた相続人。書類回収・連絡の起点になるため図で分かるようにする。 */
  livedTogether?: boolean
  /** 相続人ではない関係者（前妻・前夫）。「相続人ではない」と明記する。 */
  notHeir?: boolean
  /** 氏名の下に出す注記バッジ（前婚の子・半血 など） */
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
      <PersonImages name={name} boxWidth={width} />
      <div className={`${ps ? statusBorder : borderClass} bg-white text-center`}>
        <div className={`text-[11px] tracking-widest py-1 border-b border-black font-semibold ${labelBg} relative`}>
          {label}
          {statusBadge && <span className={`absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-semibold px-1.5 rounded-full ${badgeCls}`}>{statusBadge}</span>}
        </div>
        <div className="p-2 flex flex-col items-center gap-1">
          <div className="text-[13px] font-bold tracking-wider flex items-center gap-1 flex-wrap justify-center">
            {name ?? '—'}
            {isApplicant && <span className="text-[11px] font-semibold text-red-600">（申出人）</span>}
            {livedTogether && <span className="text-[9.5px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1 py-px">同居</span>}
            {noteBadge && <span className="text-[9.5px] font-bold text-gray-600 bg-gray-100 border border-gray-200 rounded px-1 py-px">{noteBadge}</span>}
          </div>
          <div className="text-[11px] text-gray-700 text-left w-full px-1 leading-relaxed">
            {birthDate && <div><span className="text-gray-400">出生</span> {birthDate}</div>}
            {deathDate && <div><span className="text-gray-400">死亡</span> {deathDate}</div>}
            {address && (
              <div className="truncate" title={address}>
                <span className="text-gray-400">{isDeceased ? '最後の住所' : '住所'}</span> {address}
              </div>
            )}
            {registeredAddress && (
              <div className="truncate" title={registeredAddress}>
                <span className="text-gray-400">{isDeceased ? '最後の本籍' : '本籍'}</span> {registeredAddress}
              </div>
            )}
          </div>
          {isDeceased && (
            <div className="w-[30px] h-[30px] border-[1.5px] border-red-600 rounded-full flex items-center justify-center text-[10px] text-red-600 font-bold mt-1">
              死亡
            </div>
          )}
          {!isDeceased && isLegalHeir && !notHeir && (
            <div className="text-[11px] text-green-700 font-semibold mt-1">（法定相続人）</div>
          )}
          {notHeir && (
            <div className="text-[11px] text-gray-400 font-semibold mt-1">（相続人ではない）</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 箱の右に並べる戸籍画像 ───
// 各対象者タブでアップした画像を、その人の箱の右に小さく出す。
// 押すと拡大（呼び出し側のモーダル）。印刷する相続関係説明図には出さない。
function PersonImages({ name, boxWidth }: { name?: string | null; boxWidth: number }) {
  const { byName, onOpen } = useContext(ImagesCtx)
  const list = name ? byName[name.trim()] ?? [] : []
  if (list.length === 0) return null
  const shown = list.slice(0, MAX_THUMBS)
  const rest = list.length - shown.length
  return (
    <div
      className="absolute flex flex-col gap-1 print:hidden"
      style={{ left: boxWidth + THUMB_GAP, top: 0, width: THUMB_W, zIndex: 3 }}
    >
      {shown.map(img => (
        <button
          key={img.id}
          type="button"
          onClick={() => onOpen?.(img)}
          title={`${name} の戸籍：${img.label ?? '画像'}（クリックで拡大）`}
          className="block w-full rounded border border-gray-300 bg-white overflow-hidden hover:border-brand-500"
          style={{ height: THUMB_W * 1.25 }}
        >
          {img.url
            ? <AnnotatedImage url={img.url} annos={img.annos} className="w-full object-cover" />
            : <span className="flex items-center justify-center h-full text-[9px] text-gray-300">…</span>}
        </button>
      ))}
      {rest > 0 && (
        <button type="button" onClick={() => onOpen?.(list[MAX_THUMBS])}
          className="text-[10px] text-gray-500 border border-gray-200 rounded bg-white/90 py-0.5 hover:border-brand-400">
          ＋{rest}枚
        </button>
      )}
    </div>
  )
}
