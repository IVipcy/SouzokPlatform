// 相続登記の登録免許税（概算）。
//   価格（固定資産評価額）× 持分 ＝ 課税価格 → × 0.4%（4/1000）＝ 登録免許税
// 持分は「その不動産のうち被相続人が持っている割合」。未入力は全部所有として扱う。
//
// 端数処理はしない概算。実際の納付額は
// 課税価格を1,000円未満切捨 → 税額を100円未満切捨 で決まるので、申請時に別途確認する。

import { shareRatio } from '@/lib/constants'
import type { RealEstatePropertyRow } from '@/types'

export const TAX_RATE = 0.004

/** 課税価格＝評価額×持分（持分未入力は全部所有） */
export const taxableValue = (p: RealEstatePropertyRow): number =>
  (p.appraisal_value ?? 0) * shareRatio(p.share_numerator, p.share_denominator)

/** 登録免許税（概算）＝課税価格×0.4% */
export const registrationTax = (p: RealEstatePropertyRow): number => taxableValue(p) * TAX_RATE

/** 財産目録と同じ土地／建物の振り分け（マンションは建物側） */
export const isLandProperty = (t: string | null | undefined) => t === '土地'
export const isBuildingProperty = (t: string | null | undefined) => t === '建物' || t === 'マンション'
