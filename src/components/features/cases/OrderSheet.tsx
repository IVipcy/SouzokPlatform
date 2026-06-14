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
import type {
  CaseRow, CaseReferralRow, CaseClientRow, HeirRow, KosekiRequestRow, RealEstatePropertyRow, FinancialAssetRow,
  DivisionDetailRow, ExpenseRow, TaskRow, ClientCommunicationRow, ContractDocumentRow,
} from '@/types'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  patchClient: (patch: Record<string, unknown>) => Promise<void>
  onRefresh: () => void
  heirs: HeirRow[]
  kosekiRequests: KosekiRequestRow[]
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  divisionDetails: DivisionDetailRow[]
  expenses: ExpenseRow[]
  tasks: TaskRow[]
  clientCommunications: ClientCommunicationRow[]
  referrals: CaseReferralRow[]
  caseClients: CaseClientRow[]
  contractDocuments: ContractDocumentRow[]
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
  heirs, kosekiRequests, properties, financialAssets, divisionDetails, expenses, tasks, clientCommunications, referrals, caseClients, contractDocuments,
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

      <OSSection index={0} title="依頼者情報">
        <ClientInfoTab caseData={caseData} clientCommunications={clientCommunications} patchCase={patchCase} patchClient={patchClient} onRefresh={onRefresh} orderSheetMode caseClients={caseClients} />
      </OSSection>

      <OSSection index={1} title="受注内容・契約手続き">
        <OrderContentTab caseData={caseData} patchCase={patchCase} contractDocuments={contractDocuments} onRefresh={onRefresh} orderSheetMode />
      </OSSection>

      <OSSection index={2} title="相続人調査">
        <DeceasedTab caseData={caseData} heirs={heirs} kosekiRequests={kosekiRequests} onRefresh={onRefresh} patchCase={patchCase} orderSheetMode />
      </OSSection>

      <OSSection index={3} title="財産調査">
        <AssetsTab caseData={caseData} properties={properties} financialAssets={financialAssets} onRefresh={onRefresh} patchCase={patchCase} orderSheetMode />
      </OSSection>

      <OSSection index={4} title="他事業者紹介">
        <ReferralTab caseData={caseData} referrals={referrals} onRefresh={onRefresh} orderSheetMode />
      </OSSection>

      <OSSection index={5} title="遺産分割">
        <DivisionTab caseData={caseData} divisionDetails={divisionDetails} heirs={heirs} onRefresh={onRefresh} patchCase={patchCase} mode="division" />
      </OSSection>

      <OSSection index={6} title="遺言">
        <DivisionTab caseData={caseData} divisionDetails={divisionDetails} heirs={heirs} onRefresh={onRefresh} patchCase={patchCase} mode="will" />
      </OSSection>

      <OSSection index={7} title="相続登記">
        <RegistrationTab caseData={caseData} properties={properties} onRefresh={onRefresh} patchCase={patchCase} />
      </OSSection>

      <OSSection index={8} title="解約等（銀行・証券・自動車）">
        <CancellationTab financialAssets={financialAssets} onRefresh={onRefresh} />
      </OSSection>

      <OSSection index={9} title="契約・報酬・請求">
        <ContractTab caseData={caseData} expenses={expenses} tasks={tasks} onRefresh={onRefresh} patchCase={patchCase} orderSheetMode referrals={referrals} />
      </OSSection>
    </div>
  )
}

// 大セクション見出し（オーダーシートの親）。
// 子の Section（縦棒＋12.5px）と区別するため、番号バッジ＋ブランド背景帯にして一段上位に見せる。
function OSSection({ title, index, children }: { title: string; index?: number; children: React.ReactNode }) {
  const num = typeof index === 'number' ? String(index + 1).padStart(2, '0') : null
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3 bg-brand-50 border border-brand-100 border-l-[3px] border-l-brand-600 rounded-lg px-3 py-2">
        {num && (
          <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full bg-brand-600 text-white text-[11px] font-bold tabular-nums">{num}</span>
        )}
        <h2 className="text-[14px] font-bold text-brand-800 tracking-[0.02em]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

