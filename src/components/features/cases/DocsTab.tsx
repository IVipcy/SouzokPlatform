'use client'

import CaseDocumentTable from '@/components/features/documents/CaseDocumentTable'
import { Section } from '@/components/ui/InlineFields'
import TabHeader from './TabHeader'
import type { CaseRow, CaseDocumentRow } from '@/types'

type Props = {
  caseData: CaseRow
  documents: CaseDocumentRow[]
}

/**
 * 案件詳細「到着物」タブ。お客様から届く書類のファイル管理。
 * 書類名 / ファイル更新日 / ファイル(プレビュー or DL) の3列のみ。
 */
export default function DocsTab({ caseData, documents }: Props) {
  return (
    <div className="space-y-3.5">
      <TabHeader title="到着物" description="この案件に紐づく到着物（お客様から届く書類）のファイル管理" />
      <Section title="到着物一覧">
        <CaseDocumentTable
          caseId={caseData.id}
          rows={documents}
          noun="到着物"
        />
      </Section>
    </div>
  )
}
