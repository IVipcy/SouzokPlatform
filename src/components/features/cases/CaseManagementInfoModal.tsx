'use client'

import Modal from '@/components/ui/Modal'
import { FieldGrid, Field, InlineEdit, InlineSelect, InlineDate } from '@/components/ui/InlineFields'
import { LOCATIONS } from '@/lib/constants'
import type { CaseRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

/**
 * 管理情報モーダル。LP番号・原本保管場所・受注日・完了予定日・完了日。
 * もとはヘッダー下部の「管理情報▾」展開フォーム。タブの「案件情報」ドロップダウン
 * の先頭から開くようにしたため、本モーダルに切り出した。
 */
export default function CaseManagementInfoModal({ isOpen, onClose, caseData, patchCase }: Props) {
  const saveCaseField = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="管理情報" maxWidth="max-w-xl">
      <div className="p-1">
        <FieldGrid>
          <InlineEdit label="LP案件管理番号" value={caseData.lp_case_number} onSave={v => saveCaseField('lp_case_number', v)} />
          <InlineSelect label="原本保管場所" value={caseData.location} options={[...LOCATIONS]} onSave={v => saveCaseField('location', v)} required />
          <InlineDate label="受注日（受託日）" value={caseData.order_received_date} onSave={v => saveCaseField('order_received_date', v || null)} />
          <InlineDate label="完了予定日" value={caseData.expected_completion_date} onSave={v => saveCaseField('expected_completion_date', v || null)} />
          <Field label="完了日" value={caseData.completion_date ?? '未完了'} mono />
        </FieldGrid>
      </div>
    </Modal>
  )
}
