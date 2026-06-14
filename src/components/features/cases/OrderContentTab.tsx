'use client'

import { useState } from 'react'
import { Section, FieldGrid, InlineEdit, InlineSelect, InlineMultiSelect } from '@/components/ui/InlineFields'
import { SubTabs } from '@/components/ui/SubTabs'
import { PROCEDURE_TYPES, CONTRACT_TYPES } from '@/lib/constants'
import {
  IntakeDocsEditor, IntakeRolesEditor, DEFAULT_DOCS, DEFAULT_ROLES, type DocRow, type RoleRow,
} from './ProcedureIntakeSection'
import type { CaseRow } from '@/types'

const SUBTABS = [
  { key: 'content', label: '受注内容' },
  { key: 'contract', label: '契約手続き' },
]

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  // オーダーシート埋め込み時（子タブを出さず両方を縦に並べる）
  orderSheetMode?: boolean
}

/**
 * 受注内容・契約手続きタブ。
 *   子タブ「受注内容」: 手続区分 / その他手続 / 契約形態 ＋ ②役割分担（自社/依頼者）
 *   子タブ「契約手続き」: ①契約関連書類をいつ受け取るか（Phase B で書類タブの受信簿と連動予定）
 * いずれも面談情報の「手続き詳細」と同じ intake_documents / intake_roles を編集する。
 */
export default function OrderContentTab({ caseData, patchCase, orderSheetMode = false }: Props) {
  const [sub, setSub] = useState<'content' | 'contract'>('content')
  const [docs, setDocs] = useState<DocRow[]>(caseData.intake_documents ?? DEFAULT_DOCS)
  const [roles, setRoles] = useState<RoleRow[]>(caseData.intake_roles ?? DEFAULT_ROLES)

  const save = async (field: string, value: unknown) => { await patchCase({ [field]: value ?? null } as Partial<CaseRow>) }
  const saveDocs = (next: DocRow[]) => { setDocs(next); patchCase({ intake_documents: next }) }
  const saveRoles = (next: RoleRow[]) => { setRoles(next); patchCase({ intake_roles: next }) }

  const ContentBlock = (
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

  const ContractBlock = (
    <Section title="契約手続き（契約関連書類の受け取り）">
      <p className="text-[12px] text-gray-400 mb-2">どの契約関連書類を、いつお客様から受け取るかを管理します。受領状況「後日郵送 / 依頼者が取得」は案件進捗の「契約処理の残」に表示されます。</p>
      <IntakeDocsEditor docs={docs} onSave={saveDocs} />
    </Section>
  )

  // オーダーシート埋め込み時は子タブを出さず、両方を縦に並べる
  if (orderSheetMode) {
    return (
      <div className="space-y-3.5">
        {ContentBlock}
        {ContractBlock}
      </div>
    )
  }

  return (
    <div className="space-y-3.5">
      <SubTabs tabs={SUBTABS} active={sub} onChange={k => setSub(k as 'content' | 'contract')} className="mb-1" />
      {sub === 'content' ? ContentBlock : ContractBlock}
    </div>
  )
}
