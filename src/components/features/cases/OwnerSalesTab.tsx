'use client'

import {
  Section, FieldGrid, Field, InlineEdit, InlineSelect, InlineDate,
} from '@/components/ui/InlineFields'
import { LOCATIONS } from '@/lib/constants'
import type { CaseRow } from '@/types'
import TabHeader from './TabHeader'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

/**
 * 案件管理タブ（受託・オーダーシート作成済から表示）
 *   案件番号・保管場所・受注日など案件そのものの情報。
 * ※ 担当者（受注/管理）は案件ヘッダーへ移設。受注内容（手続区分 等）は「受注内容」タブ。
 */
export default function OwnerSalesTab({ caseData, patchCase }: Props) {
  const save = async (field: keyof CaseRow, value: unknown) => {
    await patchCase({ [field]: value === '' ? null : value } as Partial<CaseRow>)
  }

  return (
    <div className="space-y-3.5">
      <TabHeader title="案件管理" description="案件番号・保管場所・受注日などの基本情報（担当者は上部ヘッダーで管理）" />

      {/* 案件情報（被相続人情報・手続詳細はオーダーシートで入力） */}
      <Section title="案件情報">
        <FieldGrid>
          <InlineEdit label="案件管理番号" value={caseData.case_number} onSave={v => save('case_number', v)} required />
          <InlineEdit label="LP案件管理番号" value={caseData.lp_case_number} onSave={v => save('lp_case_number', v)} />
          <InlineSelect label="難易度" value={caseData.difficulty} options={['易', '普', '難']} onSave={v => save('difficulty', v)} />
          <InlineSelect label="原本保管場所" value={caseData.location} options={[...LOCATIONS]} onSave={v => save('location', v)} required />
          <InlineDate label="受注日（受託日）" value={caseData.order_received_date} onSave={v => save('order_received_date', v || null)} />
          <InlineDate label="完了予定日" value={caseData.expected_completion_date} onSave={v => save('expected_completion_date', v || null)} />
          <Field label="完了日" value={caseData.completion_date ?? '未完了'} mono />
          <Field label="案件作成日" value={caseData.created_at ? caseData.created_at.slice(0, 10) : null} mono />
        </FieldGrid>
      </Section>
    </div>
  )
}
