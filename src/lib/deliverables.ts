import type { FinancialAssetRow, RealEstatePropertyRow, KosekiRequestRow, ContractDocumentRow, RealEstateAcquisitionRow } from '@/types'

/**
 * 取得物（deliverable）= 「何を・どこに請求し・いつ受領するか」の進捗単位。
 * 書類受信簿の到着物(item)から、この取得物へ任意でリンクするための候補リストを生成する。
 *
 * value は `kind:id:field` 形式（受領日を書き込む対象カラム名を field に持つ）。
 */
export type DeliverableOption = {
  value: string          // `${kind}:${id}:${field}`
  label: string          // 表示名（例: ○○銀行 残高証明）
  group: string          // グルーピング用（預金 / 証券 / 信託 / 不動産 / 戸籍 / 契約書類）
  kind: 'financial_asset' | 'real_estate' | 'real_estate_acquisition' | 'koseki' | 'contract_doc'
  id: string
  field: string          // 受領日カラム名
}

const FA_GROUP: Record<string, string> = {
  預貯金: '預金',
  証券: '証券',
  信託銀行: '信託',
}

// linked_field（受領日カラム名）から取得物の種別ラベルを得る（受信簿一覧のバッジ表示用）
const FIELD_LABELS: Record<string, string> = {
  arrival_date: '残高証明等',
  cancellation_arrival_date: '解約書類',
  registry_receipt_date: '登記情報',
  cadastral_receipt_date: '公図',
  survey_map_receipt_date: '地積測量図',
  route_price_receipt_date: '路線価',
  eval_cert_receipt_date: '評価証明',
}

export function deliverableLinkLabel(linkedKind: string | null, linkedField: string | null): string | null {
  if (!linkedKind || !linkedField) return null
  if (linkedKind === 'koseki') return '戸籍'
  if (linkedKind === 'contract_doc') return '契約書類'
  if (linkedKind === 'real_estate_acquisition') return '不動産・取得資料'
  const item = FIELD_LABELS[linkedField] ?? '取得物'
  const cat = linkedKind === 'real_estate' ? '不動産' : '金融機関'
  return `${cat}・${item}`
}

export function buildDeliverableOptions(
  financialAssets: FinancialAssetRow[],
  acquisitions: RealEstateAcquisitionRow[],
  properties: RealEstatePropertyRow[],
  kosekiRequests: KosekiRequestRow[] = [],
  contractDocuments: ContractDocumentRow[] = [],
): DeliverableOption[] {
  const opts: DeliverableOption[] = []

  // 契約書類（後日来る＝未受信のもの。受信簿で受信すると arrival_date が入り受信済になる）
  for (const d of contractDocuments) {
    if (d.arrival_date || d.status === '不要' || d.status === 'その場で受領') continue
    opts.push({
      value: `contract_doc:${d.id}:arrival_date`,
      label: d.name || '契約関連書類',
      group: '契約書類',
      kind: 'contract_doc',
      id: d.id,
      field: 'arrival_date',
    })
  }

  for (const a of financialAssets) {
    const group = FA_GROUP[a.asset_type] ?? a.asset_type
    const name = a.institution_name || '(名称未入力)'
    // 調査（残高証明等）の受領
    opts.push({
      value: `financial_asset:${a.id}:arrival_date`,
      label: `${name} 残高証明等（調査）`,
      group,
      kind: 'financial_asset',
      id: a.id,
      field: 'arrival_date',
    })
    // 解約書類の受領（解約有が選択されている機関のみ）
    if (a.cancellation_required === '有') {
      opts.push({
        value: `financial_asset:${a.id}:cancellation_arrival_date`,
        label: `${name} 解約書類`,
        group,
        kind: 'financial_asset',
        id: a.id,
        field: 'cancellation_arrival_date',
      })
    }
  }

  // 不動産は「取得資料管理(real_estate_acquisitions)」の各行を取得物にする。
  // 名寄帳・評価証明は市区町村単位、登記情報・公図・地積測量図は物件単位（取得資料行が正しい単位を持つ）。
  // 路線価は参照（請求・受領なし）のため候補から除外。
  const propLabel = (id: string | null) => {
    const p = id ? properties.find(x => x.id === id) : undefined
    return p ? (p.address || p.lot_number || p.property_type || '物件') : '物件'
  }
  for (const a of acquisitions) {
    if (!a.item_type || a.item_type === '路線価') continue
    const where = a.target_property_id ? propLabel(a.target_property_id) : (a.target_municipality || '市区町村未入力')
    opts.push({
      value: `real_estate_acquisition:${a.id}:arrival_date`,
      label: `${a.item_type}（${where}）`,
      group: '不動産',
      kind: 'real_estate_acquisition',
      id: a.id,
      field: 'arrival_date',
    })
  }

  for (const k of kosekiRequests) {
    const parts = [k.request_to, k.target_person, k.doc_types].filter(Boolean)
    const label = parts.length > 0 ? parts.join(' / ') : '戸籍請求'
    opts.push({
      value: `koseki:${k.id}:arrival_date`,
      label,
      group: '戸籍',
      kind: 'koseki',
      id: k.id,
      field: 'arrival_date',
    })
  }

  return opts
}
