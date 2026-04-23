'use client'

import type { CaseRow, HeirRow } from '@/types'

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

export default function InheritanceDiagramV2({
  deceased,
  heirs,
}: {
  deceased: CaseRow
  heirs: HeirRow[]
}) {
  // 続柄区分で分類（relationship_type が未設定のものは relationship フリーテキストで補完判定）
  const typeOf = (h: HeirRow): HeirRow['relationship_type'] => {
    if (h.relationship_type) return h.relationship_type
    const r = h.relationship ?? ''
    if (r === '配偶者') return '配偶者'
    if (['子', '長男', '長女', '二男', '二女', '三男', '三女', '養子', '次男', '次女'].includes(r)) return '子'
    if (r === '父') return '父'
    if (r === '母') return '母'
    if (['兄弟姉妹','兄','姉','弟','妹'].includes(r)) return '兄弟姉妹'
    return 'その他'
  }

  const spouse = heirs.find(h => typeOf(h) === '配偶者') ?? null
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
  const SPOUSE_GAP = 60
  const CHILD_GAP = 24
  const V_GAP = 80

  // ─── パターン別レイアウト ───
  if (pattern === 'parents') {
    return <ParentsLayout
      deceased={deceased} spouse={spouse} father={father} mother={mother} others={others}
      BOX_W={BOX_W} BOX_H={BOX_H} SPOUSE_GAP={SPOUSE_GAP} CHILD_GAP={CHILD_GAP} V_GAP={V_GAP}
    />
  }

  if (pattern === 'siblings') {
    return <SiblingsLayout
      deceased={deceased} spouse={spouse} siblings={siblings} others={others}
      BOX_W={BOX_W} BOX_H={BOX_H} SPOUSE_GAP={SPOUSE_GAP} CHILD_GAP={CHILD_GAP} V_GAP={V_GAP}
    />
  }

  // パターン1 & 2 は共通（配偶者の有無で分岐）
  const descendants = [...children, ...others]
  const topRowWidth = spouse ? BOX_W * 2 + SPOUSE_GAP : BOX_W
  const childrenRowWidth =
    descendants.length > 0 ? descendants.length * BOX_W + (descendants.length - 1) * CHILD_GAP : 0

  const canvasWidth = Math.max(topRowWidth, childrenRowWidth, 400) + 80
  const topY = 30
  const childrenY = topY + BOX_H + V_GAP
  const canvasHeight = descendants.length > 0 ? childrenY + BOX_H + 30 : topY + BOX_H + 30

  const topStartX = (canvasWidth - topRowWidth) / 2
  const deceasedX = topStartX
  const spouseX = spouse ? topStartX + BOX_W + SPOUSE_GAP : 0

  const parentAnchorX = spouse ? deceasedX + BOX_W + SPOUSE_GAP / 2 : deceasedX + BOX_W / 2
  const parentAnchorY = topY + BOX_H

  const childrenStartX = parentAnchorX - childrenRowWidth / 2
  const siblingBarY = topY + BOX_H + V_GAP / 2

  return (
    <div className="overflow-auto bg-white print:overflow-visible" style={{ minHeight: 300 }}>
      <div className="relative mx-auto" style={{ width: canvasWidth, height: canvasHeight }}>
        <svg className="absolute top-0 left-0 pointer-events-none" width={canvasWidth} height={canvasHeight} style={{ zIndex: 1 }}>
          {/* 婚姻線（二重線） */}
          {spouse && (
            <>
              <line x1={deceasedX + BOX_W} y1={topY + BOX_H / 2 - 3} x2={spouseX} y2={topY + BOX_H / 2 - 3} stroke="#111" strokeWidth="1.5" />
              <line x1={deceasedX + BOX_W} y1={topY + BOX_H / 2 + 3} x2={spouseX} y2={topY + BOX_H / 2 + 3} stroke="#111" strokeWidth="1.5" />
            </>
          )}

          {descendants.length > 0 && (
            <>
              <line x1={parentAnchorX} y1={spouse ? topY + BOX_H / 2 : parentAnchorY} x2={parentAnchorX} y2={siblingBarY} stroke="#111" strokeWidth="1.5" />
              {descendants.length > 1 && (
                <line
                  x1={childrenStartX + BOX_W / 2}
                  y1={siblingBarY}
                  x2={childrenStartX + (descendants.length - 1) * (BOX_W + CHILD_GAP) + BOX_W / 2}
                  y2={siblingBarY}
                  stroke="#111"
                  strokeWidth="1.5"
                />
              )}
              {descendants.map((_, i) => {
                const cx = childrenStartX + i * (BOX_W + CHILD_GAP) + BOX_W / 2
                return <line key={i} x1={cx} y1={siblingBarY} x2={cx} y2={childrenY} stroke="#111" strokeWidth="1.5" />
              })}
            </>
          )}
        </svg>

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
            isApplicant={spouse.is_applicant}
          />
        )}

        {descendants.map((heir, i) => (
          <PersonBox
            key={heir.id}
            x={childrenStartX + i * (BOX_W + CHILD_GAP)}
            y={childrenY}
            width={BOX_W}
            label={heir.relationship || typeOf(heir) || '相続人'}
            labelBg="bg-gray-100 text-gray-700"
            borderClass="border-[1.5px] border-black"
            name={heir.name}
            birthDate={heir.birth_date}
            address={heir.address}
            registeredAddress={heir.registered_address}
            isLegalHeir={heir.is_legal_heir}
            isApplicant={heir.is_applicant}
          />
        ))}
      </div>
    </div>
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
  const parents = [father, mother].filter((p): p is HeirRow => !!p)
  const parentsRowWidth = parents.length * BOX_W + (parents.length - 1) * SPOUSE_GAP
  const middleRowWidth = spouse ? BOX_W * 2 + SPOUSE_GAP : BOX_W
  const bottomRowWidth =
    others.length > 0 ? others.length * BOX_W + (others.length - 1) * CHILD_GAP : 0

  const canvasWidth = Math.max(parentsRowWidth, middleRowWidth, bottomRowWidth, 400) + 80

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
  const canvasWidth = Math.max(contentWidth + 80, 500)

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
              label={item.kind === 'sibling' ? '兄弟姉妹' : (heir.relationship || 'その他')}
              labelBg="bg-gray-100 text-gray-700"
              borderClass="border-[1.5px] border-black"
              name={heir.name}
              birthDate={heir.birth_date}
              address={heir.address}
              registeredAddress={heir.registered_address}
              isLegalHeir={heir.is_legal_heir}
              isApplicant={heir.is_applicant}
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
  isDeceased, isLegalHeir, isApplicant,
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
}) {
  return (
    <div className="absolute" style={{ left: x, top: y, width, zIndex: 2 }}>
      <div className={`${borderClass} bg-white text-center`}>
        <div className={`text-[9px] tracking-widest py-1 border-b border-black font-semibold ${labelBg}`}>
          {label}
        </div>
        <div className="p-2 flex flex-col items-center gap-1">
          <div className="text-[13px] font-bold tracking-wider flex items-center gap-1">
            {name ?? '—'}
            {isApplicant && <span className="text-[9px] font-semibold text-red-600">（申出人）</span>}
          </div>
          <div className="text-[9px] text-gray-700 text-left w-full px-1 leading-relaxed">
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
            <div className="w-[30px] h-[30px] border-[1.5px] border-red-600 rounded-full flex items-center justify-center text-[8px] text-red-600 font-bold mt-1">
              死亡
            </div>
          )}
          {!isDeceased && isLegalHeir && (
            <div className="text-[9px] text-green-700 font-semibold mt-1">（法定相続人）</div>
          )}
        </div>
      </div>
    </div>
  )
}
