'use client'

import { useState } from 'react'
import {
  Section, SectionHeading, FieldGrid, InlineSelect, InlineEdit, InlineDate, InlineCheckbox, InlineTextarea,
} from '@/components/ui/InlineFields'
import {
  FINANCIAL_SURVEY_START_CONDITIONS, INVESTIGATION_DOCUMENTS,
} from '@/lib/constants'
import { SubTabs } from '@/components/ui/SubTabs'
import RealEstateTable from './RealEstateTable'
import FinancialAssetsTable from './FinancialAssetsTable'
import FinancialSection from './FinancialSection'
import RealEstateSection from './RealEstateSection'
import InventoryTab from './InventoryTab'
import ProgressSummary from './ProgressSummary'
import TabHeader from './TabHeader'
import { WorkContentField } from './WorkContentField'
import TabTasksSection from './TabTasksSection'
import { toReadinessReceipts } from '@/lib/taskReadiness'
import type { CaseRow, RealEstatePropertyRow, FinancialAssetRow, ContractDocumentRow, RealEstateAcquisitionRow, TaskRow, AssetInventoryRow } from '@/types'
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
  // 財産目録（migration 143）
  assetInventory?: AssetInventoryRow[]
  // 受信簿＋タスク（金融資産の「関連タスク」リンク用）
  documentReceipts?: TimelineReceipt[]
  tasks?: TaskRow[]
}

/**
 * 財産調査タブ
 *   財産調査（調査条件・財産目録）／不動産（表）／金融機関（表）／生命保険提案
 *   不動産・金融機関は表形式で行追加できる（RealEstateTable / FinancialAssetsTable）。
 */
const MAIN_TABS_FULL: { key: string; label: string }[] = [
  { key: 'conditions', label: '財産調査条件' },
  { key: 'targets', label: '調査対象' },
  { key: 'inventory', label: '財産目録' },
]
// オーダーシートは調査前の設計情報のみ。財産目録（調査後の集計）はOSでは出さない。
const MAIN_TABS_OS = MAIN_TABS_FULL.filter(t => t.key !== 'inventory')

const ASSET_SUBTABS: { key: string; label: string }[] = [
  { key: 'realestate', label: '不動産' },
  { key: 'deposit', label: '預金' },
  { key: 'securities', label: '証券' },
  { key: 'trust', label: '信託' },
  { key: 'insurance', label: '生命保険' },
]

