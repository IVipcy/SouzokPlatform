'use client'

import type { CaseRow, HeirRow } from '@/types'

/**
 * 相続相関図 V2
 *
 * 法的効力のある標準書式に準拠:
 *   被相続人 ＝ 配偶者   （婚姻線: 二重横線）
 *         │
 *       ┌─┴─┬─────┐
 *       子1  子2   子3   （子は兄弟姉妹線から縦で接続）
 *
 * - 配偶者: heirs の relationship === '配偶者' のうち最初の1人
 * - 子: 配偶者以外の全員（子・孫・兄弟姉妹など relationship に関わらず下段に横並び）
 * - 配偶者不在: 被相続人の下から直接縦線を降ろす
 * - 子不在: 婚姻線のみ表示
 */
export default function InheritanceDiagramV2({
  deceased,
  heirs,
}: {
  deceased: CaseRow
  heirs: HeirRow[]
}) {
  const spouse = heirs.find(h => h.relationship === '配偶者') ?? null
  const children = heirs.filter(h => h !== spouse)

  const BOX_W = 140
  const BOX_H = 140
  const SPOUSE_GAP = 60   // 被相続人と配偶者の間（婚姻線の長さ）
  const CHILD_GAP = 30    // 子同士の間
  const V_GAP = 80        // 世代間の縦間隔

  // 上段: 被相続人＋配偶者
  const topRowWidth = spouse ? BOX_W * 2 + SPOUSE_GAP : BOX_W

  // 下段: 子の横並び
  const childrenRowWidth =
    children.length > 0
      ? children.length * BOX_W + (children.length - 1) * CHILD_GAP
      : 0

  const canvasWidth = Math.max(topRowWidth, childrenRowWidth, 400) + 80
  const topY = 30
  const childrenY = topY + BOX_H + V_GAP
  const canvasHeight = children.length > 0 ? childrenY + BOX_H + 30 : topY + BOX_H + 30

  // 上段の配置 (中央寄せ)
  const topStartX = (canvasWidth - topRowWidth) / 2
  const deceasedX = topStartX
  const spouseX = spouse ? topStartX + BOX_W + SPOUSE_GAP : 0

  // 親接続点 (縦線の起点): 配偶者ありなら婚姻線の中点、無しなら被相続人の下
  const parentAnchorX = spouse
    ? deceasedX + BOX_W + SPOUSE_GAP / 2
    : deceasedX + BOX_W / 2
  const parentAnchorY = topY + BOX_H

  // 下段: 子を parentAnchorX を中心に配置
  const childrenStartX = parentAnchorX - childrenRowWidth / 2

  // 兄弟姉妹線(水平バー)の Y座標
  const siblingBarY = topY + BOX_H + V_GAP / 2

  return (
    <div className="overflow-auto bg-white" style={{ minHeight: 300 }}>
      <div
        className="relative mx-auto"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        <svg
          className="absolute top-0 left-0 pointer-events-none"
          width={canvasWidth}
          height={canvasHeight}
          style={{ zIndex: 1 }}
        >
          {/* 婚姻線（二重線） */}
          {spouse && (
            <>
              <line
                x1={deceasedX + BOX_W}
                y1={topY + BOX_H / 2 - 3}
                x2={spouseX}
                y2={topY + BOX_H / 2 - 3}
                stroke="#111"
                strokeWidth="1.5"
              />
              <line
                x1={deceasedX + BOX_W}
                y1={topY + BOX_H / 2 + 3}
                x2={spouseX}
                y2={topY + BOX_H / 2 + 3}
                stroke="#111"
                strokeWidth="1.5"
              />
            </>
          )}

          {/* 子がいる場合: 親縦線 → 兄弟姉妹線 → 各子への縦線 */}
          {children.length > 0 && (
            <>
              {/* 親からの縦線 (婚姻線中点 or 被相続人下) → 兄弟姉妹線 */}
              <line
                x1={parentAnchorX}
                y1={spouse ? topY + BOX_H / 2 : parentAnchorY}
                x2={parentAnchorX}
                y2={siblingBarY}
                stroke="#111"
                strokeWidth="1.5"
              />

              {/* 兄弟姉妹線（水平バー） */}
              {children.length > 1 && (
                <line
                  x1={childrenStartX + BOX_W / 2}
                  y1={siblingBarY}
                  x2={
                    childrenStartX +
                    (children.length - 1) * (BOX_W + CHILD_GAP) +
                    BOX_W / 2
                  }
                  y2={siblingBarY}
                  stroke="#111"
                  strokeWidth="1.5"
                />
              )}

              {/* 各子への縦線 */}
              {children.map((_, i) => {
                const cx = childrenStartX + i * (BOX_W + CHILD_GAP) + BOX_W / 2
                return (
                  <line
                    key={i}
                    x1={cx}
                    y1={siblingBarY}
                    x2={cx}
                    y2={childrenY}
                    stroke="#111"
                    strokeWidth="1.5"
                  />
                )
              })}
            </>
          )}
        </svg>

        {/* 被相続人 */}
        <PersonBox
          x={deceasedX}
          y={topY}
          width={BOX_W}
          label="被相続人"
          labelBg="bg-gray-800 text-white"
          borderClass="border-[3px] border-black"
          name={deceased.deceased_name}
          birthDate={deceased.deceased_birth_date}
          deathDate={deceased.date_of_death}
          registeredAddress={deceased.deceased_registered_address}
          isDeceased
        />

        {/* 配偶者 */}
        {spouse && (
          <PersonBox
            x={spouseX}
            y={topY}
            width={BOX_W}
            label="配偶者"
            labelBg="bg-gray-100 text-gray-700"
            borderClass="border-[1.5px] border-black"
            name={spouse.name}
            birthDate={spouse.birth_date}
            registeredAddress={spouse.registered_address}
            isLegalHeir={spouse.is_legal_heir}
          />
        )}

        {/* 子（および配偶者以外の相続人） */}
        {children.map((heir, i) => (
          <PersonBox
            key={heir.id}
            x={childrenStartX + i * (BOX_W + CHILD_GAP)}
            y={childrenY}
            width={BOX_W}
            label={heir.relationship || '相続人'}
            labelBg="bg-gray-100 text-gray-700"
            borderClass="border-[1.5px] border-black"
            name={heir.name}
            birthDate={heir.birth_date}
            registeredAddress={heir.registered_address}
            isLegalHeir={heir.is_legal_heir}
          />
        ))}
      </div>
    </div>
  )
}

