'use client'

import { useState } from 'react'
import { Section, FieldGrid, InlineEdit, InlineSelect } from '@/components/ui/InlineFields'
import { CONTRACT_TYPES } from '@/lib/constants'
import { ORDER_CATEGORIES, gyomuFor, tasksFor } from '@/lib/serviceMaster'
import { IntakeRolesEditor, DEFAULT_ROLES, type RoleRow } from './ProcedureIntakeSection'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

/**
 * 受注内容タブ。
 *   受注区分（1つ選択）→ 紐づく業務がプリセットで全選択表示 → 業務ごとの作業に担当（既定=自社）。
 *   業務・作業・担当は intake_roles(JSONB) に保持（受注区分マスタ serviceMaster 駆動）。
 */
export default function OrderContentTab({ caseData, patchCase }: Props) {
  const [orderCategory, setOrderCategory] = useState<string>(caseData.service_category ?? '')
  const [roles, setRoles] = useState<RoleRow[]>(caseData.intake_roles ?? DEFAULT_ROLES)

  const save = async (field: string, value: unknown) => { await patchCase({ [field]: value ?? null } as Partial<CaseRow>) }
  const saveRoles = (next: RoleRow[]) => { setRoles(next); patchCase({ intake_roles: next }) }

  // 受注区分を選ぶ → その区分の業務・作業を全て自社で初期セット（区分変更時は入れ直し）
  const selectCategory = async (cat: string) => {
    if (cat === orderCategory) return
    if (!cat) { setOrderCategory(''); await patchCase({ service_category: null }); return }
    if (roles.length > 0 && !confirm('受注区分を変えると、業務・担当が新しい区分の初期値で入れ直されます。よろしいですか？')) return
    const seeded: RoleRow[] = gyomuFor(cat).flatMap(g =>
      tasksFor(cat, g).map(t => ({ gyomu: g, sagyou: t.task, owner: '自社', note: '' })),
    )
    setOrderCategory(cat)
    setRoles(seeded)
    await patchCase({ service_category: cat, intake_roles: seeded })
  }

  return (
    <div className="space-y-3.5">
      <Section title="受注内容">
        <FieldGrid>
          <InlineSelect label="受注区分" value={orderCategory || null} options={[...ORDER_CATEGORIES]} onSave={v => selectCategory(v)} required />
          <InlineEdit label="その他手続" value={caseData.other_procedure} onSave={v => save('other_procedure', v)} />
          <InlineSelect label="契約形態" value={caseData.contract_type} options={[...CONTRACT_TYPES]} onSave={v => save('contract_type', v)} />
        </FieldGrid>
      </Section>

      <Section title="業務・役割分担（自社 / 依頼者 どちらが行うか）">
        {orderCategory ? (
          <>
            <p className="text-[12px] text-gray-400 mb-2">受注区分の業務が全選択で表示されます。やらない業務は外してください。作業ごとに担当（既定=自社）を変更できます。</p>
            <IntakeRolesEditor
              roles={roles}
              onSave={saveRoles}
              gyomuOptions={gyomuFor(orderCategory)}
              presetFor={g => tasksFor(orderCategory, g).map(t => t.task)}
            />
          </>
        ) : (
          <p className="text-[12px] text-gray-400">先に「受注区分」を選んでください。</p>
        )}
      </Section>
    </div>
  )
}
