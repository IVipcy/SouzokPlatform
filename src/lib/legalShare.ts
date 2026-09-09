// 法定相続分の計算。財産目録（財産・債務一覧表）の「参考：法定相続割合」と相関図の順位判定に使う。
//
// 分数のまま扱う理由：
//   1/3 を小数にすると 0.3333… になり、3人分を足しても 1 にならない。
//   目録は「取得合計＝財産合計」が一致していないと不安になる表なので、割合は分数で持つ。
//
// 順位と代襲（2026-09-09 見直し）：
//   ・死亡している人（is_deceased）は相続人ではない。順位の判定からも外す（死亡した父母がいても兄弟姉妹が相続人）
//   ・子が死亡していれば孫が、兄弟姉妹が死亡していれば甥・姪が、その人の取り分を分ける（代襲＝株分け）
//   ・代襲の親は parent_heir_id（この案件の行）か parent_relationship_type（親の続柄だけ）で結ぶ。
//     どちらも無い孫・甥・姪は、従来どおり1人分の頭として数える（入力途中でも数字が出るように）
//   ・半血の兄弟姉妹（異母・異父）は全血の1/2（民法900条4号）。代襲でも親の半血が引き継がれる
//
// 自動計算はあくまで初期値。相続放棄・特別受益などでズレるので、画面側で1人ずつ上書きできる。

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

// ── 続柄の分類 ──
export const CHILD_TYPES = ['子', '長男', '長女', '二男', '二女', '三男', '三女', '養子', '次男', '次女'] as const
export const GRANDCHILD_TYPES = ['孫', 'ひ孫'] as const
export const PARENT_TYPES = ['父', '母'] as const
export const GRANDPARENT_TYPES = ['祖父', '祖母'] as const
export const SIBLING_TYPES = ['兄弟姉妹', '兄', '姉', '弟', '妹', '異母兄弟姉妹', '異父兄弟姉妹'] as const
export const NEPHEW_TYPES = ['甥', '姪'] as const

export const relOf = (h: Pick<HeirRow, 'relationship_type' | 'relationship'>): string => h.relationship_type || h.relationship || ''
const inList = (r: string, list: readonly string[]) => list.includes(r)

type Cat = '配偶者' | '子' | '直系尊属' | '兄弟姉妹' | '対象外'

/** 続柄を法定相続の順位に振り分ける。前妻・前夫は相続人ではないので対象外。 */
export function heirCategory(h: HeirRow): Cat {
  const r = relOf(h)
  if (isFormerSpouse(r)) return '対象外'
  if (r === '配偶者') return '配偶者'
  if (inList(r, CHILD_TYPES) || inList(r, GRANDCHILD_TYPES)) return '子'
  if (inList(r, PARENT_TYPES) || inList(r, GRANDPARENT_TYPES)) return '直系尊属'
  if (inList(r, SIBLING_TYPES) || inList(r, NEPHEW_TYPES)) return '兄弟姉妹'
  return '対象外'
}

/** 代襲相続人（孫・ひ孫・甥・姪）か */
export const isRepresentative = (h: Pick<HeirRow, 'relationship_type' | 'relationship'>): boolean => {
  const r = relOf(h)
  return inList(r, GRANDCHILD_TYPES) || inList(r, NEPHEW_TYPES)
}

/**
 * 株（かぶ）＝親1人とその代襲者のまとまり。
 *   head       … 親の行（登録されていれば）。未登録で続柄だけのときは null
 *   headLabel  … 親の続柄（兄・姉・長男 など）
 *   alive      … 親が存命（＝親本人が相続人。代襲は起きない）
 *   halfBlood  … 半血の兄弟姉妹（相続分1/2）
 *   reps       … 代襲者（孫・甥・姪）
 */
export type Stirps = {
  key: string
  head: HeirRow | null
  headLabel: string
  alive: boolean
  halfBlood: boolean
  reps: HeirRow[]
  /** 親も代襲者も登録されていない孤立した代襲者（親の紐づけ無し）。従来どおり1人分として扱う */
  orphan: boolean
}

