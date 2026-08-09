// 財産目録（財産・債務一覧表）の組み立て。
//
// 実際に使っているエクセル「★財産目録」の〈分割案4名まで【日付2つ】〉シートの区分・列に合わせる。
// 画面（財産目録タブ）と Excel 出力の両方がこれを使うので、見えているものがそのまま出力される。
//
// 元データは財産調査の入力そのもの（不動産／金融資産／その他財産・相続債務・その他費用）。
// 目録側で入れ直す必要はなく、財産調査を直せば目録も出力も追従する。
//
// 実物は金額欄が「相続開始日」「調査日」の2列だが、いまは残高を1つしか持たないため金額は1列。

export type InventoryRow = {
  /** 明細の列（区分ごとの並び。セクションの headers と同じ数） */
  cells: Array<string | number | null>
  amount: number | null
  /** 建物だけ使う2段目（家屋番号） */
  subLine?: string | null
}

export type InventorySection = {
  key: string
  title: string
  /** 金額列より前の見出し */
  headers: string[]
  /** 金額列の見出し（区分で呼び方が違う） */
  amountHeader: string
  rows: InventoryRow[]
  total: number
  /** 合計時にマイナス計上する区分 */
  negative?: boolean
}

type Property = {
  property_type?: string | null; address?: string | null; lot_number?: string | null; kaoku_bango?: string | null
  land_category?: string | null; land_area?: number | null
  building_kind?: string | null; building_structure?: string | null
  share_numerator?: number | null; share_denominator?: number | null
  appraisal_value?: number | null; notes?: string | null
}
type FinAsset = {
  asset_type?: string | null; institution_name?: string | null; branch_name?: string | null
  account_type?: string | null; account_number?: string | null; balance_amount?: number | null
  notes?: string | null; evidence_docs?: string[] | null
}
type OtherAsset = { kind?: string | null; label?: string | null; amount?: number | null; note?: string | null }

const isLand = (t?: string | null) => !!t && (t.includes('土地') || t.includes('宅地'))
const isBuilding = (t?: string | null) => !!t && (t.includes('建物') || t.includes('マンション') || t.includes('区分'))
const shareText = (n?: number | null, d?: number | null) => (n && d ? `${n}/${d}` : n ? String(n) : '')
const evidenceText = (f: FinAsset) => (f.evidence_docs ?? []).join('・')
const inst = (f: FinAsset) => [f.institution_name, f.branch_name].filter(Boolean).join('　')

export function buildInventorySections(
  properties: Property[],
  financialAssets: FinAsset[],
  otherAssets: OtherAsset[],
): InventorySection[] {
  const sec = (
    key: string, title: string, headers: string[], amountHeader: string,
    rows: InventoryRow[], negative?: boolean,
  ): InventorySection => ({
    key, title, headers, amountHeader, rows,
    total: rows.reduce((s, r) => s + (r.amount ?? 0), 0),
    negative,
  })

  const land = properties.filter(p => isLand(p.property_type))
  const building = properties.filter(p => isBuilding(p.property_type))
  // 種別が土地でも建物でもない物件（未入力など）は落とさず土地側に寄せる
  const rest = properties.filter(p => !isLand(p.property_type) && !isBuilding(p.property_type))

  return [
    sec('land', '土地', ['所在', '地番', '地目', '地積', '持分'], '固定資産評価額',
      [...land, ...rest].map(p => ({
        cells: [p.address ?? '', p.lot_number ?? '', p.land_category ?? '', p.land_area ?? '', shareText(p.share_numerator, p.share_denominator)],
        amount: p.appraisal_value ?? null,
      }))),
    sec('building', '建物', ['不動産の所在', '種類', '構造・床面積', '持分'], '評価額',
      building.map(p => ({
        cells: [p.address ?? '', p.building_kind ?? '', p.building_structure ?? '', shareText(p.share_numerator, p.share_denominator)],
        amount: p.appraisal_value ?? null,
        subLine: p.kaoku_bango ? `家屋番号　${p.kaoku_bango}` : null,
      }))),
    sec('deposit', '預貯金', ['金融機関', '種別', '口座番号等'], '金額',
      financialAssets.filter(f => f.asset_type === '預貯金').map(f => ({
        cells: [inst(f), f.account_type ?? '', f.account_number ?? ''],
        amount: f.balance_amount ?? null,
      }))),
    sec('securities', '有価証券', ['金融機関', '種別', '銘柄等'], '金額',
      financialAssets.filter(f => f.asset_type === '証券' || f.asset_type === '信託銀行' || f.asset_type === '信託').map(f => ({
        cells: [inst(f), f.asset_type ?? '', f.account_number ?? ''],
        amount: f.balance_amount ?? null,
      }))),
    sec('other', 'その他財産', ['品目'], '金額',
      otherAssets.filter(o => o.kind === 'その他財産').map(o => ({
        cells: [o.label ?? ''],
        amount: o.amount ?? null,
      }))),
    sec('debt', '債務', ['品目'], '金額',
      otherAssets.filter(o => o.kind === '相続債務' || o.kind === 'その他費用').map(o => ({
        cells: [[o.kind === 'その他費用' ? '【費用】' : '', o.label ?? ''].filter(Boolean).join('')],
        amount: o.amount ?? null,
      })), true),
  ]
}

/** 備考・根拠資料（区分ごとに元データが違うので、行と同じ並びで別に返す） */
export function buildInventoryNotes(
  properties: Property[],
  financialAssets: FinAsset[],
  otherAssets: OtherAsset[],
): Record<string, Array<{ note: string; evidence: string }>> {
  const land = properties.filter(p => isLand(p.property_type))
  const rest = properties.filter(p => !isLand(p.property_type) && !isBuilding(p.property_type))
  const fin = (types: string[]) => financialAssets.filter(f => types.includes(f.asset_type ?? ''))
  const other = (kinds: string[]) => otherAssets.filter(o => kinds.includes(o.kind ?? ''))
  return {
    land: [...land, ...rest].map(p => ({ note: p.notes ?? '', evidence: '' })),
    building: properties.filter(p => isBuilding(p.property_type)).map(p => ({ note: p.notes ?? '', evidence: '' })),
    deposit: fin(['預貯金']).map(f => ({ note: f.notes ?? '', evidence: evidenceText(f) })),
    securities: fin(['証券', '信託銀行', '信託']).map(f => ({ note: f.notes ?? '', evidence: evidenceText(f) })),
    other: other(['その他財産']).map(o => ({ note: o.note ?? '', evidence: '' })),
    debt: other(['相続債務', 'その他費用']).map(o => ({ note: o.note ?? '', evidence: '' })),
  }
}

/** プラス財産 − 債務 */
export function inventoryNet(sections: InventorySection[]): number {
  return sections.reduce((s, sec) => s + (sec.negative ? -sec.total : sec.total), 0)
}
