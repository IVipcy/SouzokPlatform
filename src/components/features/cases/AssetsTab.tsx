'use client'

import { useState } from 'react'
import {
  Section, FieldGrid, InlineSelect, InlineMultiSelect, InlineEdit, InlineCurrency, InlineCheckbox, InlineTextarea,
} from '@/components/ui/InlineFields'
import {
  LIFE_INSURANCE_PROPOSAL_OPTIONS, LIFE_INSURANCE_TYPES,
  FINANCIAL_SURVEY_START_CONDITIONS, INVESTIGATION_DOCUMENTS, INVENTORY_CATEGORIES,
} from '@/lib/constants'
import { SubTabs } from '@/components/ui/SubTabs'
import RealEstateTable from './RealEstateTable'
import FinancialAssetsTable from './FinancialAssetsTable'
import type { CaseRow, RealEstatePropertyRow, FinancialAssetRow } from '@/types'

type Props = {
  caseData: CaseRow
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  // オーダーシート埋め込み時は金融機関表の「請求日・到着日」を出さない
  orderSheetMode?: boolean
}

/**
 * 財産調査タブ
 *   財産調査（調査条件・財産目録）／不動産（表）／金融機関（表）／生命保険提案
 *   不動産・金融機関は表形式で行追加できる（RealEstateTable / FinancialAssetsTable）。
 */
const ASSET_SUBTABS: { key: string; label: string }[] = [
  { key: 'realestate', label: '不動産' },
  { key: 'deposit', label: '預金' },
  { key: 'securities', label: '証券' },
  { key: 'trust', label: '信託' },
  { key: 'insurance', label: '生命保険' },
]

export default function AssetsTab({ caseData, properties, financialAssets, onRefresh, patchCase, orderSheetMode = false }: Props) {
  const save = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }
  const progressMode = !orderSheetMode
  const [sub, setSub] = useState('realestate')

  return (
    <div className="space-y-3.5">
      {/* 財産調査全般（固定表示） */}
      <Section title="調査条件・財産目録">
        <FieldGrid>
          <InlineSelect label="財産調査開始条件" value={caseData.financial_survey_start_condition} options={[...FINANCIAL_SURVEY_START_CONDITIONS]} onSave={v => save('financial_survey_start_condition', v)} />
          <InlineEdit label="財産調査禁止期間" value={caseData.financial_survey_prohibited_period} onSave={v => save('financial_survey_prohibited_period', v)} />
          <InlineEdit label="財産調査禁止理由" value={caseData.financial_survey_prohibited_reason} onSave={v => save('financial_survey_prohibited_reason', v)} />
          <InlineSelect label="財産調査使用書類" value={caseData.investigation_document} options={[...INVESTIGATION_DOCUMENTS]} onSave={v => save('investigation_document', v)} />
          <InlineMultiSelect label="財産目録 記載範囲" value={caseData.inventory_categories} options={[...INVENTORY_CATEGORIES]} onSave={v => save('inventory_categories', v.length > 0 ? v : null)} fullWidth />
        </FieldGrid>
      </Section>

      {/* 子タブ（不動産 / 預金 / 証券 / 信託 / 生命保険） */}
      <SubTabs tabs={ASSET_SUBTABS} active={sub} onChange={setSub} />

      {sub === 'realestate' && (
        <RealEstateTable caseId={caseData.id} properties={properties} onRefresh={onRefresh} />
      )}
      {sub === 'deposit' && (
        <FinancialAssetsTable caseId={caseData.id} kind="預貯金" assets={financialAssets} onRefresh={onRefresh} progressMode={progressMode} />
      )}
      {sub === 'securities' && (
        <FinancialAssetsTable caseId={caseData.id} kind="証券" assets={financialAssets} onRefresh={onRefresh} progressMode={progressMode} />
      )}
      {sub === 'trust' && (
        <FinancialAssetsTable caseId={caseData.id} kind="信託銀行" assets={financialAssets} onRefresh={onRefresh} progressMode={progressMode} />
      )}
      {sub === 'insurance' && (
        <FieldGrid>
          <InlineSelect label="生命保険提案有無" value={caseData.life_insurance_proposal} options={[...LIFE_INSURANCE_PROPOSAL_OPTIONS]} onSave={v => save('life_insurance_proposal', v)} />
          <InlineEdit label="保険会社名" value={caseData.life_insurance_company} onSave={v => save('life_insurance_company', v)} />
          <InlineSelect label="保険種類" value={caseData.life_insurance_type} options={[...LIFE_INSURANCE_TYPES]} onSave={v => save('life_insurance_type', v)} />
          <InlineCurrency label="生命保険金額" value={caseData.life_insurance_amount} onSave={v => save('life_insurance_amount', v)} />
          <InlineCheckbox label="生命保険協会照会" value={caseData.life_insurance_inquiry} onSave={v => save('life_insurance_inquiry', v)} />
          <InlineTextarea label="照会結果備考" value={caseData.life_insurance_inquiry_notes} onSave={v => save('life_insurance_inquiry_notes', v)} fullWidth />
        </FieldGrid>
      )}
    </div>
  )
}
