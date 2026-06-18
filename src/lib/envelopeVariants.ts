/**
 * 封筒（宛名）バリエーション定義
 *
 * 各変種は public/templates/envelope/<key>.xlsx に対応（split_envelope_templates.py で生成）。
 * 依頼者の郵便番号（各桁）・住所・建物名・氏名を流し込む。差出人はテンプレ既設（物理封筒に印刷）。
 */

export type EnvelopeVariant = {
  key: string
  label: string
  /** 郵便番号 上3桁の各桁セル */
  postal3: [string, string, string]
  /** 郵便番号 下4桁の各桁セル */
  postal4: [string, string, string, string]
  address: string   // 宛先住所
  building: string  // マンション名以下
  name: string      // 宛名（氏名）
}

export const ENVELOPE_VARIANTS: EnvelopeVariant[] = [
  {
    key: 'kaku2',
    label: '角２封筒',
    postal3: ['X2', 'Z2', 'AB2'],
    postal4: ['AE2', 'AG2', 'AI2', 'AK2'],
    address: 'G9',
    building: 'G10',
    name: 'K14',
  },
  {
    key: 'naga3_white',
    label: '長形３号（白）',
    postal3: ['K2', 'L2', 'M2'],
    postal4: ['O2', 'P2', 'Q2', 'R2'],
    address: 'A9',
    building: 'C10',
    name: 'C14',
  },
  {
    key: 'naga3_brown',
    label: '長形３号（茶）',
    postal3: ['K2', 'L2', 'M2'],
    postal4: ['O2', 'P2', 'Q2', 'R2'],
    address: 'A9',
    building: 'C10',
    name: 'C14',
  },
]

export function getEnvelopeVariant(key: string): EnvelopeVariant | undefined {
  return ENVELOPE_VARIANTS.find(v => v.key === key)
}

/** 郵便番号文字列を 上3桁・下4桁の各桁配列に分解 */
export function splitPostal(postal: string | null | undefined): { p3: string[]; p4: string[] } {
  const digits = (postal ?? '').replace(/[^0-9]/g, '')
  const p3 = digits.slice(0, 3).split('')
  const p4 = digits.slice(3, 7).split('')
  return { p3, p4 }
}
