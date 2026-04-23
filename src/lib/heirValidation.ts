import type { HeirRow } from '@/types'

export type HeirValidationWarning = {
  severity: 'error' | 'warning'
  message: string
  detail?: string
}

/**
 * 法定相続人の組み合わせを民法の順位ルールに照らしてバリデーション
 *
 * 民法上の順位:
 *   配偶者: 常に相続人
 *   第1順位: 子（直系卑属）
 *   第2順位: 直系尊属（父母）
 *   第3順位: 兄弟姉妹
 *
 * 前順位がいる場合、次順位は法定相続人にならない。
 */
export function validateHeirs(heirs: HeirRow[]): HeirValidationWarning[] {
  const warnings: HeirValidationWarning[] = []

  const typeOf = (h: HeirRow): string => {
    if (h.relationship_type) return h.relationship_type
    return h.relationship ?? ''
  }

  const legalHeirs = heirs.filter(h => h.is_legal_heir)
  const hasChildAsLegal = legalHeirs.some(h => {
    const t = typeOf(h)
    return t === '子' || ['長男','長女','二男','二女','三男','三女','養子'].includes(h.relationship ?? '')
  })
  const hasParentAsLegal = legalHeirs.some(h => ['父', '母'].includes(typeOf(h)))
  const hasSiblingAsLegal = legalHeirs.some(h => typeOf(h) === '兄弟姉妹')

  // 1. 子がいる場合、父母・兄弟姉妹は法定相続人にならない
  if (hasChildAsLegal && hasParentAsLegal) {
    warnings.push({
      severity: 'error',
      message: '子がいる場合、父母は法定相続人になりません',
      detail: '民法887条により、子（第1順位）がいる場合、直系尊属（第2順位）は相続人になりません。父母の「法定相続人」チェックを外してください。',
    })
  }
  if (hasChildAsLegal && hasSiblingAsLegal) {
    warnings.push({
      severity: 'error',
      message: '子がいる場合、兄弟姉妹は法定相続人になりません',
      detail: '民法889条により、子（第1順位）がいる場合、兄弟姉妹（第3順位）は相続人になりません。',
    })
  }

  // 2. 父母がいる場合、兄弟姉妹は法定相続人にならない
  if (!hasChildAsLegal && hasParentAsLegal && hasSiblingAsLegal) {
    warnings.push({
      severity: 'error',
      message: '父母がいる場合、兄弟姉妹は法定相続人になりません',
      detail: '民法889条により、直系尊属（第2順位）がいる場合、兄弟姉妹（第3順位）は相続人になりません。',
    })
  }

  // 3. 申出人の重複チェック
  const applicants = heirs.filter(h => h.is_applicant)
  if (applicants.length > 1) {
    warnings.push({
      severity: 'error',
      message: `申出人が${applicants.length}名います`,
      detail: '法定相続情報一覧図の申出人は1名のみです。',
    })
  }

  // 4. 申出人が法定相続人でない
  if (applicants.length === 1 && !applicants[0].is_legal_heir) {
    warnings.push({
      severity: 'warning',
      message: '申出人が法定相続人になっていません',
      detail: '通常、申出人は法定相続人の中から1名選びます。',
    })
  }

  return warnings
}
