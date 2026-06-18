/**
 * 委任状（AI書類作成）バリエーション定義
 *
 * 各変種は public/templates/ininjo/<key>.xlsx に対応（split_ininjo_templates.py で生成）。
 * ヘッダ（委任者・被相続人・死亡日）の流し込みセルと、法人ごとの押印アンカーを定義する。
 * 本文（権限リスト）や代理人ブロックはテンプレに静的に含まれるため流し込み不要。
 */

export type StampLaw = 'gyosei' | 'shiho'

/** 押印画像ファイル（public/templates/stamps/） */
export const STAMP_FILES: Record<StampLaw, string> = {
  gyosei: 'gyosei.png',
  shiho: 'shiho.png',
}

export type IninjoFieldMap = {
  /** 案件管理番号の分割セル [seg1, seg2, seg3, seg4]（無い様式は省略） */
  caseNo?: [string, string, string, string]
  address?: string      // 委任者住所
  building?: string     // マンション名以下（通常は空欄）
  name?: string         // 委任者氏名
  birthEra?: string     // 生年月日 元号
  birthYear?: string
  birthMonth?: string
  birthDay?: string
  deceased?: string     // 被相続人氏名
  deathEra?: string     // 死亡日 元号
  deathYear?: string
  deathMonth?: string
  deathDay?: string
}

export type IninjoStamp = { law: StampLaw; cell: string }

export type IninjoVariant = {
  key: string
  label: string                 // FMT選択UIの表示名
  group: '連名' | '行政単独' | '司法単独' | 'その他'
  fields: IninjoFieldMap
  stamps: IninjoStamp[]
}

// 標準様式（シート8〜16）共通のヘッダセル
const STD: IninjoFieldMap = {
  caseNo: ['A1', 'B1', 'D1', 'E1'],
  address: 'N8',
  building: 'N9',
  name: 'N10',
  birthEra: 'N12',
  birthYear: 'P12',
  birthMonth: 'R12',
  birthDay: 'T12',
}
// 相続系で追加される被相続人・死亡日
const DECEASED: IninjoFieldMap = {
  deceased: 'F14',
  deathEra: 'K14',
  deathYear: 'L14',
  deathMonth: 'N14',
  deathDay: 'P14',
}

export const ININJO_VARIANTS: IninjoVariant[] = [
  {
    key: 'rengo',
    label: '行・司連名（相続）',
    group: '連名',
    fields: { ...STD, ...DECEASED },
    stamps: [{ law: 'gyosei', cell: 'R22' }, { law: 'shiho', cell: 'R28' }],
  },
  {
    key: 'rengo_yokin',
    label: '行・司連名（預金解約あり）',
    group: '連名',
    fields: { ...STD, ...DECEASED },
    stamps: [{ law: 'gyosei', cell: 'R22' }, { law: 'shiho', cell: 'R28' }],
  },
  {
    key: 'rengo_touki',
    label: '行・司連名（登記のみ）',
    group: '連名',
    fields: { ...STD, ...DECEASED },
    stamps: [{ law: 'gyosei', cell: 'R21' }, { law: 'shiho', cell: 'R27' }],
  },
  {
    key: 'gyosei_souzoku',
    label: '行政単独（相続）',
    group: '行政単独',
    fields: { ...STD, ...DECEASED },
    stamps: [{ law: 'gyosei', cell: 'R21' }],
  },
  {
    key: 'shiho_touki',
    label: '司法単独（相続登記）',
    group: '司法単独',
    fields: { ...STD, ...DECEASED },
    stamps: [{ law: 'shiho', cell: 'R21' }],
  },
  {
    key: 'gyosei_yuigon',
    label: '行政（遺言）',
    group: '行政単独',
    fields: { ...STD },
    stamps: [{ law: 'gyosei', cell: 'T20' }],
  },
  {
    key: 'rengo_zoyo',
    label: '行・司連名（贈与・信託）',
    group: '連名',
    fields: { ...STD },
    stamps: [{ law: 'gyosei', cell: 'R20' }, { law: 'shiho', cell: 'R26' }],
  },
  {
    key: 'shiho_zoyo',
    label: '司法（贈与・信託）',
    group: '司法単独',
    fields: { ...STD },
    stamps: [{ law: 'shiho', cell: 'R20' }],
  },
  {
    key: 'yuigon_kensaku',
    label: '遺言検索のみ',
    group: 'その他',
    fields: { ...STD, ...DECEASED },
    stamps: [{ law: 'gyosei', cell: 'T21' }],
  },
  {
    key: 'houtei',
    label: '法定相続情報証明',
    group: 'その他',
    fields: {
      address: 'G27',
      building: 'G28',
      name: 'G30',
      deceased: 'D18',
    },
    stamps: [{ law: 'gyosei', cell: 'V11' }],
  },
]

export function getIninjoVariant(key: string): IninjoVariant | undefined {
  return ININJO_VARIANTS.find(v => v.key === key)
}

/**
 * 契約形態・受注区分から推奨FMTを決定（初期選択用。最終選択はユーザー）。
 */
export function recommendIninjoVariant(
  contractType: string | null | undefined,
  serviceCategory: string | null | undefined,
): string {
  const svc = serviceCategory ?? ''
  const isYuigon = svc.includes('遺言')
  const isZoyo = svc.includes('贈与') || svc.includes('信託')

  switch (contractType) {
    case '司法書士法人単独':
      if (isZoyo) return 'shiho_zoyo'
      return 'shiho_touki'
    case '行政書士法人単独':
      if (isYuigon) return 'gyosei_yuigon'
      return 'gyosei_souzoku'
    case '行・司連名':
      if (isZoyo) return 'rengo_zoyo'
      return 'rengo'
    default:
      return 'rengo'
  }
}
