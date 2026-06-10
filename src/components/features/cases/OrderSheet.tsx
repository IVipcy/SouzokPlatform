'use client'

import { useState } from 'react'
import { CheckCircle2, FileSpreadsheet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import ClientInfoTab from './ClientInfoTab'
import DeceasedTab from './DeceasedTab'
import AssetsTab from './AssetsTab'
import ReferralTab from './ReferralTab'
import DivisionTab from './DivisionTab'
import ContractTab from './ContractTab'
import type {
  CaseRow, CaseReferralRow, HeirRow, RealEstatePropertyRow, FinancialAssetRow,
  DivisionDetailRow, ExpenseRow, TaskRow, ClientCommunicationRow,
} from '@/types'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  patchClient: (patch: Record<string, unknown>) => Promise<void>
  onRefresh: () => void
  heirs: HeirRow[]
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  divisionDetails: DivisionDetailRow[]
  expenses: ExpenseRow[]
  tasks: TaskRow[]
  clientCommunications: ClientCommunicationRow[]
  referrals: CaseReferralRow[]
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
  heirs, properties, financialAssets, divisionDetails, expenses, tasks, clientCommunications, referrals,
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

      <OSSection title="依頼者情報">
        <ClientInfoTab caseData={caseData} clientCommunications={clientCommunications} patchCase={patchCase} patchClient={patchClient} onRefresh={onRefresh} orderSheetMode />
      </OSSection>

      <OSSection title="相続人調査">
        <DeceasedTab caseData={caseData} heirs={heirs} onRefresh={onRefresh} patchCase={patchCase} />
      </OSSection>

      <OSSection title="財産調査">
        <AssetsTab caseData={caseData} properties={properties} financialAssets={financialAssets} onRefresh={onRefresh} patchCase={patchCase} />
      </OSSection>

      <OSSection title="他事業者紹介">
        <ReferralTab caseData={caseData} patchCase={patchCase} referrals={referrals} onRefresh={onRefresh} />
      </OSSection>

      <OSSection title="遺産分割">
        <DivisionTab caseData={caseData} divisionDetails={divisionDetails} onRefresh={onRefresh} patchCase={patchCase} mode="division" />
      </OSSection>

      <OSSection title="遺言">
        <DivisionTab caseData={caseData} divisionDetails={divisionDetails} onRefresh={onRefresh} patchCase={patchCase} mode="will" />
      </OSSection>

      <OSSection title="相続登記">
        <OSPlaceholder note="項目は今後ヒアリングのうえ追加予定です。" />
      </OSSection>

      <OSSection title="解約等（銀行・証券・自動車）">
        <OSPlaceholder note="項目は今後ヒアリングのうえ追加予定です。" />
      </OSSection>

      <OSSection title="契約・報酬・請求">
        <ContractTab caseData={caseData} expenses={expenses} tasks={tasks} onRefresh={onRefresh} patchCase={patchCase} />
      </OSSection>
    </div>
  )
}

// セクション見出し（縦積みの区切り）
function OSSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block w-1 h-5 bg-brand-600 rounded-full" />
        <h3 className="text-[14px] font-bold text-gray-900">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function OSPlaceholder({ note }: { note: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-8 text-center text-[13px] text-gray-400">
      {note}
    </div>
  )
}