export default function AssetsTab({ caseData, properties, financialAssets, assetInventory = [], onRefresh, patchCase, orderSheetMode = false, contractDocuments = [], acquisitions = [], documentReceipts = [], tasks = [] }: Props) {
  const save = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }
  const MAIN_TABS = orderSheetMode ? MAIN_TABS_OS : MAIN_TABS_FULL
  const [mainTab, setMainTab] = useState('conditions')
  const [sub, setSub] = useState('realestate')

  // 契約時受領の書類を各表の先頭に取り込む。区分=金融/不動産は確実に振り分け。
  // 旧データ（区分=財産）は名称キーワードでフォールバック振り分け。
  const RE_KW = ['不動産', '権利証', '固定資産', '登記', '公図']
  const isRE = (d: ContractDocumentRow) => RE_KW.some(k => (d.name ?? '').includes(k))
  const reContractDocs = contractDocuments.filter(d => d.category === '不動産' || (d.category === '財産' && isRE(d)))
  const finContractDocs = contractDocuments.filter(d => d.category === '金融' || (d.category === '財産' && !isRE(d)))

  return (
    <div className="space-y-3.5">
      {!orderSheetMode && <TabHeader title="財産調査" description="不動産・預貯金・有価証券・保険など財産の調査と取得資料の管理" />}
      {!orderSheetMode && (
        <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-3">
          <WorkContentField caseData={caseData} gyomu="assets" patchCase={patchCase} label="作業内容（フリー・オーダーシートと共有）" />
        </div>
      )}
      {!orderSheetMode && (
        <TabTasksSection
          gyomus={['金融資産', '不動産', '目録']}
          tasks={tasks}
          receipts={toReadinessReceipts(documentReceipts)}
        />
      )}

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
          </FieldGrid>
        </Section>
      </div>

      {/* 調査対象タブ（不動産 / 預金 / 証券 / 信託 / 生命保険）。
          切替時にアンマウントすると入力中の表が古いpropsで作り直され消えて見えるため、
          各パネルは常時マウントしたまま非表示(hidden)で切り替える。 */}
      <div className={mainTab === 'targets' ? 'space-y-3.5' : 'hidden'}>
        <SubTabs tabs={ASSET_SUBTABS} active={sub} onChange={setSub} />

        <div className={sub === 'realestate' ? 'space-y-4' : 'hidden'}>
          {orderSheetMode ? (
            // オーダーシート（調査前）＝どこに物件があるかのヒアリングまで。市区町村を入力。
            <div>
              <SectionHeading title="物件一覧（どこに物件があるか／市区町村を入力）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <RealEstateTable caseId={caseData.id} properties={properties} onRefresh={onRefresh} orderSheetMode />
            </div>
          ) : (
            // 案件詳細（実務）＝市区町村単位のサブタブ＋TOP集計
            <RealEstateSection
              caseId={caseData.id}
              evalMethod={caseData.real_estate_evaluation_method}
              onSaveEvalMethod={v => save('real_estate_evaluation_method', v)}
              properties={properties}
              acquisitions={acquisitions}
              onRefresh={onRefresh}
              receipts={documentReceipts}
              tasks={tasks}
              contractDocs={reContractDocs}
            />
          )}
        </div>
        <div className={sub === 'deposit' ? 'space-y-3' : 'hidden'}>
          {orderSheetMode ? (
            <>
              <SectionHeading title="預金口座（金融機関名を入力）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <FinancialAssetsTable caseId={caseData.id} kind="預貯金" assets={financialAssets} onRefresh={onRefresh} progressMode={false} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} contractDocs={finContractDocs} />
            </>
          ) : (
            <FinancialSection caseId={caseData.id} kind="預貯金" scopePrefix="asset_deposit" assets={financialAssets} onRefresh={onRefresh} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} contractDocs={finContractDocs} />
          )}
        </div>
        <div className={sub === 'securities' ? 'space-y-3' : 'hidden'}>
          {orderSheetMode ? (
            <>
              <SectionHeading title="証券口座（証券会社名を入力）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <FinancialAssetsTable caseId={caseData.id} kind="証券" assets={financialAssets} onRefresh={onRefresh} progressMode={false} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} />
            </>
          ) : (
            <FinancialSection caseId={caseData.id} kind="証券" scopePrefix="asset_securities" assets={financialAssets} onRefresh={onRefresh} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} />
          )}
        </div>
        <div className={sub === 'trust' ? 'space-y-3' : 'hidden'}>
          {orderSheetMode ? (
            <>
              <SectionHeading title="信託口座（信託銀行名を入力）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <FinancialAssetsTable caseId={caseData.id} kind="信託銀行" assets={financialAssets} onRefresh={onRefresh} progressMode={false} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} />
            </>
          ) : (
            <FinancialSection caseId={caseData.id} kind="信託銀行" scopePrefix="asset_trust" assets={financialAssets} onRefresh={onRefresh} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} />
          )}
        </div>
        <div className={sub === 'insurance' ? 'space-y-3' : 'hidden'}>
          {!orderSheetMode && <ProgressSummary caseId={caseData.id} scopeKey="asset_insurance" title="進捗/結果（生命保険）" />}
          <FieldGrid>
            <InlineEdit label="保険会社名" value={caseData.life_insurance_company} onSave={v => save('life_insurance_company', v)} />
            <InlineCheckbox label="生命保険協会照会" value={caseData.life_insurance_inquiry} onSave={v => save('life_insurance_inquiry', v)} />
            <InlineTextarea label="照会結果備考" value={caseData.life_insurance_inquiry_notes} onSave={v => save('life_insurance_inquiry_notes', v)} fullWidth />
          </FieldGrid>
        </div>
        {/* 契約時受領の財産書類は不動産/金融の各表の先頭に「契約時受領」として取り込み表示（二重登録防止）。 */}
      </div>

      {/* 財産目録タブ（オーダーシートでは非表示） */}
      <div className={mainTab === 'inventory' && !orderSheetMode ? '' : 'hidden'}>
        <Section title="財産目録（協議書・精算書へ反映）">
          <InventoryTab caseId={caseData.id} rows={assetInventory} financialAssets={financialAssets} properties={properties} onRefresh={onRefresh} />
        </Section>
      </div>
    </div>
  )
}
