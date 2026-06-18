'use client'

import { useState } from 'react'
import { Section, FieldGrid, InlineEdit, InlineSelect } from '@/components/ui/InlineFields'
import { CONTRACT_TYPES } from '@/lib/constants'
import {
  ORDER_CATEGORIES, REFERRAL_ONLY_CATEGORY, KENIN_CATEGORY, KENIN_COMBO_SECONDARY,
  categoriesOf, gyomuForCategories, tasksForCategories, seedRolesForCategories,
} from '@/lib/serviceMaster'
import { IntakeRolesEditor, DEFAULT_ROLES, type RoleRow } from './ProcedureIntakeSection'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

/**
 * 受注内容タブ。
 *   受注区分（1つ。検認のみ「検認①→手続き一式②」のコンボ可）→ 紐づく業務がプリセットで全選択表示
 *   → 業務ごとの作業に担当（既定=自社）。業務・作業・担当は intake_roles(JSONB) に保持。
 *   コンボ時、重複業務（戸籍等）は先の区分（検認）を優先し1回だけ表示。
 */
export default function OrderContentTab({ caseData, patchCase }: Props) {
  const [orderCategory, setOrderCategory] = useState<string>(caseData.service_category ?? '')
  const [cat2, setCat2] = useState<string>(caseData.service_category_2 ?? '')
  const [roles, setRoles] = useState<RoleRow[]>(caseData.intake_roles ?? DEFAULT_ROLES)

  const cats = categoriesOf(orderCategory, cat2)
  const save = async (field: string, value: unknown) => { await patchCase({ [field]: value ?? null } as Partial<CaseRow>) }
  const saveRoles = (next: RoleRow[]) => { setRoles(next); patchCase({ intake_roles: next }) }

  // 受注区分①を選ぶ → 業務・作業を初期セット（区分変更時は入れ直し）。検認以外は②をクリア。
  const selectCategory = async (cat: string) => {
    if (cat === orderCategory) return
    if (!cat) { setOrderCategory(''); setCat2(''); await patchCase({ service_category: null, service_category_2: null, procedure_type: null, intake_roles: [] }); return }
    if (roles.length > 0 && !confirm('受注区分を変えると、業務・担当が新しい区分の初期値で入れ直されます。よろしいですか？')) return
    const newCat2 = cat === KENIN_CATEGORY ? cat2 : ''
    const next = categoriesOf(cat, newCat2)
    const seeded = seedRolesForCategories(next) as RoleRow[]
    setOrderCategory(cat); setCat2(newCat2); setRoles(seeded)
    await patchCase({ service_category: cat, service_category_2: newCat2 || null, procedure_type: next, intake_roles: seeded })
  }

  // 検認①→手続き一式② の追加/解除
  const toggleFull = async (on: boolean) => {
    if (roles.length > 0 && !confirm('受注区分を変えると、業務・担当が入れ直されます。よろしいですか？')) return
    const newCat2 = on ? KENIN_COMBO_SECONDARY : ''
    const next = categoriesOf(orderCategory, newCat2)
    const seeded = seedRolesForCategories(next) as RoleRow[]
    setCat2(newCat2); setRoles(seeded)
    await patchCase({ service_category_2: newCat2 || null, procedure_type: next, intake_roles: seeded })
  }

  return (
    <div className="space-y-3.5">
      <Section title="受注内容">
        <FieldGrid>
          <InlineSelect label="受注区分" value={orderCategory || null} options={[...ORDER_CATEGORIES]} onSave={v => selectCategory(v)} required />
          <InlineEdit label="その他手続" value={caseData.other_procedure} onSave={v => save('other_procedure', v)} />
          <InlineSelect label="契約形態" value={caseData.contract_type} options={[...CONTRACT_TYPES]} onSave={v => save('contract_type', v)} />
        </FieldGrid>
        {orderCategory === KENIN_CATEGORY && (
          <label className="mt-2 flex items-center gap-2 cursor-pointer text-[13px] text-gray-700">
            <input type="checkbox" checked={cat2 === KENIN_COMBO_SECONDARY} onChange={e => toggleFull(e.target.checked)} className="w-4 h-4 accent-brand-600" />
            手続き一式へ移行する（検認① → 手続き一式②。重複する業務は表示しません）
          </label>
        )}
      </Section>

      <Section title={orderCategory === REFERRAL_ONLY_CATEGORY ? '紹介先（自社手続きはありません）' : '業務・役割分担（自社 / 依頼者 どちらが行うか）'}>
        {orderCategory === REFERRAL_ONLY_CATEGORY ? (
          <p className="text-[12px] text-gray-400">紹介のみは自社で行う相続手続きはありません。紹介先（税理士＝相続税申告 / 不動産＝査定 / 遺品整理 / 弁護士）は「他事業者紹介」タブで入力してください。</p>
        ) : orderCategory ? (
          <>
            <p className="text-[12px] text-gray-400 mb-2">
              {cat2 ? '検認①→手続き一式②の業務が表示されます（重複は先の区分優先）。' : '受注区分の業務が全選択で表示されます。'}やらない業務は外してください。作業ごとに担当（既定=自社）を変更できます。
            </p>
            <IntakeRolesEditor
              roles={roles}
              onSave={saveRoles}
              gyomuOptions={gyomuForCategories(cats)}
              presetFor={g => tasksForCategories(cats, g).map(t => t.task)}
            />
          </>
        ) : (
          <p className="text-[12px] text-gray-400">先に「受注区分」を選んでください。</p>
        )}
      </Section>
    </div>
  )
}
