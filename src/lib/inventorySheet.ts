// 財産目録（財産・債務一覧表）の組み立て。
//
// 実際に使っているエクセル「★財産目録」の〈分割案4名まで【日付2つ】〉シートの区分・列に合わせる。
// 画面（財産目録タブ）と Excel 出力の両方がこれを使うので、見えているものがそのまま出力される。
//
// 元データは財産調査の入力そのもの（不動産／金融資産／その他財産・相続債務・その他費用）。
// 目録に写しは作らない。目録で直した内容も元テーブルへ書き戻すので、二重管理にならない。
// そのため各セルは「どのテーブルのどの列か」を持っている（field があるセルは目録から直せる）。
//
// 実物は金額欄が「相続開始日」「調査日」の2列だが、いまは残高を1つしか持たないため金額は1列。

export type SourceTable = 'real_estate_properties' | 'financial_assets' | 'case_other_assets'

export type InvCell = {
  value: string | number | null
  /** 元テーブルの列名。あれば目録から直接編集できる */
  field?: string
  /** 数値として保存する列（地積など） */
  numeric?: boolean
}

export type InventoryRow = {
  source: { table: SourceTable; id: string }
  cells: InvCell[]
  amount: number | null
  amountField: string
  note: string
  noteField: string
  /** 建物だけ使う2段目（家屋番号） */
  subLine?: string | null
  subField?: string
}

export type InventorySection = {
  key: string
  title: string
  /** 金額列より前の見出し（cells と同じ数・同じ順） */
  headers: string[]
  /** 金額列の見出し（区分で呼び方が違う） */
  amountHeader: string
  rows: InventoryRow[]
  total: number
  /** 合計時にマイナス計上する区分 */
  negative?: boolean
}

type Property = {
  id: string
  property_type?: string | null; address?: string | null; lot_number?: string | null; kaoku_bango?: string | null
  land_category?: string | null; land_area?: number | null
  building_kind?: string | null; building_structure?: string | null
  share_numerator?: number | null; share_denominator?: number | null
  appraisal_value?: number | null; notes?: string | null
}
type FinAsset = {
  id: string
  asset_type?: string | null; institution_name?: string | null; branch_name?: string | null
  account_type?: string | null; account_number?: string | null; balance_amount?: number | null
  notes?: string | null; evidence_docs?: string[] | null
}
type OtherAsset = { id: string; kind?: string | null; label?: string | null; amount?: number | null; note?: string | null }

const isLand = (t?: string | null) => !!t && (t.includes('土地') || t.includes('宅地'))
const isBuilding = (t?: string | null) => !!t && (t.includes('建物') || t.includes('マンション') || t.includes('区分'))
const shareText = (n?: number | null, d?: number | null) => (n && d ? `${n}/${d}` : n ? String(n) : '')
const cell = (value: string | number | null | undefined, field?: string, numeric?: boolean): InvCell =>
  ({ value: value ?? '', field, numeric })

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

  // 家屋番号は建物だけの項目。土地の行には出さない（withKaoku を立てたときだけ2段目を持たせる）。
  const propRow = (p: Property, cells: InvCell[], withKaoku = false): InventoryRow => ({
    source: { table: 'real_estate_properties', id: p.id },
    cells, amount: p.appraisal_value ?? null, amountField: 'appraisal_value',
    note: p.notes ?? '', noteField: 'notes',
    ...(withKaoku ? { subLine: p.kaoku_bango ? `家屋番号　${p.kaoku_bango}` : '', subField: 'kaoku_bango' } : {}),
  })
  const finRow = (f: FinAsset, cells: InvCell[]): InventoryRow => ({
    source: { table: 'financial_assets', id: f.id },
    cells, amount: f.balance_amount ?? null, amountField: 'balance_amount',
    note: f.notes ?? '', noteField: 'notes',
  })
  const otherRow = (o: OtherAsset, cells: InvCell[]): InventoryRow => ({
    source: { table: 'case_other_assets', id: o.id },
    cells, amount: o.amount ?? null, amountField: 'amount',
    note: o.note ?? '', noteField: 'note',
  })

  return [
    sec('land', '土地', ['所在', '地番', '地目', '地積', '持分'], '固定資産評価額',
      [...land, ...rest].map(p => propRow(p, [
        cell(p.address, 'address'),
        cell(p.lot_number, 'lot_number'),
        cell(p.land_category, 'land_category'),
        cell(p.land_area, 'land_area', true),
        cell(shareText(p.share_numerator, p.share_denominator)),
      ]))),
    sec('building', '建物', ['不動産の所在', '種類', '構造・床面積', '持分'], '評価額',
      building.map(p => propRow(p, [
        cell(p.address, 'address'),
        cell(p.building_kind, 'building_kind'),
        cell(p.building_structure, 'building_structure'),
        cell(shareText(p.share_numerator, p.share_denominator)),
      ], true))),
    sec('deposit', '預貯金', ['金融機関', '支店', '種別', '口座番号等'], '金額',
      financialAssets.filter(f => f.asset_type === '預貯金').map(f => finRow(f, [
        cell(f.institution_name, 'institution_name'),
        cell(f.branch_name, 'branch_name'),
        cell(f.account_type, 'account_type'),
        cell(f.account_number, 'account_number'),
      ]))),
    sec('securities', '有価証券', ['金融機関', '支店', '種別', '銘柄等'], '金額',
      financialAssets.filter(f => f.asset_type === '証券' || f.asset_type === '信託銀行' || f.asset_type === '信託').map(f => finRow(f, [
        cell(f.institution_name, 'institution_name'),
        cell(f.branch_name, 'branch_name'),
        cell(f.asset_type),
        cell(f.account_number, 'account_number'),
      ]))),
    sec('other', 'その他財産', ['品目'], '金額',
      otherAssets.filter(o => o.kind === 'その他財産').map(o => otherRow(o, [cell(o.label, 'label')]))),
    sec('debt', '債務', ['品目'], '金額',
      otherAssets.filter(o => o.kind === '相続債務' || o.kind === 'その他費用').map(o => otherRow(o, [
        cell(o.kind === 'その他費用' ? `【費用】${o.label ?? ''}` : (o.label ?? ''), 'label'),
      ])), true),
  ]
}

/** 根拠資料（金融資産だけ持っている。行の並びはセクションと同じ） */
export function buildEvidence(financialAssets: FinAsset[]): Record<string, string[]> {
  const of = (types: string[]) =>
    financialAssets.filter(f => types.includes(f.asset_type ?? '')).map(f => (f.evidence_docs ?? []).join('・'))
  return { deposit: of(['預貯金']), securities: of(['証券', '信託銀行', '信託']) }
}

/** プラス財産 − 債務 */
export function inventoryNet(sections: InventorySection[]): number {
  return sections.reduce((s, sec) => s + (sec.negative ? -sec.total : sec.total), 0)
}
