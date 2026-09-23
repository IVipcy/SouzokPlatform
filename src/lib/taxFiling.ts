// 相続税申告の要否まわり。
// 判定は人がする（面談時の見立て＝受注担当、財産調査後の確定＝管理担当）。システムは根拠の「目安」を出すだけ。
//   目安＝資産の合計 と 基礎控除（3,000万円＋600万円×法定相続人の数）の比較。
//   非課税財産・小規模宅地などの特例は見ないので、目安が「超えない」でも「不要」とは言わない。

export const BASIC_DEDUCTION_BASE = 30_000_000
export const BASIC_DEDUCTION_PER_HEIR = 6_000_000

export const basicDeduction = (heirCount: number): number => BASIC_DEDUCTION_BASE + BASIC_DEDUCTION_PER_HEIR * Math.max(0, heirCount)

/** 法定相続人の数（相続人一覧のうち 死亡していない・相続人フラグを外していない人） */
export function legalHeirCount(heirs: Array<{ is_deceased?: boolean | null; is_legal_heir?: boolean | null }>): number {
  return heirs.filter(h => !h.is_deceased && h.is_legal_heir !== false).length
}

const man = (n: number) => `${Math.round(n / 10_000).toLocaleString()}万円`

export type TaxFilingHint = { text: string; over: boolean | null }

/**
 * 目安の文。total＝資産の合計（資産概算 or 確定額）、heirCount＝法定相続人の数。
 * over: true=基礎控除を超える／false=超えない／null=材料が無い
 */
export function taxFilingHint(total: number | null | undefined, heirCount: number, label = '資産概算'): TaxFilingHint {
  const ded = basicDeduction(heirCount)
  if (total == null || total <= 0) {
    return { text: `目安：${label}が未入力です（基礎控除は ${man(ded)}＝3,000万円＋600万円×${heirCount}人）`, over: null }
  }
  if (total > ded) {
    return { text: `目安：${label} ${man(total)} ＞ 基礎控除 ${man(ded)}（相続人${heirCount}人）。申告が要る可能性があります`, over: true }
  }
  return { text: `目安：${label} ${man(total)} ≦ 基礎控除 ${man(ded)}（相続人${heirCount}人）。ただし特例・非課税財産は見ていません`, over: false }
}
