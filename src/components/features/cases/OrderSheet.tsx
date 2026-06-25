'use client'

import { useState } from 'react'
import { CheckCircle2, FileSpreadsheet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import ClientInfoTab from './ClientInfoTab'
import OrderContentTab from './OrderContentTab'
import DeceasedTab from './DeceasedTab'
import AssetsTab from './AssetsTab'
import ReferralTab from './ReferralTab'
import CancellationTab from './CancellationTab'
import RegistrationTab from './RegistrationTab'
import DivisionTab from './DivisionTab'
import ContractTab from './ContractTab'
import PracticeProcedureTab from './PracticeProcedureTab'
import { PROCEDURE_TABS } from './practiceTabs'
import { GYOMU_TAB } from '@/lib/serviceMaster'
import type { TabKey } from './CaseTabs'
import type { ReactNode } from 'react'
import type { TimelineReceipt } from './CaseTimeline'
import type {
  CaseRow, CaseReferralRow, CaseClientRow, HeirRow, KosekiRequestRow, RealEstatePropertyRow, RealEstateAcquisitionRow, FinancialAssetRow,
  DivisionDetailRow, AgreementDispatchRow, ExpenseRow, TaskRow, ClientCommunicationRow, ContractDocumentRow, SagyoDocumentRow,
} from '@/types'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  patchClient: (patch: Record<string, unknown>) => Promise<void>
  onRefresh: () => void
  heirs: HeirRow[]
  kosekiRequests: KosekiRequestRow[]
  properties: RealEstatePropertyRow[]
  acquisitions?: RealEstateAcquisitionRow[]
  financialAssets: FinancialAssetRow[]
  divisionDetails: DivisionDetailRow[]
  agreementDispatches?: AgreementDispatchRow[]
  expenses: ExpenseRow[]
  tasks: TaskRow[]
  clientCommunications: ClientCommunicationRow[]
  referrals: CaseReferralRow[]
  caseClients: CaseClientRow[]
  contractDocuments: ContractDocumentRow[]
  sagyoDocuments?: SagyoDocumentRow[]
  receipts?: TimelineReceipt[]
}

/**
 * オーダーシート
 * 受託後に、案件の実務情報（依頼者情報・相続人調査・財産調査・他事業者紹介・遺産分割・
 * 遺言・相続登記・解約等・契約報酬請求）を1画面に縦積みして俯瞰・入力するための統合ビュー。
 * 各セクションは既存タブのコンポーネントを再利用（インライン保存）。
 * 「オーダーシートを完成」で order_sheet_completed_at をセット → 実務タブ解禁・対応中遷移が可能になる。
 */
