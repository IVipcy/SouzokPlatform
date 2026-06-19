'use client'

import { useState } from 'react'
import { SubTabs } from '@/components/ui/SubTabs'
import type { CaseRow, TaskRow, HeirRow, RealEstatePropertyRow, ContractDocumentRow, DocumentRow, KosekiRequestRow } from '@/types'
import DocumentGenerators from './DocumentGenerators'
import CreatedDocsList from './CreatedDocsList'

type Props = {
  caseData: CaseRow
  tasks: TaskRow[]
  heirs: HeirRow[]
  properties: RealEstatePropertyRow[]
  kosekiRequests?: KosekiRequestRow[]
  contractDocuments?: ContractDocumentRow[]
  /** この案件で作成した書類（documents テーブル）。作成書類一覧サブタブで表示。 */
  createdDocuments?: DocumentRow[]
  onRefresh?: () => void
}

export default function DocumentCreateTab({ caseData, tasks, heirs, properties, kosekiRequests = [], contractDocuments = [], createdDocuments = [], onRefresh }: Props) {
  const [sub, setSub] = useState<'create' | 'list'>('create')

  return (
    <div className="space-y-4">
      <SubTabs
        tabs={[{ key: 'create', label: '書類作成' }, { key: 'list', label: `作成書類一覧 ${createdDocuments.length}` }]}
        active={sub}
        onChange={k => setSub(k as 'create' | 'list')}
      />

      {sub === 'create' && (
        <DocumentGenerators
          caseData={caseData}
          tasks={tasks}
          heirs={heirs}
          properties={properties}
          kosekiRequests={kosekiRequests}
          contractDocuments={contractDocuments}
          onGenerated={onRefresh}
        />
      )}

      {sub === 'list' && (
        <CreatedDocsList documents={createdDocuments} onRefresh={onRefresh} />
      )}
    </div>
  )
}
