import type { FinancialAssetRow, RealEstatePropertyRow } from '@/types'

/**
 * 取得物（deliverable）= 「何を・どこに請求し・いつ受領するか」の進捗単位。
 * 書類受信簿の到着物(item)から、この取得物へ任意でリンクするための候補リストを生成する。
 *
 * value は `kind:id:field` 形式（受領日を書き込む対象カラム名を field に持つ）。
 */
export type DeliverableOption = {
  value: string          // `${kind}:${id}:${field}`
  label: string          // 表示名（例: ○○銀行 残高証明）
  group: string          // グルーピング用（預金 / 証券 / 信託 / 不動産）
  kind: 'financial_asset' | 'real_estate'
  id: string
  field: string          // 受領日カラム名
}

const FA_GROUP: Record<string, string> = {
  預貯金: '預金',
  証券: '証券',
  信託銀行: '信託',
}

// 不動産の取得物（受領日カラム）: ラベルと要否カラム・受領日カラムの対応
const RE_ITEMS: { label: string; req: keyof RealEstatePropertyRow; recv: keyof RealEstatePropertyRow }[] = [
  { label: '登記情報', req: 'registry_required', recv: 'registry_receipt_date' },
  { label: '公図', req: 'cadastral_required', recv: 'cadastral_receipt_date' },
  { label: '地積測量図', req: 'survey_map_required', recv: 'survey_map_receipt_date' },
  { label: '路線価', req: 'route_price_required', recv: 'route_price_receipt_date' },
  { label: '評価証明', req: 'eval_cert_required', recv: 'eval_cert_receipt_date' },
]

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
  const item = FIELD_LABELS[linkedField] ?? '取得物'
  const cat = linkedKind === 'real_estate' ? '不動産' : '金融機関'
  return `${cat}・${item}`
}

export function buildDeliverableOptions(
  financialAssets: FinancialAssetRow[],
  realEstate: RealEstatePropertyRow[],
): DeliverableOption[] {
  const opts: DeliverableOption[] = []

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

  for (const p of realEstate) {
    const name = p.address || p.property_type || '(所在地未入力)'
    for (const it of RE_ITEMS) {
      // 「不要」が明示された取得物は候補から除外（未設定・要・確認中は表示）
      if ((p[it.req] as string | null) === '不要') continue
      opts.push({
        value: `real_estate:${p.id}:${it.recv}`,
        label: `${name} ${it.label}`,
        group: '不動産',
        kind: 'real_estate',
        id: p.id,
        field: it.recv as string,
      })
    }
  }

  return opts
}
