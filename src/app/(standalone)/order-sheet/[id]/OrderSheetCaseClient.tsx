'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import OrderSheet from '@/components/features/cases/OrderSheet'
import type { TimelineReceipt } from '@/components/features/cases/CaseTimeline'
import type {
  CaseRow, HeirRow, KosekiRequestRow, RealEstatePropertyRow, RealEstateAcquisitionRow, FinancialAssetRow,
  DivisionDetailRow, AgreementDispatchRow, ExpenseRow, TaskRow, ClientCommunicationRow, CaseReferralRow,
  CaseClientRow, ContractDocumentRow, SagyoDocumentRow,
} from '@/types'

type Props = {
  caseData: CaseRow
  heirs: HeirRow[]
  kosekiRequests: KosekiRequestRow[]
  properties: RealEstatePropertyRow[]
  acquisitions: RealEstateAcquisitionRow[]
  financialAssets: FinancialAssetRow[]
  divisionDetails: DivisionDetailRow[]
  agreementDispatches: AgreementDispatchRow[]
  expenses: ExpenseRow[]
  tasks: TaskRow[]
  clientCommunications: ClientCommunicationRow[]
  referrals: CaseReferralRow[]
  caseClients: CaseClientRow[]
  contractDocuments: ContractDocumentRow[]
  sagyoDocuments: SagyoDocumentRow[]
  receipts: TimelineReceipt[]
}

// オーダーシート入力アプリの案件画面。既存 OrderSheet をそのまま使い、保存はインライン（自動保存）。
// 各項目は入力時点で保存されるため、途中でアプリを閉じても内容は保存される。
export default function OrderSheetCaseClient({ caseData, ...rest }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [caseState, setCaseState] = useState<CaseRow>(caseData)

  const patchCase = async (patch: Partial<CaseRow>) => {
    setCaseState(prev => ({ ...prev, ...patch }))
    const { error } = await supabase.from('cases').update(patch).eq('id', caseData.id)
    if (error) throw new Error(error.message)
  }

  const patchClient = async (patch: Record<string, unknown>) => {
    if (!caseData.client_id) return
    // 楽観更新：caseState.clients にも反映する。router.refresh() は client state を保持するため
    // caseState を更新しないと、住所取得など「プログラムで入れた値」が画面に反映されずブランクに見える。
    const prev = caseState.clients
    setCaseState(c => ({ ...c, clients: c.clients ? { ...c.clients, ...patch } as typeof c.clients : c.clients }))
    const { error } = await supabase.from('clients').update(patch).eq('id', caseData.client_id)
    if (error) { setCaseState(c => ({ ...c, clients: prev })); throw new Error(error.message) }
  }

  const onRefresh = () => router.refresh()

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <Link href="/order-sheet" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-brand-700">
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />一覧
        </Link>
        <span className="text-[11px] font-mono text-gray-400">{caseState.case_number}</span>
      </div>

      <OrderSheet
        caseData={caseState}
        patchCase={patchCase}
        patchClient={patchClient}
        onRefresh={onRefresh}
        guided
        {...rest}
      />
    </div>
  )
}
