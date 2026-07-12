'use client'

// 金融資産（実務タブ）：預金/証券/信託。口座を1つの表で全件表示（横スクロールで全項目）。
// 財産目録へ反映は確定済のみ。残高の入力・確定・受信は表の各行で行う。

import { SectionHeading } from '@/components/ui/InlineFields'
import ProgressSummary from './ProgressSummary'
import FinancialAssetsTable from './FinancialAssetsTable'
import type { FinancialAssetRow, TaskRow, ContractDocumentRow, CaseRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Kind = '預貯金' | '証券' | '信託銀行'

type Props = {
  caseId: string
  kind: Kind
  scopePrefix: string                 // 進捗サマリーの scope_key 接頭辞（例: asset_deposit）
  assets: FinancialAssetRow[]
  onRefresh?: () => void
  roles?: CaseRow['intake_roles']
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  contractDocs?: ContractDocumentRow[]
}

export default function FinancialSection({ caseId, kind, scopePrefix, assets, onRefresh, roles = [], receipts = [], tasks = [], contractDocs = [] }: Props) {
  return (
    <div className="space-y-3.5">
      <ProgressSummary caseId={caseId} scopeKey={`${scopePrefix}_all`} title={`進捗/結果（${kind}）`} />
      <div className="bg-white border border-gray-200 rounded-lg p-3.5">
        <SectionHeading title="口座一覧（残高の入力・確定／横スクロールで全項目）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
        <FinancialAssetsTable caseId={caseId} kind={kind} assets={assets} onRefresh={onRefresh} progressMode roles={roles} receipts={receipts} tasks={tasks} contractDocs={contractDocs} showConfirmed />
      </div>
      <p className="text-[11px] text-gray-400">財産目録へ反映されるのは「確定済」の口座のみです。</p>
    </div>
  )
}
