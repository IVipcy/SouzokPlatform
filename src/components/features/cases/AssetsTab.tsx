'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import {
  Section, SectionHeading, FieldGrid, InlineSelect, InlineEdit, InlineCheckbox, InlineTextarea,
} from '@/components/ui/InlineFields'
import { municipalityOf } from './RealEstateSection'
import { OTHER_ASSET_KINDS, isNegativeKind } from '@/lib/constants'
import { SubTabs } from '@/components/ui/SubTabs'
import { PracticeRow } from './PracticeCard'
import RealEstateTable from './RealEstateTable'
import RealEstateOrderBlocks from './RealEstateOrderBlocks'
import FinancialAssetsTable from './FinancialAssetsTable'
import FinancialSection from './FinancialSection'
import RealEstateSection from './RealEstateSection'
import InventoryTab from './InventoryTab'
import OtherAssetsTable from './OtherAssetsTable'
import TabHeader from './TabHeader'
import { TabContextChips, TabContextPanel, ProgressChip, type TabContextTarget } from './TabContextPanel'
import type { CaseRow, RealEstatePropertyRow, FinancialAssetRow, FinancialInstitutionRow, FinancialRequestRow, FinancialRequestItemRow, SecuritiesHoldingRow, FinancialJasdecResultRow, ContractDocumentRow, RealEstateAcquisitionRow, TaskRow, AssetInventoryRow, CaseOtherAssetRow, HeirRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

// この業務のタスク（task.phase）。チップの件数とパネルの一覧で同じ
const ASSET_GYOMUS = ['金融資産', '不動産', '目録']

type Props = {
  caseData: CaseRow
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  /** 金融財産調査：調査先／請求／請求明細／銘柄（migration 271）。実務タブの金融セクションが使う */
  financialInstitutions?: FinancialInstitutionRow[]
  financialRequests?: FinancialRequestRow[]
  financialRequestItems?: FinancialRequestItemRow[]
  securitiesHoldings?: SecuritiesHoldingRow[]
  jasdecResults?: FinancialJasdecResultRow[]
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  // オーダーシート埋め込み時は金融機関表の「請求日・到着日」を出さない
  orderSheetMode?: boolean
  // オーダーシートで 財産調査(不動産)/(金融資産) に分割表示するとき、表示する種別を指定
  //   ['realestate']            → 不動産のみ
  //   ['deposit','securities','trust','insurance'] → 金融資産(預金・証券・信託・生命保険)
  //   未指定=全種別（従来動作）
  showKinds?: Array<'realestate' | 'deposit' | 'securities' | 'trust' | 'insurance'>
  /**
   * その他財産／相続債務／その他費用のうち、このブロックで出すもの。
   * オーダーシートでは金融資産と分けて別ブロックに置くため、明示的に渡す。
   * 未指定なら従来どおり（実務タブ＝サブタブ選択、オーダーシート＝金融ブロックにまとめて表示）。
   */
  showOtherKinds?: string[]
  /** 合計バンドを出さない。合計は財産調査セクションの先頭に1つだけ置くため。 */
  hideSummary?: boolean
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
  { key: 'securities', label: '証券・信託' },   // 実務では証券会社・株主名簿管理人・ほふりを1つのタブで扱う
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

export default function AssetsTab({ caseData, properties, financialAssets, financialInstitutions = [], financialRequests = [], financialRequestItems = [], securitiesHoldings = [], jasdecResults = [], assetInventory = [], onRefresh, patchCase, orderSheetMode = false, showKinds, showOtherKinds, hideSummary = false, contractDocuments = [], acquisitions = [], documentReceipts = [], tasks = [], otherAssets = [], heirs = [] }: Props) {
  // 表示する種別のフィルタ (orderSheetMode の分割表示時のみ使用)
  const kindOn = (k: 'realestate' | 'deposit' | 'securities' | 'trust' | 'insurance') => !showKinds || showKinds.includes(k)
  const save = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

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
  // 見出し右端のチップで開く右側パネル（作業内容／この業務のタスク）。まずは財産調査だけ
  const [ctx, setCtx] = useState<TabContextTarget | null>(null)
  const [sub, setSub] = useState<string>(() => {
    if (!focus) return 'realestate'
    if (properties.some(p => municipalityOf(p) === focus)) return 'realestate'
    const asset = financialAssets.find(a => (a.institution_name ?? '').trim() === focus)
    if (asset) return asset.asset_type === '証券' || asset.asset_type === '信託銀行' || asset.asset_type === '信託' ? 'securities' : 'deposit'
    // 口座を持たない調査先（証券会社・ほふり・株主名簿管理人）は調査先の種別で選ぶ
    const inst = financialInstitutions.find(i => i.name.trim() === focus)
    if (inst) return inst.kind === '預金' ? 'deposit' : 'securities'
    return 'realestate'
  })

  // 所在地の予測住所：被相続人の住所・本籍（物件は被相続人の自宅であることが多い）。
  const addrSuggestions = [caseData.deceased_address, caseData.deceased_registered_address].filter((s): s is string => !!s && s.trim() !== '')

  // オーダーシート：証券/信託/生命保険はデータが無ければ最初は非表示。「＋証券/＋信託/＋生命保険」を押すと表示。
  const hasKind = (k: string) => financialAssets.some(a => a.asset_type === k)
  const hasInsurance = !!caseData.life_insurance_company || !!caseData.life_insurance_inquiry || !!caseData.life_insurance_inquiry_notes
  const [reveal, setReveal] = useState<{ securities?: boolean; trust?: boolean; insurance?: boolean }>({})
  // オーダーシートも実務と同じく証券・信託は1区画。証券会社／株主名簿管理人の行か、保有先の回答があれば出す
  const holdingKnown = caseData.securities_holding_known ?? null
  const showSecurities = orderSheetMode
    ? ((kindOn('securities') || kindOn('trust')) && (hasKind('証券') || hasKind('信託銀行') || !!holdingKnown || !!reveal.securities))
    : sub === 'securities'
  // 保有先の3択。「分からない」なら実務の証券・信託タブに「ほふり照会」を立てる。「分かる」「持っていない」なら不要にする
  const setHoldingKnown = async (v: string) => {
    await patchCase({ securities_holding_known: v || null } as Partial<CaseRow>)
    const sb = createClient()
    const jasdec = financialInstitutions.find(i => i.kind === 'ほふり')
    if (v === '分からない') {
      if (!jasdec) {
        await sb.from('financial_institutions').insert({ case_id: caseData.id, kind: 'ほふり', name: '証券保管振替機構（ほふり）', jasdec_company_known: '不明', freeze_required: false, form_required: false, search_required: false, sort_order: 0 })
      } else if (jasdec.jasdec_company_known === '調査不要') {
        await sb.from('financial_institutions').update({ jasdec_company_known: '不明' }).eq('id', jasdec.id)
      }
    } else if (jasdec && !jasdec.jasdec_request_date) {
      await sb.from('financial_institutions').update({ jasdec_company_known: '調査不要' }).eq('id', jasdec.id)
    }
    onRefresh?.()
  }
  const showInsurance = orderSheetMode ? (kindOn('insurance') && (hasInsurance || !!reveal.insurance)) : sub === 'insurance'

  // その他財産／相続債務／その他費用。オーダーシートでは金融資産ブロックに同居させ、
  // データが無ければ「＋◯◯を追加」を押すまで出さない（証券/信託/生命保険と同じ扱い）。
  // 種別ごとの行。毎回 filter すると別の配列になり、表側で行が作り直されて
  // 「追加した行が一瞬消える」ため、識別子を固定してから渡す。
  const otherByKind = useMemo(() => {
    const m: Record<string, CaseOtherAssetRow[]> = {}
    for (const k of OTHER_ASSET_KINDS) m[k.kind] = otherAssets.filter(r => r.kind === k.kind)
    return m
  }, [otherAssets])
  const otherRowsOf = (kind: string) => otherByKind[kind] ?? []
  const [revealOther, setRevealOther] = useState<Record<string, boolean>>({})
  // showOtherKinds を渡されたら、その種別だけをこのブロックで出す（合計にも同じ範囲を使う）
  const otherGroupOn = showOtherKinds ? showOtherKinds.length > 0 : (!showKinds || showKinds.includes('deposit'))
  const otherKindOn = (kind: string) => (showOtherKinds ? showOtherKinds.includes(kind) : otherGroupOn)
  const showOther = (kind: string) =>
    orderSheetMode
      ? (otherKindOn(kind) && (!!showOtherKinds || otherRowsOf(kind).length > 0 || !!revealOther[kind]))
      : sub === `other:${kind}`

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
    ...OTHER_ASSET_KINDS.filter(k => otherKindOn(k.kind)).map(k => ({
      label: k.kind, amount: otherRowsOf(k.kind).reduce((s, r) => s + (r.amount ?? 0), 0), negative: k.negative,
    })),
  ].filter(x => x.amount !== 0)
  const summaryPositive = summaryItems.filter(x => !x.negative).reduce((s, x) => s + x.amount, 0)
  const summaryNegative = summaryItems.filter(x => x.negative).reduce((s, x) => s + x.amount, 0)
  const assetSummary = !hideSummary && summaryItems.length > 0 ? (
    <div className="rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
        {/* マイナス計上は「− 金額」の表記で分かるので赤字にはしない（赤は危険の色に取っておく） */}
        {summaryItems.map(x => (
          <span key={x.label} className="text-gray-600">
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
      {/* 作業内容と進行中の作業は帯にせず、見出しの右端のチップ→右側パネル（TabContextPanel） */}
      {!orderSheetMode && (
        <TabHeader title="財産調査" description="不動産・預貯金・有価証券・保険など、財産を調べて、集めた資料をここにまとめます。"
          right={<TabContextChips caseData={caseData} gyomu="assets" tasks={tasks} gyomus={ASSET_GYOMUS} open={ctx} onToggle={t => setCtx(c => (c === t ? null : t))} />} />
      )}

      {/* 財産の合計（概算）。オーダーシート（調査前のヒアリング）だけに置く。
          実務タブでは財産目録が確定額を持っているので、概算を上に出すと数字が2つ並んで紛らわしい。 */}
      {orderSheetMode && assetSummary}


      {/* 種別タブ（不動産 / 預金 / 証券 / 信託 / 生命保険 / 財産目録）。案件詳細のみタブ表示、
          オーダーシートは各パネルを縦積みで全展開。切替時にアンマウントすると入力中の表が
          古いpropsで作り直され消えて見えるため、各パネルは常時マウントしたまま非表示(hidden)で切り替える。 */}
      <div className={orderSheetMode ? 'space-y-3.5' : ''}>
        {!orderSheetMode && <SubTabs tabs={SUBTABS_FULL} active={sub} onChange={setSub} className="mb-3.5" />}

        <div className={(orderSheetMode ? (kindOn('realestate') ? 'space-y-4' : 'hidden') : (sub === 'realestate' ? 'space-y-4' : 'hidden'))}>
          {/* オーダーシート分割表示中は 親OSSection の作業内容欄が上部にあるため、二重表示回避のため 非orderSheetMode のときだけ表示 */}
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
              deceasedLastAddress={caseData.deceased_address}
              caseData={caseData}
            />
          )}
        </div>
        <div className={(orderSheetMode ? (kindOn('deposit') ? 'space-y-3' : 'hidden') : (sub === 'deposit' ? 'space-y-3' : 'hidden'))}>
          {orderSheetMode ? (
            <>
              <SectionHeading title="預金口座（金融機関名を入力）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <FinancialAssetsTable caseId={caseData.id} kind="預貯金" assets={financialAssets} onRefresh={onRefresh} progressMode={false} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} contractDocs={finContractDocs} dateOfDeath={caseData.date_of_death} />
            </>
          ) : (
            <FinancialSection caseId={caseData.id} kind="預貯金" scopePrefix="asset_deposit" assets={financialAssets} institutions={financialInstitutions} requests={financialRequests} requestItems={financialRequestItems} holdings={securitiesHoldings} caseData={caseData} patchCase={patchCase} onRefresh={onRefresh} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} contractDocs={finContractDocs} focus={focus} />
          )}
        </div>
        <div className={showSecurities ? 'space-y-3' : 'hidden'}>
          {orderSheetMode ? (
            <>
              {/* 証券・信託：①保有先が分かるか ②証券会社（1行1社） ③株主名簿管理人（分かっている場合だけ）。銘柄は実務で */}
              <SectionHeading title="証券・信託" hint="株式・投資信託など。面談で分かる範囲だけ。銘柄は残高証明が届いてから実務タブで登録します。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[9.5rem_minmax(0,1fr)_9.5rem_minmax(0,1fr)]">
                <PracticeRow label="保有先" hint="どこの証券会社に口座があるか分かっていますか。分からなければ、ほふり（証券保管振替機構）に開示請求して口座のある証券会社をまとめて確認します。" full>
                  {(['分かる', '分からない', '持っていない'] as const).map(o => (
                    <label key={o} className="inline-flex items-center gap-1.5 text-[13px] cursor-pointer mr-3">
                      <input type="radio" name="securities_holding_known" checked={holdingKnown === o} onChange={() => void setHoldingKnown(o)} className="w-4 h-4 accent-brand-600" />
                      <span className={holdingKnown === o ? 'text-gray-800 font-semibold' : 'text-gray-600'}>{o === '分かる' ? '分かる（下の表に入れる）' : o === '分からない' ? '分からない → ほふり照会をする' : '株は持っていない'}</span>
                    </label>
                  ))}
                  {holdingKnown === '分からない' && <span className="w-full text-[12px] text-gray-500">実務タブの証券・信託に「ほふり照会」が立ちます。開示結果で判明した証券会社はそこから調査先に追加します</span>}
                </PracticeRow>
              </div>
              {holdingKnown !== '持っていない' && (<>
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-1.5"><span className="w-[3px] h-3.5 bg-brand-600" /><span className="text-[13.5px] font-semibold text-gray-700">証券会社</span><span className="text-[12px] text-gray-500">1行1社。面談で聞いた銘柄は備考に</span></div>
                  <FinancialAssetsTable caseId={caseData.id} kind="証券" assets={financialAssets} onRefresh={onRefresh} progressMode={false} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} />
                </div>
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-1.5"><span className="w-[3px] h-3.5 bg-brand-600" /><span className="text-[13.5px] font-semibold text-gray-700">株主名簿管理人（信託銀行等）</span><span className="text-[12px] text-gray-500">配当の通知などで分かっている場合だけ</span></div>
                  <FinancialAssetsTable caseId={caseData.id} kind="信託銀行" assets={financialAssets} onRefresh={onRefresh} progressMode={false} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} />
                </div>
              </>)}
            </>
          ) : (
            <FinancialSection caseId={caseData.id} kind="証券・信託" scopePrefix="asset_securities" assets={financialAssets} institutions={financialInstitutions} requests={financialRequests} requestItems={financialRequestItems} holdings={securitiesHoldings} jasdecResults={jasdecResults} caseData={caseData} patchCase={patchCase} onRefresh={onRefresh} roles={caseData.intake_roles ?? []} receipts={documentReceipts} tasks={tasks} focus={focus} />
          )}
        </div>
        <div className={showInsurance ? 'space-y-3' : 'hidden'}>
          <SectionHeading title="生命保険" className="mb-2.5 pb-1.5 border-b border-gray-200"
            right={orderSheetMode ? undefined : <ProgressChip caseId={caseData.id} scopeKey="asset_insurance" title="生命保険" />} />
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
            <SectionHeading title={k.kind} hint={k.hint} className="mb-2.5 pb-1.5 border-b border-gray-200" />
            {isNegativeKind(k.kind) && (
              <p className="text-[11.5px] text-gray-600 bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5">
                金額はプラスで入力してください（合計は自動でマイナス計上されます）。
              </p>
            )}
            <OtherAssetsTable
              caseId={caseData.id} kind={k.kind} rows={otherRowsOf(k.kind)}
              heirs={heirs} onRefresh={onRefresh} detailed={!orderSheetMode}
            />
          </div>
        ))}
        {orderSheetMode && !showOtherKinds && otherGroupOn && OTHER_ASSET_KINDS.some(k => !showOther(k.kind)) && (
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
        {orderSheetMode && (kindOn('securities') || kindOn('trust') || kindOn('insurance')) && (!showSecurities || !showInsurance) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {!showSecurities && (kindOn('securities') || kindOn('trust')) && (
              <button type="button" onClick={() => setReveal(r => ({ ...r, securities: true }))} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 border border-dashed border-brand-300 rounded-lg px-3 py-1.5">＋ 証券・信託を追加</button>
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
          <InventoryTab caseId={caseData.id} financialAssets={financialAssets} properties={properties} otherAssets={otherAssets} heirs={heirs} onRefresh={onRefresh} />
        </Section>
      </div>
      {/* 右サイドパネル（画面右端に重ねる。位置はここに置いても fixed なので関係ない） */}
      {!orderSheetMode && ctx && (
        <TabContextPanel key={ctx} title="財産調査" caseData={caseData} gyomu="assets" patchCase={patchCase} tasks={tasks} gyomus={ASSET_GYOMUS}
          target={ctx} onClose={() => setCtx(null)} onRefresh={onRefresh} />
      )}
    </div>
  )
}
