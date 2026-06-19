'use client'

import { useState } from 'react'
import {
  Section, FieldGrid, InlineSelect, InlineMultiSelect, InlineEdit, InlineDate, InlineCurrency, InlineCheckbox, InlineTextarea,
} from '@/components/ui/InlineFields'
import {
  LIFE_INSURANCE_PROPOSAL_OPTIONS, LIFE_INSURANCE_TYPES,
  FINANCIAL_SURVEY_START_CONDITIONS, INVESTIGATION_DOCUMENTS, INVENTORY_CATEGORIES,
} from '@/lib/constants'
import { SubTabs } from '@/components/ui/SubTabs'
import RealEstateTable from './RealEstateTable'
import RealEstateAcquisitionsTable from './RealEstateAcquisitionsTable'
import FinancialAssetsTable from './FinancialAssetsTable'
import ContractReceivedDocs from './ContractReceivedDocs'
import type { CaseRow, RealEstatePropertyRow, FinancialAssetRow, ContractDocumentRow, RealEstateAcquisitionRow } from '@/types'

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

export default function AssetsTab({ caseData, properties, financialAssets, onRefresh, patchCase, orderSheetMode = false, contractDocuments = [], acquisitions = [] }: Props) {
  const save = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }
  const progressMode = !orderSheetMode
  const [mainTab, setMainTab] = useState('conditions')
  const [sub, setSub] = useState('realestate')

  return (
    <div className="space-y-3.5">
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
            <InlineMultiSelect label="財産目録 記載範囲" value={caseData.inventory_categories} options={[...INVENTORY_CATEGORIES]} onSave={v => save('inventory_categories', v.length > 0 ? v : null)} fullWidth />
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
            <div className="text-[12px] font-bold text-gray-500 mb-1.5">物件一覧（どういう物件があるか）</div>
            <RealEstateTable caseId={caseData.id} properties={properties} onRefresh={onRefresh} />
          </div>
          <div>
            <div className="text-[12px] font-bold text-gray-500 mb-1.5">取得資料管理（どこに何をいつ請求し、受け取れたか）</div>
            <RealEstateAcquisitionsTable caseId={caseData.id} acquisitions={acquisitions} properties={properties} onRefresh={onRefresh} orderSheetMode={orderSheetMode} />
          </div>
        </div>
        <div className={sub === 'deposit' ? '' : 'hidden'}>
          <FinancialAssetsTable caseId={caseData.id} kind="預貯金" assets={financialAssets} onRefresh={onRefresh} progressMode={progressMode} roles={caseData.intake_roles ?? []} />
        </div>
        <div className={sub === 'securities' ? '' : 'hidden'}>
          <FinancialAssetsTable caseId={caseData.id} kind="証券" assets={financialAssets} onRefresh={onRefresh} progressMode={progressMode} roles={caseData.intake_roles ?? []} />
        </div>
        <div className={sub === 'trust' ? '' : 'hidden'}>
          <FinancialAssetsTable caseId={caseData.id} kind="信託銀行" assets={financialAssets} onRefresh={onRefresh} progressMode={progressMode} roles={caseData.intake_roles ?? []} />
        </div>
        <div className={sub === 'insurance' ? '' : 'hidden'}>
          <FieldGrid>
            <InlineSelect label="生命保険提案有無" value={caseData.life_insurance_proposal} options={[...LIFE_INSURANCE_PROPOSAL_OPTIONS]} onSave={v => save('life_insurance_proposal', v)} />
            <InlineEdit label="保険会社名" value={caseData.life_insurance_company} onSave={v => save('life_insurance_company', v)} />
            <InlineSelect label="保険種類" value={caseData.life_insurance_type} options={[...LIFE_INSURANCE_TYPES]} onSave={v => save('life_insurance_type', v)} />
            <InlineCurrency label="生命保険金額" value={caseData.life_insurance_amount} onSave={v => save('life_insurance_amount', v)} />
            <InlineCheckbox label="生命保険協会照会" value={caseData.life_insurance_inquiry} onSave={v => save('life_insurance_inquiry', v)} />
            <InlineTextarea label="照会結果備考" value={caseData.life_insurance_inquiry_notes} onSave={v => save('life_insurance_inquiry_notes', v)} fullWidth />
          </FieldGrid>
        </div>

        {/* 契約時にお客様から受領した財産関係書類（区分=財産）。調査対象の表の下に表示。 */}
        <ContractReceivedDocs documents={contractDocuments} category="財産" title="契約時にお客様から受領した財産関係書類" />
      </div>
    </div>
  )
}
