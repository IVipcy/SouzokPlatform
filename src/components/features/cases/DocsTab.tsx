'use client'

import CaseDocumentTable from '@/components/features/documents/CaseDocumentTable'
import type { CaseRow, CaseDocumentRow } from '@/types'

type Props = {
  caseData: CaseRow
  documents: CaseDocumentRow[]
}

/**
 * 案件詳細「書類」タブ。
 * /documents の「ドキュメント管理」タブと同じシンプル仕様:
 *   - 書類名 / ファイル更新日 / ファイル(プレビュー or DL) の3列のみ
 *   - 状態フィルタや発送/受領系カラムは廃止
 */
export default function DocsTab({ caseData, documents }: Props) {
  return (
    <div className="space-y-3.5">
      <CaseDocumentTable
        caseId={caseData.id}
        rows={documents}
        title="書類一覧"
        subtitle="この案件に紐づく書類のファイル管理"
      />
    </div>
  )
}
