// 受注区分（複数選択）のロジック。
// 現場では複数区分（例: 検認 / 手続き一式）を並行して進めるため、
// 「先行→本体」の順次進行(status遷移)モデルは廃止。受注区分はただの順序付き集合として扱う。
// 旧データの service_parts JSONB は形を維持（status='進行中'固定）し、コードは status を読まない。

import { gyomuForCategories } from '@/lib/serviceMaster'

export type PartStatus = '未着手' | '進行中' | '完了' | '中止'
export type ServicePart = { key: string; order: number; status: PartStatus }

// 並び順ランク（小さいほど先頭に表示）。検認/後見/調停を先、執行、手続き一式の順に。
const PART_RANK: Record<string, number> = {
  '検認': 1, '後見': 1, '調停': 1,
  '執行': 2,
  '手続き一式': 3,
}
export function partRank(key: string): number {
  return PART_RANK[key] ?? 3
}

// 受注区分キーの配列から順序付きパートを生成。status は形の互換性のため '進行中' を入れるが意味は持たない。
export function buildParts(categories: (string | null | undefined)[]): ServicePart[] {
  const uniq = [...new Set(categories.filter((c): c is string => !!c))]
  const sorted = uniq.sort((a, b) => partRank(a) - partRank(b))
  return sorted.map((key, i) => ({ key, order: i + 1, status: '進行中' as PartStatus }))
}

type CaseLike = {
  service_parts?: { key: string; order: number; status: string }[] | null
  service_category?: string | null
  service_category_2?: string | null
}

// 案件のパート一覧（service_parts優先、無ければservice_category/_2から導出）。order昇順。
export function partsForCase(c: CaseLike): ServicePart[] {
  if (Array.isArray(c.service_parts) && c.service_parts.length > 0) {
    return c.service_parts
      .map(p => ({ key: p.key, order: p.order, status: '進行中' as PartStatus }))
      .sort((a, b) => a.order - b.order)
  }
  return buildParts([c.service_category, c.service_category_2])
}

// 業務union等に渡すキー配列（order昇順）。
export function activePartKeys(parts: ServicePart[]): string[] {
  return [...parts].sort((a, b) => a.order - b.order).map(p => p.key)
}

// 区分を途中追加（末尾に。重複は無視）。
export function addPart(parts: ServicePart[], newKey: string): ServicePart[] {
  if (parts.some(p => p.key === newKey)) return parts
  const sorted = [...parts].sort((a, b) => a.order - b.order)
  const maxOrder = sorted.reduce((m, p) => Math.max(m, p.order), 0)
  return [...sorted, { key: newKey, order: maxOrder + 1, status: '進行中' as PartStatus }]
}

// 業務(gyomu)が「どのパートで使われるか」（利用パートのキー配列）。自動導出（タブ段階表示用）。
export function usingPartsOf(gyomu: string, partKeys: string[]): string[] {
  return partKeys.filter(k => gyomuForCategories([k]).includes(gyomu))
}

// 業務の利用パートが複数（=共通）か。
export function isSharedGyomu(gyomu: string, partKeys: string[]): boolean {
  return usingPartsOf(gyomu, partKeys).length >= 2
}
