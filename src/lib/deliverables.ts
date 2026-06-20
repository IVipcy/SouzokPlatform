import type { FinancialAssetRow, RealEstatePropertyRow, KosekiRequestRow, ContractDocumentRow, RealEstateAcquisitionRow, AgreementDispatchRow, HeirRow } from '@/types'

/**
 * 取得物（deliverable）= 「何を・どこに請求し・いつ受領するか」の進捗単位。
 * 書類受信簿の到着物(item)から、この取得物へ任意でリンクするための候補リストを生成する。
 *
 * 候補は「この案件で実際にやっている業務(intake_roles の gyomu)」から動的に決まる。
 * 各業務の受領物は専用テーブル（戸籍/金融/不動産/協議書…）の行単位で紐付ける。
 * 新しい受領系の業務を足すときは、RECEIPT_SOURCE_GYOMU と buildDeliverableOptions に1ブロック追加する。
 *
 * value は `kind:id:field` 形式（受領日を書き込む対象カラム名を field に持つ）。
 */
export type DeliverableOption = {
  value: string          // `${kind}:${id}:${field}`
  label: string          // 表示名（例: ○○銀行 残高証明）
  group: string          // グルーピング用（預金 / 証券 / 信託 / 不動産 / 戸籍 / 契約書類 / 遺産分割協議書）
  kind: 'financial_asset' | 'real_estate' | 'real_estate_acquisition' | 'koseki' | 'contract_doc' | 'agreement_dispatch'
  id: string
  field: string          // 受領日カラム名
}

// 受信簿の候補ソースを持つ業務(gyomu)。intake_roles にこの業務があるとき候補に出す。
export const RECEIPT_SOURCE_GYOMU = ['戸籍', '金融資産', '解約', '不動産', '協議書'] as const

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
  if (linkedKind === 'agreement_dispatch') return '遺産分割協議書'
  if (linkedKind === 'real_estate_acquisition') return '不動産・取得資料'
  const item = FIELD_LABELS[linkedField] ?? '取得物'
  const cat = linkedKind === 'real_estate' ? '不動産' : '金融機関'
  return `${cat}・${item}`
}

/**
 * 受信簿の取得物候補を生成。
 * activeGyomu = 案件の intake_roles に含まれる業務の集合。空（未設定）のときは後方互換で全業務を出す。
 */
export function buildDeliverableOptions(
  activeGyomu: Set<string>,
  financialAssets: FinancialAssetRow[],
  acquisitions: RealEstateAcquisitionRow[],
  properties: RealEstatePropertyRow[],
  kosekiRequests: KosekiRequestRow[] = [],
  contractDocuments: ContractDocumentRow[] = [],
  agreementDispatches: AgreementDispatchRow[] = [],
  heirs: HeirRow[] = [],
): DeliverableOption[] {
  const opts: DeliverableOption[] = []
  // 業務が分からない（intake_roles 未設定の旧データ等）ときは全部出す
  const gate = (g: string) => activeGyomu.size === 0 || activeGyomu.has(g)

  // 契約書類（契約時に後日来るもの。業務区分ではないため常に対象）
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

  // 金融資産（残高証明＝金融資産業務 / 解約書類＝解約業務）
  if (gate('金融資産') || gate('解約')) {
    for (const a of financialAssets) {
      const group = FA_GROUP[a.asset_type] ?? a.asset_type
      const name = a.institution_name || '(名称未入力)'
      if (gate('金融資産')) {
        opts.push({
          value: `financial_asset:${a.id}:arrival_date`,
          label: `${name} 残高証明等（調査）`,
          group,
          kind: 'financial_asset',
          id: a.id,
          field: 'arrival_date',
        })
      }
      // 解約書類の受領（解約有が選択されている機関のみ）
      if (gate('解約') && a.cancellation_required === '有') {
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
  }

  // 不動産は「取得資料管理(real_estate_acquisitions)」の各行を取得物にする。
  // 路線価は参照（請求・受領なし）のため候補から除外。
  if (gate('不動産')) {
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
  }

  // 戸籍
  if (gate('戸籍')) {
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
  }

  // 遺産分割協議書の返送（送付済かつ未受領の相続人を候補に）
  if (gate('協議書')) {
    const heirName = new Map(heirs.map(h => [h.id, h.name]))
    for (const d of agreementDispatches) {
      if (!d.heir_id || !d.sent_date || d.received) continue
      opts.push({
        value: `agreement_dispatch:${d.id}:received_date`,
        label: `協議書返送（${heirName.get(d.heir_id) ?? '相続人'}）`,
        group: '遺産分割協議書',
        kind: 'agreement_dispatch',
        id: d.id,
        field: 'received_date',
      })
    }
  }

  return opts
}
