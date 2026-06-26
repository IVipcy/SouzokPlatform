'use client'

import { useState } from 'react'
import {
  Section, SectionHeading, FieldGrid, InlineSelect, InlineMultiSelect, InlineEdit, InlineDate, InlineCheckbox, InlineTextarea,
} from '@/components/ui/InlineFields'
import {
  FINANCIAL_SURVEY_START_CONDITIONS, INVESTIGATION_DOCUMENTS, INVENTORY_CATEGORIES, REAL_ESTATE_EVAL_METHODS,
} from '@/lib/constants'
import { SubTabs } from '@/components/ui/SubTabs'
import RealEstateTable from './RealEstateTable'
import RealEstateAcquisitionsTable from './RealEstateAcquisitionsTable'
import FinancialAssetsTable from './FinancialAssetsTable'
import TabHeader from './TabHeader'
import type { CaseRow, RealEstatePropertyRow, FinancialAssetRow, ContractDocumentRow, RealEstateAcquisitionRow, TaskRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Props = {
  caseData: CaseRow
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  // オーダーシート埋め込み時は金融機関表の「請求日・到着日」を出さない
  orderSheetMode?: boolean
  // 契約残手続きの書類（区分=財産 を「契約時受領」として表示）
  contractDocuments?: ContractDocumentRow[]
  // 不動産の取得資料管理
  acquisitions?: RealEstateAcquisitionRow[]
  // 受信簿＋タスク（金融資産の「関連タスク」リンク用）
  documentReceipts?: TimelineReceipt[]
  tasks?: TaskRow[]
}

/**
 * 財産調査タブ
 *   財産調査（調査条件・財産目録）／不動産（表）／金融機関（表）／生命保険提案
 *   不動産・金融機関は表形式で行追加できる（RealEstateTable / FinancialAssetsTable）。
 */
const MAIN_TABS: { key: string; label: string }[] = [
  { key: 'conditions', label: '財産調査条件' },
  { key: 'targets', label: '調査対象' },
]

const ASSET_SUBTABS: { key: string; label: string }[] = [
  { key: 'realestate', label: '不動産' },
  { key: 'deposit', label: '預金' },
  { key: 'securities', label: '証券' },
  { key: 'trust', label: '信託' },
  { key: 'insurance', label: '生命保険' },
]

export default function AssetsTab({ caseData, properties, financialAssets, onRefresh, patchCase, orderSheetMode = false, contractDocuments = [], acquisitions = [], documentReceipts = [], tasks = [] }: Props) {
  const save = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }
  const progressMode = !orderSheetMode
  const [mainTab, setMainTab] = useState('conditions')
  const [sub, setSub] = useState('realestate')

  // 財産目録の記載範囲は、受注区分に紐づく業務で「目録（財産目録）」を選択した案件のみ表示。
  // 受注区分（service_category）未設定の旧案件は後方互換で常に表示。
  const selectedGyomu = [...new Set((caseData.intake_roles ?? []).map(r => r.gyomu).filter(Boolean))]
  const showInventoryRange = !caseData.service_category || selectedGyomu.includes('目録')

  // 契約時受領の書類を各表の先頭に取り込む。区分=金融/不動産は確実に振り分け。
  // 旧データ（区分=財産）は名称キーワードでフォールバック振り分け。
  const RE_KW = ['不動産', '権利証', '固定資産', '登記', '公図']
  const isRE = (d: ContractDocumentRow) => RE_KW.some(k => (d.name ?? '').includes(k))
  const reContractDocs = contractDocuments.filter(d => d.category === '不動産' || (d.category === '財産' && isRE(d)))
  const finContractDocs = contractDocuments.filter(d => d.category === '金融' || (d.category === '財産' && !isRE(d)))

  return (
    <div className="space-y-3.5">
      {!orderSheetMode && <TabHeader title="財産調査" description="不動産・預貯金・有価証券・保険など財産の調査と取得資料の管理" />}

      {/* 財産調査条件 / 調査対象 のタブ切替 */}
      <SubTabs tabs={MAIN_TABS} active={mainTab} onChange={setMainTab} />

      {/* 財産調査条件タブ */}
      <div className={mainTab === 'conditions' ? '' : 'hidden'}>
        <Section title="財産調査条件">
          <FieldGrid>
            <InlineSelect label="財産調査開始条件" value={caseData.financial_survey_start_condition} options={[...FINANCIAL_SURVEY_START_CONDITIONS]} onSave={v => save('financial_survey_start_condition', v)} />
            <InlineDate label="財産調査禁止期間 開始日" value={caseData.financial_survey_prohibited_start} onSave={v => save('financial_survey_prohibited_start', v)} />
            <InlineDate label="財産調査禁止期間 終了日" value={caseData.financial_survey_prohibited_end} onSave={v => save('financial_survey_prohibited_end', v)} />
            <InlineEdit label="財産調査禁止理由" value={caseData.financial_survey_prohibited_reason} onSave={v => save('financial_survey_prohibited_reason', v)} />
            <InlineSelect label="財産調査使用書類" value={caseData.investigation_document} options={[...INVESTIGATION_DOCUMENTS]} onSave={v => save('investigation_document', v)} />
            <InlineSelect label="不動産の評価方法" value={caseData.real_estate_evaluation_method} options={[...REAL_ESTATE_EVAL_METHODS]} onSave={v => save('real_estate_evaluation_method', v)} />
            {showInventoryRange && (
              <InlineMultiSelect label="財産目録 記載範囲" value={caseData.inventory_categories} options={[...INVENTORY_CATEGORIES]} onSave={v => save('inventory_categories', v.length > 0 ? v : null)} fullWidth />
            )}
          </FieldGrid>
        </Section>
      </div>

      {/* 調査対象タブ（不動産 / 預金 / 証券 / 信託 / 生命保険）。
          切替時にアンマウントすると入力中の表が古いpropsで作り直され消えて見えるため、
          各パネルは常時マウントしたまま非表示(hidden)で切り替える。 */}
      <div className={mainTab === 'targets' ? 'space-y-3.5' : 'hidden'}>
        <SubTabs tabs={ASSET_SUBTABS} active={sub} onChange={setSub} />

        <div className={sub === 'realestate' ? 'space-y-4' : 'hidden'}>
          <div>
            <SectionHeading title="物件一覧（どういう物件があるか）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
            <RealEstateTable caseId={caseData.id} properties={properties} onRefresh={onRefresh} />
          </div>
          <div>
            <SectionHeading title="取得資料管理（どこに何をいつ請求し、受け取れたか）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
            <RealEstateAcquisitionsTable caseId={caseData.id} acquisitions={acquisitions} properties={properties} onRefresh={onRefresh} orderSheetMode={orderSheetMode} receipts={documentReceipts} tasks={tasks} contractDocs={reContractDocs} />
          </div>
        </div>
        <div className={sub === 'deposit' ? '' : 'hidden'}>
          <SectionHeading title="預金口座（請求・受領の管理）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
          <FinancialAssetsTable caseId={caseData.id} kind="預貯金" assets={financialAssets} onRefresh={onRefresh} progressMode={progressMode} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} contractDocs={finContractDocs} />
        </div>
        <div className={sub === 'securities' ? '' : 'hidden'}>
          <SectionHeading title="証券口座（請求・受領の管理）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
          <FinancialAssetsTable caseId={caseData.id} kind="証券" assets={financialAssets} onRefresh={onRefresh} progressMode={progressMode} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} />
        </div>
        <div className={sub === 'trust' ? '' : 'hidden'}>
          <SectionHeading title="信託口座（請求・受領の管理）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
          <FinancialAssetsTable caseId={caseData.id} kind="信託銀行" assets={financialAssets} onRefresh={onRefresh} progressMode={progressMode} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} />
        </div>
        <div className={sub === 'insurance' ? '' : 'hidden'}>
          <FieldGrid>
            <InlineEdit label="保険会社名" value={caseData.life_insurance_company} onSave={v => save('life_insurance_company', v)} />
            <InlineCheckbox label="生命保険協会照会" value={caseData.life_insurance_inquiry} onSave={v => save('life_insurance_inquiry', v)} />
            <InlineTextarea label="照会結果備考" value={caseData.life_insurance_inquiry_notes} onSave={v => save('life_insurance_inquiry_notes', v)} fullWidth />
          </FieldGrid>
        </div>
        {/* 契約時受領の財産書類は不動産/金融の各表の先頭に「契約時受領」として取り込み表示（二重登録防止）。 */}
      </div>
    </div>
  )
}
