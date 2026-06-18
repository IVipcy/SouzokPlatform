/**
 * 委任契約書（AI書類作成）バリエーション定義
 *
 * 各変種は public/templates/keiyaku/<key>.xlsx に対応（split_keiyaku_templates.py で生成）。
 * 甲（依頼者）住所・氏名・被相続人を流し込み、乙（行政）・丙（司法）の署名欄に押印する。
 * 報酬は「別紙報酬額基準表の通り」がテンプレに静的に含まれるため金額流し込みは不要。
 * 簡易契約書・1%・執行は対象外（構造が大きく異なるため別途対応）。
 */

import { STAMP_FILES, type StampLaw } from '@/lib/ininjoVariants'

export { STAMP_FILES }
export type { StampLaw }

export type KeiyakuFieldMap = {
  address?: string        // 甲（依頼者）住所
  building?: string       // マンション名以下（通常は空欄）
  name?: string           // 甲（依頼者）氏名
  deceased?: string       // 被相続人氏名（業務範囲の「故○○様」）
  bodyClientName?: string // 本文の依頼者氏名（遺言など単独様式）
}

export type KeiyakuStamp = { law: StampLaw; cell: string }

export type KeiyakuVariant = {
  key: string
  label: string
  group: '連名' | '行政単独' | 'その他'
  fields: KeiyakuFieldMap
  stamps: KeiyakuStamp[]
}

export const KEIYAKU_VARIANTS: KeiyakuVariant[] = [
  {
    key: 'rengo_zaicho_ari',
    label: '行・司連名（財産調査あり）',
    group: '連名',
    fields: { address: 'AF43', building: 'AF44', name: 'AF46', deceased: 'E9' },
    stamps: [{ law: 'gyosei', cell: 'AP52' }, { law: 'shiho', cell: 'AP56' }],
  },
  {
    key: 'rengo_zaicho_nashi',
    label: '行・司連名（財産調査なし）',
    group: '連名',
    fields: { address: 'AF36', building: 'AF37', name: 'AF39', deceased: 'E10' },
    stamps: [{ law: 'gyosei', cell: 'AP44' }, { law: 'shiho', cell: 'AP48' }],
  },
  {
    key: 'gyosei_zaicho_ari',
    label: '行政単独（財産調査あり）',
    group: '行政単独',
    fields: { address: 'AF43', building: 'AF44', name: 'AF46', deceased: 'E9' },
    stamps: [{ law: 'gyosei', cell: 'AP52' }],
  },
  {
    key: 'tanpoku_yuigon',
    label: '遺言など単独（財産調査なし）',
    group: 'その他',
    fields: { address: 'AF31', building: 'AF32', name: 'AF34', bodyClientName: 'D9' },
    stamps: [{ law: 'gyosei', cell: 'AP40' }],
  },
  {
    key: 'ichiritsu',
    label: '1％（行・司連名）',
    group: 'その他',
    fields: { address: 'AF35', name: 'AF38' },
    stamps: [{ law: 'gyosei', cell: 'AP42' }, { law: 'shiho', cell: 'AP46' }],
  },
  {
    key: 'shikkou',
    label: '遺言執行（行・司連名）',
    group: 'その他',
    fields: { address: 'BA14', name: 'BA16' },
    stamps: [{ law: 'gyosei', cell: 'BG19' }, { law: 'shiho', cell: 'BG23' }],
  },
]

export function getKeiyakuVariant(key: string): KeiyakuVariant | undefined {
  return KEIYAKU_VARIANTS.find(v => v.key === key)
}

/**
 * 契約形態・受注区分から推奨FMTを決定（初期選択用。最終選択はユーザー）。
 */
export function recommendKeiyakuVariant(
  contractType: string | null | undefined,
  serviceCategory: string | null | undefined,
): string {
  const svc = serviceCategory ?? ''
  if (svc.includes('遺言')) return 'tanpoku_yuigon'
  switch (contractType) {
    case '行政書士法人単独':
      return 'gyosei_zaicho_ari'
    case '行・司連名':
      return 'rengo_zaicho_ari'
    default:
      return 'rengo_zaicho_ari'
  }
}
