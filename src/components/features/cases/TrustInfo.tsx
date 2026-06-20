'use client'

import { Section, FieldGrid, InlineSelect, InlineEdit, InlineTextarea } from '@/components/ui/InlineFields'
import { TRUST_CONTRACT_TYPES, WILL_CREATION_PLACES, TRUST_CONTENT_OPTIONS } from '@/lib/constants'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

/**
 * 信託情報（信託タブの業務情報）。
 * もとは遺言タブ(mode='will')にあったが、信託契約タブに移設（2026-06-20）。
 * 信託契約書種別・作成場所・最終帰属者＋信託記載内容（カテゴリ別・JSONB）。
 */
export default function TrustInfo({ caseData, patchCase }: Props) {
  const saveField = (field: keyof CaseRow, value: string) => patchCase({ [field]: value || null } as Partial<CaseRow>)

  // カテゴリ別自由記述（JSONB）更新: 空はキー削除、全空ならnull
  const saveContent = async (category: string, value: string) => {
    const current = (caseData.trust_content_details ?? {}) as Record<string, string>
    const next: Record<string, string> = { ...current }
    if (value.trim()) next[category] = value
    else delete next[category]
    await patchCase({ trust_content_details: Object.keys(next).length ? next : null })
  }

  return (
    <Section title="信託情報" icon="🏛️">
      <FieldGrid>
        <InlineSelect label="信託契約書種別" value={caseData.trust_contract_type} options={[...TRUST_CONTRACT_TYPES]} onSave={v => saveField('trust_contract_type', v)} />
        <InlineSelect label="作成場所" value={caseData.trust_creation_place} options={[...WILL_CREATION_PLACES]} onSave={v => saveField('trust_creation_place', v)} />
        <InlineEdit label="最終帰属者" value={caseData.trust_final_beneficiary} onSave={v => saveField('trust_final_beneficiary', v)} fullWidth />
      </FieldGrid>
      <div className="mt-3">
        <Section title="信託記載内容（カテゴリ別）" collapsible defaultOpen={false}>
          <div className="space-y-2">
            {TRUST_CONTENT_OPTIONS.map(cat => (
              <InlineTextarea
                key={cat}
                label={cat}
                value={caseData.trust_content_details?.[cat] ?? ''}
                onSave={v => saveContent(cat, v)}
                fullWidth
              />
            ))}
          </div>
        </Section>
      </div>
    </Section>
  )
}