// ─── 人物ボックス ───
function PersonBox({
  x,
  y,
  width,
  label,
  labelBg,
  borderClass,
  name,
  birthDate,
  deathDate,
  registeredAddress,
  isDeceased,
  isLegalHeir,
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
  registeredAddress?: string | null
  isDeceased?: boolean
  isLegalHeir?: boolean
}) {
  return (
    <div
      className="absolute"
      style={{ left: x, top: y, width, zIndex: 2 }}
    >
      <div className={`${borderClass} bg-white text-center`}>
        <div
          className={`text-[9px] tracking-widest py-1 border-b border-black font-semibold ${labelBg}`}
        >
          {label}
        </div>
        <div className="p-2 flex flex-col items-center gap-1">
          <div className="text-[13px] font-bold tracking-wider">
            {name ?? '—'}
          </div>
          <div className="text-[9px] text-gray-600 text-left w-full px-1 leading-relaxed">
            {birthDate && (
              <div>
                <span className="text-gray-400">生</span> {birthDate}
              </div>
            )}
            {deathDate && (
              <div>
                <span className="text-gray-400">没</span> {deathDate}
              </div>
            )}
            {registeredAddress && (
              <div className="truncate" title={registeredAddress}>
                <span className="text-gray-400">籍</span> {registeredAddress}
              </div>
            )}
          </div>
          {isDeceased && (
            <div className="w-[30px] h-[30px] border-[1.5px] border-red-600 rounded-full flex items-center justify-center text-[8px] text-red-600 font-bold mt-1">
              死亡
            </div>
          )}
          {!isDeceased && isLegalHeir && (
            <div className="text-[9px] text-green-700 font-semibold mt-1">
              （法定相続人）
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
