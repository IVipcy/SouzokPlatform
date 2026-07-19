'use client'

import type { CaseRow, TaskRow, HeirRow, RealEstatePropertyRow, ContractDocumentRow, KosekiRequestRow } from '@/types'
import DocumentGenerators from './DocumentGenerators'
import TabHeader from './TabHeader'

type Props = {
  caseData: CaseRow
  tasks: TaskRow[]
  heirs: HeirRow[]
  properties: RealEstatePropertyRow[]
  kosekiRequests?: KosekiRequestRow[]
  contractDocuments?: ContractDocumentRow[]
  onRefresh?: () => void
}

// 作成した書類の一覧は「案件フォルダ」タブの AI作成 サブタブに集約したため、
// このタブは「書類作成（生成）」のみを担当する。
export default function DocumentCreateTab({ caseData, tasks, heirs, properties, kosekiRequests = [], contractDocuments = [], onRefresh }: Props) {
  return (
    <div className="space-y-3.5">
      <TabHeader title="書類作成" description="戸籍請求書・委任状・契約書・領収書など、自社で作る書類をここで作れます。作った書類は「案件フォルダ」のAI作成タブに入ります。" />
      <DocumentGenerators
        caseData={caseData}
        tasks={tasks}
        heirs={heirs}
        properties={properties}
        kosekiRequests={kosekiRequests}
        contractDocuments={contractDocuments}
        onGenerated={onRefresh}
      />
    </div>
  )
}
