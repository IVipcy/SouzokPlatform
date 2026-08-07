// 法定相続分の計算。財産目録（財産・債務一覧表）の「参考：法定相続割合」に使う。
//
// 分数のまま扱う理由：
//   1/3 を小数にすると 0.3333… になり、3人分を足しても 1 にならない。
//   目録は「取得合計＝財産合計」が一致していないと不安になる表なので、割合は分数で持つ。
//
// 自動計算はあくまで初期値。実際は代襲・相続放棄・特別受益などでズレるので、
// 画面側で1人ずつ上書きできるようにしてある。

import { isFormerSpouse, isHalfBloodSibling } from '@/lib/constants'
import type { HeirRow } from '@/types'

export type Frac = { num: number; den: number }

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
export const reduceFrac = (f: Frac): Frac => {
  if (!f.den) return { num: 0, den: 1 }
  const g = gcd(Math.abs(f.num), Math.abs(f.den)) || 1
  return { num: f.num / g, den: f.den / g }
}
export const mulFrac = (a: Frac, b: Frac): Frac => reduceFrac({ num: a.num * b.num, den: a.den * b.den })
export const fracText = (f: Frac | null | undefined): string =>
  !f || f.num === 0 ? '' : f.den === 1 ? String(f.num) : `${f.num}/${f.den}`
export const fracValue = (f: Frac | null | undefined): number => (!f || !f.den ? 0 : f.num / f.den)

type Cat = '配偶者' | '子' | '直系尊属' | '兄弟姉妹' | '対象外'

/** 続柄を法定相続の順位に振り分ける。前妻・前夫は相続人ではないので対象外。 */
export function heirCategory(h: HeirRow): Cat {
  const r = h.relationship_type || h.relationship || ''
  if (isFormerSpouse(r)) return '対象外'
  if (r === '配偶者') return '配偶者'
  if (['子', '長男', '長女', '二男', '二女', '三男', '三女', '養子', '次男', '次女', '孫', 'ひ孫'].includes(r)) return '子'
  if (['父', '母', '祖父', '祖母'].includes(r)) return '直系尊属'
  if (['兄弟姉妹', '兄', '姉', '弟', '妹', '甥', '姪', '異母兄弟姉妹', '異父兄弟姉妹'].includes(r)) return '兄弟姉妹'
  return '対象外'
}

/**
 * 法定相続分を計算して heir.id → 分数 の形で返す。
 *   配偶者＋子       … 配偶者 1/2、子で 1/2 を等分
 *   配偶者＋直系尊属 … 配偶者 2/3、直系尊属で 1/3 を等分
 *   配偶者＋兄弟姉妹 … 配偶者 3/4、兄弟姉妹で 1/4 を分ける（半血は全血の1/2）
 *   配偶者のみ / 血族のみ … その順位だけで分ける
 * 順位は 子 → 直系尊属 → 兄弟姉妹 の先着順（上位がいれば下位は相続人にならない）。
 */
export function computeLegalShares(heirs: HeirRow[]): Record<string, Frac> {
  const target = heirs.filter(h => heirCategory(h) !== '対象外')
  const spouse = target.find(h => heirCategory(h) === '配偶者') ?? null
  const children = target.filter(h => heirCategory(h) === '子')
  const parents = target.filter(h => heirCategory(h) === '直系尊属')
  const siblings = target.filter(h => heirCategory(h) === '兄弟姉妹')

  const out: Record<string, Frac> = {}
  // 血族側の相続人と、配偶者の取り分（血族の順位で変わる）
  let bloodline: HeirRow[] = []
  let spouseShare: Frac = { num: 1, den: 1 }
  if (children.length > 0) { bloodline = children; spouseShare = { num: 1, den: 2 } }
  else if (parents.length > 0) { bloodline = parents; spouseShare = { num: 2, den: 3 } }
  else if (siblings.length > 0) { bloodline = siblings; spouseShare = { num: 3, den: 4 } }

  if (spouse && bloodline.length === 0) {
    out[spouse.id] = { num: 1, den: 1 }
    return out
  }
  if (spouse) out[spouse.id] = spouseShare
  if (bloodline.length === 0) return out

  // 血族側に回る分。配偶者がいなければ全部。
  const bloodTotal: Frac = spouse
    ? reduceFrac({ num: spouseShare.den - spouseShare.num, den: spouseShare.den })
    : { num: 1, den: 1 }
  // 半血のきょうだいは全血の1/2（民法900条4号但書）。重みで表す。
  const weightOf = (h: HeirRow) =>
    bloodline === siblings && isHalfBloodSibling(h.relationship_type || h.relationship) ? 1 : 2
  const totalWeight = bloodline.reduce((s, h) => s + weightOf(h), 0)
  for (const h of bloodline) {
    out[h.id] = mulFrac(bloodTotal, { num: weightOf(h), den: totalWeight })
  }
  return out
}