/** 子の代（子＋孫）または兄弟姉妹の代（兄弟姉妹＋甥姪）を株に分ける */
export function buildStirpes(heirs: HeirRow[], level: '子' | '兄弟姉妹'): Stirps[] {
  const inLevel = heirs.filter(h => heirCategory(h) === level)
  const heads = inLevel.filter(h => !isRepresentative(h))
  const reps = inLevel.filter(h => isRepresentative(h))
  const out: Stirps[] = heads.map(h => ({
    key: h.id, head: h, headLabel: relOf(h) || level, alive: !h.is_deceased, halfBlood: isHalfBloodSibling(relOf(h)), reps: [], orphan: false,
  }))
  for (const r of reps) {
    const byId = r.parent_heir_id ? out.find(s => s.key === r.parent_heir_id) : undefined
    if (byId) { byId.reps.push(r); continue }
    const pr = (r.parent_relationship_type ?? '').trim()
    if (pr) {
      let s = out.find(x => x.key === `rel:${pr}`)
      if (!s) { s = { key: `rel:${pr}`, head: null, headLabel: pr, alive: false, halfBlood: isHalfBloodSibling(pr), reps: [], orphan: false }; out.push(s) }
      s.reps.push(r)
      continue
    }
    out.push({ key: `orphan:${r.id}`, head: null, headLabel: relOf(r), alive: false, halfBlood: false, reps: [r], orphan: true })
  }
  return out
}

/** 株として相続に参加するか（親が存命、または存命の代襲者がいる） */
const stirpsCounts = (s: Stirps) => s.alive || s.reps.some(r => !r.is_deceased)

/**
 * 法定相続分を計算して heir.id → 分数 の形で返す。
 *   配偶者＋子       … 配偶者 1/2、子の株で 1/2 を分ける
 *   配偶者＋直系尊属 … 配偶者 2/3、直系尊属で 1/3 を等分
 *   配偶者＋兄弟姉妹 … 配偶者 3/4、兄弟姉妹の株で 1/4 を分ける（半血は全血の1/2）
 *   配偶者のみ / 血族のみ … その順位だけで分ける
 * 順位は 子 → 直系尊属 → 兄弟姉妹 の先着順。死亡している人は数えない。株の中は代襲者で等分。
 */
export function computeLegalShares(heirs: HeirRow[]): Record<string, Frac> {
  const out: Record<string, Frac> = {}
  const spouseRow = heirs.find(h => heirCategory(h) === '配偶者' && !h.is_deceased) ?? null

  const childStirpes = buildStirpes(heirs, '子').filter(stirpsCounts)
  const parents = heirs.filter(h => inList(relOf(h), PARENT_TYPES) && !h.is_deceased)
  const grandparents = heirs.filter(h => inList(relOf(h), GRANDPARENT_TYPES) && !h.is_deceased)
  const ascendants = parents.length > 0 ? parents : grandparents
  const siblingStirpes = buildStirpes(heirs, '兄弟姉妹').filter(stirpsCounts)

  let level: 'children' | 'ascendants' | 'siblings' | null = null
  let spouseShare: Frac = { num: 1, den: 1 }
  if (childStirpes.length > 0) { level = 'children'; spouseShare = { num: 1, den: 2 } }
  else if (ascendants.length > 0) { level = 'ascendants'; spouseShare = { num: 2, den: 3 } }
  else if (siblingStirpes.length > 0) { level = 'siblings'; spouseShare = { num: 3, den: 4 } }

  if (spouseRow && !level) { out[spouseRow.id] = { num: 1, den: 1 }; return out }
  if (spouseRow) out[spouseRow.id] = spouseShare
  if (!level) return out

  const bloodTotal: Frac = spouseRow ? reduceFrac({ num: spouseShare.den - spouseShare.num, den: spouseShare.den }) : { num: 1, den: 1 }

  if (level === 'ascendants') {
    for (const p of ascendants) out[p.id] = mulFrac(bloodTotal, { num: 1, den: ascendants.length })
    return out
  }

  const stirpes = level === 'children' ? childStirpes : siblingStirpes
  // 株の重み：半血の兄弟姉妹は全血の1/2
  const weightOf = (s: Stirps) => (level === 'siblings' && s.halfBlood ? 1 : 2)
  const totalWeight = stirpes.reduce((sum, s) => sum + weightOf(s), 0)
  for (const s of stirpes) {
    const share = mulFrac(bloodTotal, { num: weightOf(s), den: totalWeight })
    if (s.alive && s.head) { out[s.head.id] = share; continue }
    const aliveReps = s.reps.filter(r => !r.is_deceased)
    for (const r of aliveReps) out[r.id] = mulFrac(share, { num: 1, den: aliveReps.length })
  }
  return out
}
