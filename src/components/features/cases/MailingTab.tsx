'use client'

import { Section, FieldGrid, InlineSelect, InlineEdit, InlineTextarea } from '@/components/ui/InlineFields'
import { MAILING_DESTINATIONS, INVESTIGATION_DOCUMENTS } from '@/lib/constants'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

export default function MailingTab({ caseData, onRefresh: _onRefresh, patchCase }: Props) {
  const saveCaseField = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  return (
    <div className="max-w-3xl">
      <Section title="郵送・書類管理" icon="📬">
        <FieldGrid>
          <InlineSelect label="顧客郵送先" value={caseData.mailing_destination} options={[...MAILING_DESTINATIONS]} onSave={v => saveCaseField('mailing_destination', v)} />
          <InlineSelect label="財産調査使用書類" value={caseData.investigation_document} options={[...INVESTIGATION_DOCUMENTS]} onSave={v => saveCaseField('investigation_document', v)} />
          <InlineEdit label="郵送先住所（その他）" value={caseData.mailing_address_other} onSave={v => saveCaseField('mailing_address_other', v)} fullWidth />
          <InlineTextarea label="重要事項" value={caseData.notes} onSave={v => saveCaseField('notes', v)} fullWidth />
        </FieldGrid>
      </Section>
    </div>
  )
}
