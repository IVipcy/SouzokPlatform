'use client'

import type { CaseRow } from '@/types'
import {
  Section, FieldGrid, InlineSelect, InlineDate, InlineCurrency, InlineEdit,
} from '@/components/ui/InlineFields'
import { TAX_FILING_OPTIONS, TAX_ADVISOR_REFERRAL_OPTIONS } from '@/lib/constants'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

export default function ReferralTab({ caseData, patchCase }: Props) {
  const save = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  return (
    <div className="max-w-3xl space-y-3.5">

      {/* 相続税申告（財産情報タブから移動） */}
      <Section title="相続税申告" icon="💰">
        <FieldGrid>
          <InlineSelect
            label="相続税申告要否"
            value={caseData.tax_filing_required}
            options={[...TAX_FILING_OPTIONS]}
            onSave={v => save('tax_filing_required', v)}
          />
          <InlineDate
            label="申告期限"
            value={caseData.tax_filing_deadline}
            onSave={v => save('tax_filing_deadline', v || null)}
          />
          <InlineCurrency
            label="資産合計額（概算）"
            value={caseData.total_asset_estimate}
            onSave={v => save('total_asset_estimate', v)}
          />
          <InlineSelect
            label="税理士紹介有無"
            value={caseData.tax_advisor_referral}
            options={[...TAX_ADVISOR_REFERRAL_OPTIONS]}
            onSave={v => save('tax_advisor_referral', v)}
          />
          <InlineEdit
            label="税理士名・事務所名"
            value={caseData.tax_advisor_name}
            onSave={v => save('tax_advisor_name', v)}
            fullWidth
          />
        </FieldGrid>
      </Section>

      {/* 弁護士紹介 */}
      <Section title="弁護士紹介" icon="⚖️">
        <FieldGrid>
          <InlineEdit
            label="弁護士名"
            value={caseData.lawyer_name}
            onSave={v => save('lawyer_name', v)}
          />
          <InlineEdit
            label="事務所名"
            value={caseData.lawyer_office}
            onSave={v => save('lawyer_office', v)}
          />
          <InlineCurrency
            label="紹介金額"
            value={caseData.lawyer_referral_fee}
            onSave={v => save('lawyer_referral_fee', v)}
          />
        </FieldGrid>
      </Section>

      {/* 遺品整理 */}
      <Section title="遺品整理" icon="📦">
        <FieldGrid>
          <InlineEdit
            label="業者名"
            value={caseData.estate_clearance_company}
            onSave={v => save('estate_clearance_company', v)}
          />
          <InlineCurrency
            label="紹介金額"
            value={caseData.estate_clearance_fee}
            onSave={v => save('estate_clearance_fee', v)}
          />
        </FieldGrid>
      </Section>

    </div>
  )
}
