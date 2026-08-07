'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Section, SectionHeading, FieldGrid, InlineSelect, InlineEdit, InlineCheckbox, InlineTextarea,
} from '@/components/ui/InlineFields'
import { municipalityOf } from './RealEstateSection'
import {
  FINANCIAL_SURVEY_START_CONDITIONS, INVESTIGATION_DOCUMENTS, OTHER_ASSET_KINDS, isNegativeKind,
} from '@/lib/constants'
import { SubTabs } from '@/components/ui/SubTabs'
import RealEstateTable from './RealEstateTable'
import RealEstateOrderBlocks from './RealEstateOrderBlocks'
import FinancialAssetsTable from './FinancialAssetsTable'
import FinancialSection from './FinancialSection'
import RealEstateSection from './RealEstateSection'
import InventoryTab from './InventoryTab'
import OtherAssetsTable from './OtherAssetsTable'
import ProgressSummary from './ProgressSummary'
import TabHeader from './TabHeader'
import { WorkContentField } from './WorkContentField'
import TabTasksSection from './TabTasksSection'
import { toReadinessReceipts } from '@/lib/taskReadiness'
import type { CaseRow, RealEstatePropertyRow, FinancialAssetRow, ContractDocumentRow, RealEstateAcquisitionRow, TaskRow, AssetInventoryRow, CaseOtherAssetRow, HeirRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Props = {
  caseData: CaseRow
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  // オーダーシート埋め込み時は金融機関表の「請求日・到着日」を出さない
  orderSheetMode?: boolean
  // オーダーシートで 財産調査(不動産)/(金融資産) に分割表示するとき、表示する種別を指定
  //   ['realestate']            → 不動産のみ
  //   ['deposit','securities','trust','insurance'] → 金融資産(預金・証券・信託・生命保険)
  //   未指定=全種別（従来動作）
  showKinds?: Array<'realestate' | 'deposit' | 'securities' | 'trust' | 'insurance'>
  // 契約残手続きの書類（区分=財産 を「契約時受領」として表示）
  contractDocuments?: ContractDocumentRow[]
  // 不動産の取得資料管理
  acquisitions?: RealEstateAcquisitionRow[]
  // 財産目録（migration 143）
  assetInventory?: AssetInventoryRow[]
  // 受信簿＋タスク（金融資産の「関連タスク」リンク用）
  documentReceipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  // その他財産／相続債務／その他費用（migration 224）
  otherAssets?: CaseOtherAssetRow[]
  // その他費用の立替者候補
  heirs?: HeirRow[]
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
// 案件詳細では「財産目録」も種別と同じタブ列に並べる（第1層タブを廃止して3層→2層）。
// 財産調査条件（案件で1つ）は上部の折りたたみ小セクションへ。
// その他財産／相続債務／その他費用（case_other_assets）。財産目録の手前に並べる。
// 相続債務・その他費用はマイナス計上なので、タブ側でも色で区別する。
const OTHER_SUBTABS = OTHER_ASSET_KINDS.map(k => ({ key: `other:${k.kind}`, label: k.kind }))
const SUBTABS_FULL: { key: string; label: string }[] = [
  ...ASSET_SUBTABS, ...OTHER_SUBTABS, { key: 'inventory', label: '財産目録' },
]

export default function AssetsTab({ caseData, properties, financialAssets, assetInventory = [], onRefresh, patchCase, orderSheetMode = false, showKinds, contractDocuments = [], acquisitions = [], documentReceipts = [], tasks = [], otherAssets = [], heirs = [] }: Props) {
  // 表示する種別のフィルタ (orderSheetMode の分割表示時のみ使用)
  const kindOn = (k: 'realestate' | 'deposit' | 'securities' | 'trust' | 'insurance') => !showKinds || showKinds.includes(k)
  const save = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  // 財産調査条件（案件で1つの設定）。既定は折りたたみ。たたんでも現在値をサマリー表示。
  // 実務モードでは 不動産セクションの「一覧(TOP)」にだけ差し込む（各市区町村では出さない）。
  const surveyConditions = (
    <details className="group rounded-lg border border-gray-200 bg-white">
      <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer list-none select-none">
        <span className="text-gray-400 text-[12px] leading-none transition-transform group-open:rotate-90">▸</span>
        <span className="text-[13px] font-semibold text-brand-800">財産調査条件</span>
        <span className="ml-auto text-[11px] text-gray-400 truncate group-open:hidden">
          {caseData.financial_survey_start_condition || '開始条件 未設定'} ／ {caseData.investigation_document || '使用書類 未設定'}
        </span>
      </summary>
      <div className="px-3 pb-3 border-t border-gray-100 pt-2.5">
        <FieldGrid>
          <InlineSelect label="財産調査開始条件" value={caseData.financial_survey_start_condition} options={[...FINANCIAL_SURVEY_START_CONDITIONS]} onSave={v => save('financial_survey_start_condition', v)} />
          <InlineSelect label="財産調査使用書類" value={caseData.investigation_document} options={[...INVESTIGATION_DOCUMENTS]} onSave={v => save('investigation_document', v)} />
        </FieldGrid>
      </div>
    </details>
  )
  // タスク詳細から ?focus=市区町村/金融機関 で来たとき、該当サブタブを初期選択（不動産/預金/証券/信託）。
  const searchParams = useSearchParams()
  const focus = searchParams.get('focus')
  // 着地元タスクの source_rid から、不動産の①市区町村役場/②法務局どちらの表かを判定（該当表を点滅）。
  const focusRid: string = (() => {
    const tid = searchParams.get('task')
    return (tid ? tasks.find(t => t.id === tid)?.source_rid : null) ?? ''
  })()
  const focusOffice: 'muni' | 'houmu' | null = (() => {
    if (/^re-houmu(?:-read)?:/.test(focusRid)) return 'houmu'
    if (/^re(?:-muni)?(?:-read)?:/.test(focusRid)) return 'muni'
    return null
  })()
  // 着地元が「読込」タスクか（re-*-read）。読込タスクは物件洗い出し＋評価額確定まで守備範囲なので物件一覧もハイライト。
  // 「請求」タスクはまだ名寄帳が届いていないので物件一覧はハイライトしない。
  const focusIsRead = /-read:/.test(focusRid)
  const [sub, setSub] = useState<string>(() => {
    if (!focus) return 'realestate'
    if (properties.some(p => municipalityOf(p) === focus)) return 'realestate'
    const asset = financialAssets.find(a => (a.institution_name ?? '').trim() === focus)
    if (asset) return asset.asset_type === '証券' ? 'securities' : (asset.asset_type === '信託銀行' || asset.asset_type === '信託') ? 'trust' : 'deposit'
    return 'realestate'
  })

  // 所在地の予測住所：被相続人の住所・本籍（物件は被相続人の自宅であることが多い）。
  const addrSuggestions = [caseData.deceased_address, caseData.deceased_registered_address].filter((s): s is string => !!s && s.trim() !== '')

  // オーダーシート：証券/信託/生命保険はデータが無ければ最初は非表示。「＋証券/＋信託/＋生命保険」を押すと表示。
  const hasKind = (k: string) => financialAssets.some(a => a.asset_type === k)
  const hasInsurance = !!caseData.life_insurance_company || !!caseData.life_insurance_inquiry || !!caseData.life_insurance_inquiry_notes
  const [reveal, setReveal] = useState<{ securities?: boolean; trust?: boolean; insurance?: boolean }>({})
  const showSecurities = orderSheetMode ? (kindOn('securities') && (hasKind('証券') || !!reveal.securities)) : sub === 'securities'
  const showTrust = orderSheetMode ? (kindOn('trust') && (hasKind('信託銀行') || !!reveal.trust)) : sub === 'trust'
  const showInsurance = orderSheetMode ? (kindOn('insurance') && (hasInsurance || !!reveal.insurance)) : sub === 'insurance'

  // その他財産／相続債務／その他費用。オーダーシートでは金融資産ブロックに同居させ、
  // データが無ければ「＋◯◯を追加」を押すまで出さない（証券/信託/生命保険と同じ扱い）。
  const otherRowsOf = (kind: string) => otherAssets.filter(r => r.kind === kind)
  const [revealOther, setRevealOther] = useState<Record<string, boolean>>({})
  const otherGroupOn = !showKinds || showKinds.includes('deposit')
  const showOther = (kind: string) =>
    orderSheetMode ? (otherGroupOn && (otherRowsOf(kind).length > 0 || !!revealOther[kind])) : sub === `other:${kind}`

  // 契約時受領の書類を各表の先頭に取り込む。区分=金融/不動産は確実に振り分け。
  // 旧データ（区分=財産）は名称キーワードでフォールバック振り分け。
  const RE_KW = ['不動産', '権利証', '固定資産', '登記', '公図']
  const isRE = (d: ContractDocumentRow) => RE_KW.some(k => (d.name ?? '').includes(k))
  const reContractDocs = contractDocuments.filter(d => d.category === '不動産' || (d.category === '財産' && isRE(d)))
  const finContractDocs = contractDocuments.filter(d => d.category === '金融' || (d.category === '財産' && !isRE(d)))

  // 財産の合計（このタブに表示している種別だけを集計）。
  // 実務タブは全種別、オーダーシートは 不動産ブロック/金融ブロック それぞれの合計になる。
  // 金額は「確定済」に限らず、入力されている値をそのまま足す（調査中の概算を見たいため）。
  const yen = (n: number) => '¥' + Math.round(n).toLocaleString()
  const finSum = (kind: string) => financialAssets.filter(a => a.asset_type === kind).reduce((s, a) => s + (a.balance_amount ?? 0), 0)
  const summaryItems: Array<{ label: string; amount: number; negative?: boolean }> = [
    ...(kindOn('realestate') ? [{ label: '不動産', amount: properties.reduce((s, p) => s + (p.appraisal_value ?? 0), 0) }] : []),
    ...(kindOn('deposit') ? [{ label: '預金', amount: finSum('預貯金') }] : []),
    ...(kindOn('securities') ? [{ label: '証券', amount: finSum('証券') }] : []),
    ...(kindOn('trust') ? [{ label: '信託', amount: finSum('信託銀行') }] : []),
    ...(otherGroupOn ? OTHER_ASSET_KINDS.map(k => ({
      label: k.kind, amount: otherRowsOf(k.kind).reduce((s, r) => s + (r.amount ?? 0), 0), negative: k.negative,
    })) : []),
  ].filter(x => x.amount !== 0)
  const summaryPositive = summaryItems.filter(x => !x.negative).reduce((s, x) => s + x.amount, 0)
  const summaryNegative = summaryItems.filter(x => x.negative).reduce((s, x) => s + x.amount, 0)
  const assetSummary = summaryItems.length > 0 ? (
    <div className="rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
        {summaryItems.map(x => (
          <span key={x.label} className={x.negative ? 'text-red-700' : 'text-gray-600'}>
            {x.label} <span className="font-semibold tabular-nums">{x.negative ? `− ${yen(x.amount)}` : yen(x.amount)}</span>
          </span>
        ))}
        <span className="ml-auto text-[12.5px] font-bold text-brand-800">
          {summaryNegative > 0 ? '正味' : '合計'} <span className="tabular-nums">{yen(summaryPositive - summaryNegative)}</span>
        </span>
      </div>
      <p className="mt-1 text-[10.5px] text-gray-400">入力済みの金額をそのまま集計した概算です（確定前の金額も含みます）。確定額は財産目録で管理します。</p>
    </div>
  ) : null

  return (
    <div className="space-y-3.5">
      {!orderSheetMode && <TabHeader title="財産調査" description="不動産・預貯金・有価証券・保険など、財産を調べて、集めた資料をここにまとめます。" />}
      {!orderSheetMode && (
        <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-3">
          <WorkContentField caseData={caseData} gyomu="assets" patchCase={patchCase} label="作業内容（フリー・オーダーシートと共有）" collapsible />
        </div>
      )}
      {!orderSheetMode && (
        <TabTasksSection
          gyomus={['金融資産', '不動産', '目録']}
          tasks={tasks}
          receipts={toReadinessReceipts(documentReceipts)}
        />
      )}

      {/* 財産の合計（このタブに出している種別の概算）。オーダーシート・実務タブ共通で先頭に置く。 */}
      {assetSummary}

      {/* 財産調査条件（開始条件・使用書類）は 不動産セクション内（フリー欄の下）に移動。※下の realestate ブロックで描画 */}

      {/* 種別タブ（不動産 / 預金 / 証券 / 信託 / 生命保険 / 財産目録）。案件詳細のみタブ表示、
          オーダーシートは各パネルを縦積みで全展開。切替時にアンマウントすると入力中の表が
          古いpropsで作り直され消えて見えるため、各パネルは常時マウントしたまま非表示(hidden)で切り替える。 */}
      <div className={orderSheetMode ? 'space-y-3.5' : ''}>
        {!orderSheetMode && <SubTabs tabs={SUBTABS_FULL} active={sub} onChange={setSub} className="mb-3.5" />}

        <div className={(orderSheetMode ? (kindOn('realestate') ? 'space-y-4' : 'hidden') : (sub === 'realestate' ? 'space-y-4' : 'hidden'))}>
          {/* オーダーシート分割表示中は 親OSSection の作業内容欄が上部にあるため、二重表示回避のため 非orderSheetMode のときだけ表示 */}
          {!orderSheetMode && <WorkContentField caseData={caseData} gyomu="assets_re" patchCase={patchCase} label="作業内容・関連情報（不動産／面談シートと共有）" collapsible />}
          {/* オーダーシート（調査前）は市区町村TOPが無いので、ここに財産調査条件（折りたたみ）を置く。
              実務モードでは 不動産セクションの「一覧(TOP)」に topExtra として差し込む。 */}
          {orderSheetMode && surveyConditions}
          {orderSheetMode ? (
            // オーダーシート（調査前）＝どこに物件があるかのヒアリングまで。所在地を入力（市区町村は自動抽出）。
            // 確実に分かるのは「想定物件＋所在地」と「その市区町村で名寄帳・評価証明が要るか」まで。
            // 公図・登記など物件単位は、名寄帳で物件が確定してから実務タブの②法務局で扱う（muniOnly）。
            <div>
              <SectionHeading title="想定される物件と取得予定資料（市区町村ごと）" hint="市区町村ごとに 物件一覧 → 名寄帳 → 評価証明 → 登記情報/法務局 をまとめて入力します。別の市区町村は「市区町村（物件）を追加」で増やせます。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              {/* 市区町村ブロック：物件一覧＋名寄帳＋評価証明＋登記情報/法務局 を市区町村単位で束ねる */}
              <RealEstateOrderBlocks caseId={caseData.id} properties={properties} acquisitions={acquisitions} onRefresh={onRefresh} addressSuggestions={addrSuggestions} />
            </div>
          ) : (
            // 案件詳細（実務）＝市区町村単位のサブタブ＋TOP集計
            <RealEstateSection
              caseId={caseData.id}
              properties={properties}
              acquisitions={acquisitions}
              onRefresh={onRefresh}
              receipts={documentReceipts}
              tasks={tasks}
              contractDocs={reContractDocs}
              focus={focus}
              focusOffice={focusOffice}
              focusIsRead={focusIsRead}
              addressSuggestions={addrSuggestions}
              topExtra={surveyConditions}
            />
          )}
        </div>
        <div className={(orderSheetMode ? (kindOn('deposit') ? 'space-y-3' : 'hidden') : (sub === 'deposit' ? 'space-y-3' : 'hidden'))}>
          {!orderSheetMode && <WorkContentField caseData={caseData} gyomu="assets_deposit" patchCase={patchCase} label="作業内容・関連情報（預金／面談シートと共有）" collapsible />}
          {orderSheetMode ? (
            <>
              <SectionHeading title="預金口座（金融機関名を入力）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <FinancialAssetsTable caseId={caseData.id} kind="預貯金" assets={financialAssets} onRefresh={onRefresh} progressMode={false} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} contractDocs={finContractDocs} />
            </>
          ) : (
            <FinancialSection caseId={caseData.id} kind="預貯金" scopePrefix="asset_deposit" assets={financialAssets} onRefresh={onRefresh} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} contractDocs={finContractDocs} focus={focus} />
          )}
        </div>
        <div className={showSecurities ? 'space-y-3' : 'hidden'}>
          {!orderSheetMode && <WorkContentField caseData={caseData} gyomu="assets_securities" patchCase={patchCase} label="作業内容・関連情報（証券／面談シートと共有）" collapsible />}
          {orderSheetMode ? (
            <>
              <SectionHeading title="証券口座（証券会社名を入力）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <FinancialAssetsTable caseId={caseData.id} kind="証券" assets={financialAssets} onRefresh={onRefresh} progressMode={false} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} />
            </>
          ) : (
            <FinancialSection caseId={caseData.id} kind="証券" scopePrefix="asset_securities" assets={financialAssets} onRefresh={onRefresh} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} focus={focus} />
          )}
        </div>
        <div className={showTrust ? 'space-y-3' : 'hidden'}>
          {!orderSheetMode && <WorkContentField caseData={caseData} gyomu="assets_trust" patchCase={patchCase} label="作業内容・関連情報（信託／面談シートと共有）" collapsible />}
          {orderSheetMode ? (
            <>
              <SectionHeading title="信託口座（信託銀行名を入力）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <FinancialAssetsTable caseId={caseData.id} kind="信託銀行" assets={financialAssets} onRefresh={onRefresh} progressMode={false} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} />
            </>
          ) : (
            <FinancialSection caseId={caseData.id} kind="信託銀行" scopePrefix="asset_trust" assets={financialAssets} onRefresh={onRefresh} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} focus={focus} />
          )}
        </div>
        <div className={showInsurance ? 'space-y-3' : 'hidden'}>
          {!orderSheetMode && <WorkContentField caseData={caseData} gyomu="assets_insurance" patchCase={patchCase} label="作業内容・関連情報（生命保険／面談シートと共有）" collapsible />}
          {orderSheetMode && <SectionHeading title="生命保険" className="mb-2.5 pb-1.5 border-b border-gray-200" />}
          {!orderSheetMode && <ProgressSummary caseId={caseData.id} scopeKey="asset_insurance" title="進捗/結果（生命保険）" />}
          <FieldGrid>
            <InlineEdit label="保険会社名" value={caseData.life_insurance_company} onSave={v => save('life_insurance_company', v)} />
            <InlineCheckbox label="生命保険協会照会" value={caseData.life_insurance_inquiry} onSave={v => save('life_insurance_inquiry', v)} />
            <InlineTextarea label="照会結果・保険金メモ" value={caseData.life_insurance_inquiry_notes} onSave={v => save('life_insurance_inquiry_notes', v)} fullWidth placeholder="例）受取人／保険金額／請求日／入金日／課税区分（みなし相続財産）／協会照会の結果 など" />
          </FieldGrid>
        </div>
        {/* その他財産／相続債務／その他費用。実務タブは根拠資料・精算・立替者・備考まで、
            オーダーシートは項目・金額だけ（面談中に根拠資料まで詰めるのは現実的でないため）。 */}
        {OTHER_ASSET_KINDS.map(k => (
          <div key={k.kind} className={showOther(k.kind) ? 'space-y-3' : 'hidden'}>
            {!orderSheetMode && (
              <WorkContentField caseData={caseData} gyomu={`assets_other_${k.kind}`} patchCase={patchCase} label={`作業内容・関連情報（${k.kind}／面談シートと共有）`} collapsible />
            )}
            <SectionHeading title={k.kind} hint={k.hint} className="mb-2.5 pb-1.5 border-b border-gray-200" />
            {isNegativeKind(k.kind) && (
              <p className="text-[11.5px] text-red-700 bg-red-50 border border-red-100 rounded px-2.5 py-1.5">
                金額はプラスで入力してください（合計は自動でマイナス計上されます）。
              </p>
            )}
            <OtherAssetsTable
              caseId={caseData.id} kind={k.kind} rows={otherRowsOf(k.kind)}
              heirs={heirs} onRefresh={onRefresh} detailed={!orderSheetMode}
            />
          </div>
        ))}
        {orderSheetMode && otherGroupOn && OTHER_ASSET_KINDS.some(k => !showOther(k.kind)) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {OTHER_ASSET_KINDS.filter(k => !showOther(k.kind)).map(k => (
              <button key={k.kind} type="button" onClick={() => setRevealOther(r => ({ ...r, [k.kind]: true }))}
                className={`inline-flex items-center gap-1 text-[12px] font-semibold border border-dashed rounded-lg px-3 py-1.5 ${isNegativeKind(k.kind) ? 'text-red-600 hover:text-red-700 border-red-300' : 'text-brand-600 hover:text-brand-700 border-brand-300'}`}>
                ＋ {k.kind}を追加
              </button>
            ))}
          </div>
        )}
        {/* オーダーシート：証券/信託/生命保険が未表示なら追加ボタンで出す（優先度: 証券→信託→生命保険） */}
        {orderSheetMode && (kindOn('securities') || kindOn('trust') || kindOn('insurance')) && (!showSecurities || !showTrust || !showInsurance) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {!showSecurities && (
              <button type="button" onClick={() => setReveal(r => ({ ...r, securities: true }))} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 border border-dashed border-brand-300 rounded-lg px-3 py-1.5">＋ 証券を追加</button>
            )}
            {!showTrust && (
              <button type="button" onClick={() => setReveal(r => ({ ...r, trust: true }))} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 border border-dashed border-brand-300 rounded-lg px-3 py-1.5">＋ 信託を追加</button>
            )}
            {!showInsurance && (
              <button type="button" onClick={() => setReveal(r => ({ ...r, insurance: true }))} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 border border-dashed border-brand-300 rounded-lg px-3 py-1.5">＋ 生命保険を追加</button>
            )}
          </div>
        )}
        {/* 契約時受領の財産書類は不動産/金融の各表の先頭に「契約時受領」として取り込み表示（二重登録防止）。 */}
      </div>

      {/* 財産目録（種別タブと同列・オーダーシートでは非表示） */}
      <div className={!orderSheetMode && sub === 'inventory' ? '' : 'hidden'}>
        <Section title="財産目録（協議書・精算書へ反映）">
          <InventoryTab caseId={caseData.id} rows={assetInventory} financialAssets={financialAssets} properties={properties} otherAssets={otherAssets} onRefresh={onRefresh} />
        </Section>
      </div>
    </div>
  )
}
