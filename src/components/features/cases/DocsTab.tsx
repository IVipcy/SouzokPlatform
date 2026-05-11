'use client'

import CaseDocumentTable from '@/components/features/documents/CaseDocumentTable'
import type { CaseRow, CaseDocumentRow } from '@/types'

type Props = {
  caseData: CaseRow
  documents: CaseDocumentRow[]
}

/**
 * 案件詳細「書類」タブ。
 *
 * 旧「書類タブ + 郵送管理タブ」を統合したもの。
 *   - メモ書き
 *   - 発送のみ
 *   - 返送待ち
 *   - 受領のみ（お客様から一方的に届く書類）
 *   - 完了（発送 → 受領済み）
 * を 1 つのテーブルで管理する。
 */
export default function DocsTab({ caseData, documents }: Props) {
  return (
    <div className="space-y-3.5">
      <CaseDocumentTable
        caseId={caseData.id}
        rows={documents}
        title="書類一覧"
        subtitle="この案件に紐づくすべての書類（発送・受領・メモ）を一元管理"
      />
    </div>
  )
}
