'use client'

// 「相続税申告要否」の入力欄（面談シート・オーダーシート・実務タブの他事業者紹介で同じもの）。
//   要／不要／確認中 を人が選ぶ。横に目安（資産の合計 vs 基礎控除）を出すが、値は変えない。
//   「要」にしたのに税理士紹介が「なし」のときだけ、下に一言促す（自動では「あり」にしない）。

import { InlineSelect, FieldRow } from '@/components/ui/InlineFields'
import { TAX_FILING_OPTIONS } from '@/lib/constants'
import { legalHeirCount, taxFilingHint } from '@/lib/taxFiling'
import type { HeirRow } from '@/types'

export default function TaxFilingField({ value, onSave, heirs, total, totalLabel = '資産概算', hasTaxReferral }: {
  value: string | null | undefined
  onSave: (v: string) => Promise<void> | void
  heirs: Pick<HeirRow, 'is_deceased' | 'is_legal_heir'>[]
  /** 資産の合計（オーダーシート＝資産概算、実務＝確定額）。null なら「未入力」と出す */
  total: number | null | undefined
  totalLabel?: string
  /** 税理士紹介が「あり」か。undefined なら促しを出さない（面談シートなど紹介の表が無い場所） */
  hasTaxReferral?: boolean
}) {
  const hint = taxFilingHint(total, legalHeirCount(heirs), totalLabel)
  const tone = hint.over === true ? 'text-amber-800 bg-amber-50 border-amber-200' : hint.over === false ? 'text-gray-600 bg-gray-50 border-gray-200' : 'text-gray-500 bg-gray-50 border-gray-200'
  return (
    <>
      <InlineSelect label="相続税申告要否" value={value ?? null} options={[...TAX_FILING_OPTIONS]} onSave={async v => { await onSave(v) }} width="md" />
      <FieldRow bare fullWidth>
        <div className={`text-[12px] leading-snug px-2.5 py-1.5 border ${tone}`}>{hint.text}</div>
        <div className="mt-1 text-[11px] text-gray-400">面談で聞いた見立てを受注担当が入れ、財産調査で金額が固まったら管理担当が確定します。目安は資産の合計と基礎控除（3,000万円＋600万円×法定相続人）の比較で、特例・非課税財産は見ていません。</div>
        {value === '要' && hasTaxReferral === false && (
          <div className="mt-1 text-[12px] text-brand-700">相続税申告「要」ですが税理士紹介が「なし」です。紹介するなら下の「紹介」を「あり」にしてください。</div>
        )}
      </FieldRow>
    </>
  )
}
