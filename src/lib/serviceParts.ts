// 受注区分パート制のロジック。受注区分を「順序付きパート（status付き）」として扱い、
// 先行(検認・後見・執行・調停)→本体(手続き一式)の順に進行させる。差し替え/追加/再開も表現する。
// 旧データ(service_category/_2)からの導出もここで担う。純関数のみ（UIから利用）。

import { gyomuForCategories } from '@/lib/serviceMaster'

export type PartStatus = '未着手' | '進行中' | '完了' | '中止'
export type ServicePart = { key: string; order: number; status: PartStatus }

// 先行→本体の順序ランク（小さいほど先）。
const PART_RANK: Record<string, number> = {
  '検認': 1, '後見': 1, '調停': 1, // 先行（独立・並び可）
  '執行': 2,                        // 先行（検認の後）
  '手続き一式': 3,                  // 本体
}
// 上記以外（登記/遺言/信託/契約書/放棄/紹介のみ）は単独本体扱い（rank 3）。
export function partRank(key: string): number {
  return PART_RANK[key] ?? 3
}

// 受注区分キーの配列から順序付きパートを生成（先頭=進行中、以降=未着手）。
export function buildParts(categories: (string | null | undefined)[]): ServicePart[] {
  const uniq = [...new Set(categories.filter((c): c is string => !!c))]
  const sorted = uniq.sort((a, b) => partRank(a) - partRank(b))
  return sorted.map((key, i) => ({ key, order: i + 1, status: (i === 0 ? '進行中' : '未着手') as PartStatus }))
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
      .map(p => ({ key: p.key, order: p.order, status: p.status as PartStatus }))
      .sort((a, b) => a.order - b.order)
  }
  return buildParts([c.service_category, c.service_category_2])
}

// 業務union等に渡すキー配列（中止は除く・order昇順）。
export function activePartKeys(parts: ServicePart[]): string[] {
  return parts.filter(p => p.status !== '中止').sort((a, b) => a.order - b.order).map(p => p.key)
}

// 現在パート（進行中→無ければ最初の未着手）。
export function currentPart(parts: ServicePart[]): ServicePart | null {
  return parts.find(p => p.status === '進行中') ?? parts.find(p => p.status === '未着手') ?? null
}

// 現在パートを完了にし、次の未着手を進行中へ（「パート完了→次へ」）。
export function advanceToNext(parts: ServicePart[]): ServicePart[] {
  const sorted = [...parts].sort((a, b) => a.order - b.order)
  const cur = sorted.findIndex(p => p.status === '進行中')
  if (cur === -1) return sorted
  let advanced = false
  return sorted.map((p, i) => {
    if (i === cur) return { ...p, status: '完了' as PartStatus }
    if (!advanced && i > cur && p.status === '未着手') { advanced = true; return { ...p, status: '進行中' as PartStatus } }
    return p
  })
}

// 全パート完了（or中止）か（＝案件完了の条件）。
export function allPartsDone(parts: ServicePart[]): boolean {
  return parts.length > 0 && parts.every(p => p.status === '完了' || p.status === '中止')
}

// 複数パートか（実績バッジ等の表示要否。中止除く）。
export function isMultiPart(parts: ServicePart[]): boolean {
  return parts.filter(p => p.status !== '中止').length > 1
}

// 「検認 → 手続き一式」の組み合わせか。戸籍収集が両パートにまたがるのはこの組み合わせだけなので、
// 「取得パート」フラグ（どのパートで取得した戸籍か）はこのときの戸籍請求でのみ表示する。
// （遺言→執行など他の組み合わせでは取得パートの区別は不要。）
export function isKosekiCrossPart(parts: ServicePart[]): boolean {
  const keys = activePartKeys(parts)
  return keys.includes('検認') && keys.includes('手続き一式')
}

// 受注区分を差し替え（現パートを中止し、新区分を進行中で末尾に追加）。放棄等の方針変更。
export function replaceCurrent(parts: ServicePart[], newKey: string): ServicePart[] {
  const sorted = [...parts].sort((a, b) => a.order - b.order)
  const maxOrder = sorted.reduce((m, p) => Math.max(m, p.order), 0)
  const stopped = sorted.map(p => (p.status === '進行中' ? { ...p, status: '中止' as PartStatus } : p))
  return [...stopped, { key: newKey, order: maxOrder + 1, status: '進行中' as PartStatus }]
}

// 区分を途中追加（末尾に未着手で。既存進行は変えない）。重複（中止以外）は無視。
export function addPart(parts: ServicePart[], newKey: string): ServicePart[] {
  if (parts.some(p => p.key === newKey && p.status !== '中止')) return parts
  const sorted = [...parts].sort((a, b) => a.order - b.order)
  const maxOrder = sorted.reduce((m, p) => Math.max(m, p.order), 0)
  return [...sorted, { key: newKey, order: maxOrder + 1, status: '未着手' as PartStatus }]
}

// 完了案件を再開（新区分を進行中で末尾に追加）。生前系→死亡後の再受注。
export function reopenWith(parts: ServicePart[], newKey: string): ServicePart[] {
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
