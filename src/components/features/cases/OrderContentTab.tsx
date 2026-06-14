'use client'

import { useState } from 'react'
import { Section, FieldGrid, InlineEdit, InlineSelect, InlineMultiSelect } from '@/components/ui/InlineFields'
import { PROCEDURE_TYPES, CONTRACT_TYPES } from '@/lib/constants'
import { IntakeRolesEditor, DEFAULT_ROLES, type RoleRow } from './ProcedureIntakeSection'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

/**
 * 受注内容タブ。手続区分 / その他手続 / 契約形態 ＋ ②役割分担（intake_roles）。
 * 面談情報の「手続き詳細」と同じ intake_roles を編集する。
 * ※ 契約関連書類の受け取りは「契約残手続き」タブ（ContractProcTab）へ分離。
 */
export default function OrderContentTab({ caseData, patchCase }: Props) {
  const [roles, setRoles] = useState<RoleRow[]>(caseData.intake_roles ?? DEFAULT_ROLES)

  const save = async (field: string, value: unknown) => { await patchCase({ [field]: value ?? null } as Partial<CaseRow>) }
  const saveRoles = (next: RoleRow[]) => { setRoles(next); patchCase({ intake_roles: next }) }

  return (
    <div className="space-y-3.5">
      <Section title="受注内容">
        <FieldGrid>
          <InlineMultiSelect label="手続区分" value={caseData.procedure_type} options={[...PROCEDURE_TYPES]} onSave={v => save('procedure_type', v)} fullWidth required />
          <InlineEdit label="その他手続" value={caseData.other_procedure} onSave={v => save('other_procedure', v)} />
          <InlineSelect label="契約形態" value={caseData.contract_type} options={[...CONTRACT_TYPES]} onSave={v => save('contract_type', v)} />
        </FieldGrid>
      </Section>
      <Section title="役割分担（自社 / 依頼者 どちらが行うか）">
        <IntakeRolesEditor roles={roles} onSave={saveRoles} />
      </Section>
    </div>
  )
}