export default function OrderSheet({
  caseData, patchCase, patchClient, onRefresh,
  heirs, kosekiRequests, properties, acquisitions = [], financialAssets, divisionDetails, agreementDispatches = [], expenses, tasks, clientCommunications, referrals, caseClients, contractDocuments,
  sagyoDocuments = [], receipts = [],
}: Props) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const completed = !!caseData.order_sheet_completed_at

  const markComplete = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('cases')
      .update({ order_sheet_completed_at: new Date().toISOString() })
      .eq('id', caseData.id)
    setSaving(false)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    showToast('オーダーシートを完成しました', 'success')
    onRefresh()
  }

  // 受注区分→選択業務 で実務セクションを出し分け（service_category 未設定の旧案件は全表示）
  const selectedGyomu = [...new Set((caseData.intake_roles ?? []).map(r => r.gyomu).filter(Boolean))]
  const allowedTabs = caseData.service_category
    ? new Set(selectedGyomu.map(g => GYOMU_TAB[g]).filter(Boolean) as TabKey[])
    : null
  const showSec = (gate?: TabKey) => !gate || !allowedTabs || allowedTabs.has(gate)

  const allOsSections: { title: string; gate?: TabKey; anchorId?: string; node: ReactNode }[] = [
    { title: '依頼者情報', node: <ClientInfoTab caseData={caseData} clientCommunications={clientCommunications} patchCase={patchCase} patchClient={patchClient} onRefresh={onRefresh} orderSheetMode caseClients={caseClients} /> },
    { title: '受注内容', node: <OrderContentTab caseData={caseData} patchCase={patchCase} /> },
    { title: '相続人調査', gate: 'deceased', node: <DeceasedTab caseData={caseData} heirs={heirs} kosekiRequests={kosekiRequests} onRefresh={onRefresh} patchCase={patchCase} orderSheetMode contractDocuments={contractDocuments} caseClients={caseClients} /> },
    { title: '財産調査', gate: 'assets', node: <AssetsTab caseData={caseData} properties={properties} acquisitions={acquisitions} financialAssets={financialAssets} onRefresh={onRefresh} patchCase={patchCase} orderSheetMode contractDocuments={contractDocuments} /> },
    { title: '他事業者紹介', anchorId: 'os-referral', node: <ReferralTab caseData={caseData} referrals={referrals} onRefresh={onRefresh} orderSheetMode /> },
    { title: '遺産分割', gate: 'division', node: <DivisionTab caseData={caseData} divisionDetails={divisionDetails} heirs={heirs} agreementDispatches={agreementDispatches} onRefresh={onRefresh} patchCase={patchCase} mode="division" /> },
    { title: '遺言', gate: 'will', node: <DivisionTab caseData={caseData} divisionDetails={divisionDetails} heirs={heirs} onRefresh={onRefresh} patchCase={patchCase} mode="will" /> },
    { title: '相続登記', gate: 'registration', node: <RegistrationTab caseData={caseData} properties={properties} onRefresh={onRefresh} patchCase={patchCase} contractDocuments={contractDocuments} /> },
    { title: '解約等（銀行・証券・自動車）', gate: 'cancellation', node: <CancellationTab financialAssets={financialAssets} onRefresh={onRefresh} receipts={receipts} /> },
    ...PROCEDURE_TABS.map(p => ({
      title: p.title,
      gate: p.tab,
      node: <PracticeProcedureTab caseData={caseData} patchCase={patchCase} gyomu={p.gyomu} title={p.title} description={p.description} court={p.court} trust={p.trust} mediation={p.mediation} heirs={heirs} tasks={tasks} sagyoDocuments={sagyoDocuments} receipts={receipts} onRefresh={onRefresh} embedded />,
    })),
    { title: '契約・報酬・請求', node: <ContractTab caseData={caseData} expenses={expenses} tasks={tasks} onRefresh={onRefresh} patchCase={patchCase} orderSheetMode referrals={referrals} /> },
  ]
  const osSections = allOsSections.filter(s => showSec(s.gate))

  return (
    <div className="space-y-5">
      {/* ヘッダー＋完成アクション */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-3">
        <FileSpreadsheet className="w-5 h-5 text-brand-600" strokeWidth={2} />
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-bold text-gray-900">オーダーシート</h2>
          <p className="text-[12px] text-gray-500">
            受託案件の概要を1枚で把握・入力します。
          </p>
        </div>
        {completed ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
            <CheckCircle2 className="w-4 h-4" />
            完成済（{caseData.order_sheet_completed_at?.slice(0, 10)}）
          </span>
        ) : (
          <button
            type="button"
            onClick={markComplete}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />
            {saving ? '保存中...' : 'オーダーシートを完成'}
          </button>
        )}
      </div>

      {osSections.map((s) => (
        <OSSection key={s.title} title={s.title} id={s.anchorId}>{s.node}</OSSection>
      ))}
    </div>
  )
}

// 大セクション見出し（オーダーシートの親）。子の Section（カード）を束ねる上位の帯。番号は付けない。
function OSSection({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-2.5 mb-3 bg-brand-100/60 border-l-[3px] border-l-brand-600 rounded-r px-3.5 py-2">
        <h2 className="text-[14px] font-bold text-brand-800 tracking-[0.02em]">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

