'use client'

import { Section, FieldGrid, InlineEdit, InlineDate } from '@/components/ui/InlineFields'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  /** 業務名（放棄手続き / 調停手続き / 検認手続き / 後見手続き）。court_procedure_info のキー。 */
  gyomu: string
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

type CourtInfo = NonNullable<CaseRow['court_procedure_info']>[string]

/**
 * 家庭裁判所手続きの共通情報（放棄/調停/検認/後見で共有）。
 * 管轄家裁・事件番号・申立日・期日・結果を業務(gyomu)単位で持つ（cases.court_procedure_info JSONB）。
 */
export default function CourtProcedureInfo({ caseData, gyomu, patchCase }: Props) {
  const all = caseData.court_procedure_info ?? {}
  const info: CourtInfo = all[gyomu] ?? {}

  const save = (field: keyof CourtInfo, value: string) => {
    const nextInfo = { ...info, [field]: value || undefined }
    // 中身が全部空ならキー自体を落とす
    const hasAny = Object.values(nextInfo).some(v => v != null && v !== '')
    const next = { ...all }
    if (hasAny) next[gyomu] = nextInfo
    else delete next[gyomu]
    return patchCase({ court_procedure_info: Object.keys(next).length ? next : null })
  }

  return (
    <Section title="家裁手続き情報" icon="🏛️">
      <FieldGrid>
        <InlineEdit label="管轄家庭裁判所" value={info.court ?? null} onSave={v => save('court', v)} />
        <InlineEdit label="事件番号" value={info.case_number ?? null} onSave={v => save('case_number', v)} />
        <InlineDate label="申立日" value={info.filed_date ?? null} onSave={v => save('filed_date', v)} />
        <InlineDate label="期日" value={info.hearing_date ?? null} onSave={v => save('hearing_date', v)} />
        <InlineEdit label="結果・状態" value={info.result ?? null} onSave={v => save('result', v)} fullWidth />
      </FieldGrid>
    </Section>
  )
}
