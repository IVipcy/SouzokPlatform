'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, FileSpreadsheet, Eye, Flag, Clock, X, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/providers/AuthProvider'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import HankoStamp from '@/components/ui/HankoStamp'
import ClientInfoTab from './ClientInfoTab'
import OrderContentTab from './OrderContentTab'
import DeceasedTab from './DeceasedTab'
import AssetsTab from './AssetsTab'
import AssetsTotalBand from './AssetsTotalBand'
import { OTHER_ASSET_KINDS } from '@/lib/constants'
import ReferralTab from './ReferralTab'
import CancellationTab from './CancellationTab'
import RegistrationTab from './RegistrationTab'
import DivisionTab from './DivisionTab'
import PracticeProcedureTab from './PracticeProcedureTab'
import { WorkContentField, workContentPlaceholder } from './WorkContentField'
import HintNote from '@/components/ui/HintNote'
import OrderSheetGuided from './OrderSheetGuided'
import MeetingMemoViewer, { type MemoLite } from './MeetingMemoViewer'
import { NestedSectionContext } from '@/components/ui/InlineFields'
import BackToTopButton from '@/components/ui/BackToTopButton'
import { PROCEDURE_TABS } from './practiceTabs'
import { GYOMU_TAB } from '@/lib/serviceMaster'
import type { TabKey } from './CaseTabs'
import type { ReactNode } from 'react'
import type { TimelineReceipt } from './CaseTimeline'
import type {
  CaseRow, CaseReferralRow, CaseClientRow, HeirRow, KosekiRequestRow, RealEstatePropertyRow, RealEstateAcquisitionRow, FinancialAssetRow,
  DivisionDetailRow, AgreementDispatchRow, ExpenseRow, TaskRow, ClientCommunicationRow, ContractDocumentRow, SagyoDocumentRow,
  CaseOtherAssetRow,
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
  otherAssets?: CaseOtherAssetRow[]
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
  // スマホ用ガイド入力（1セクション1画面ステップ＋簡易メモ＋詳細展開）。既定は従来の縦積み表示。
  guided?: boolean
  /** 面談の白紙メモ原本。渡すと右上に「面談メモ（原本）」ボタンが出る。 */
  meetingMemos?: MemoLite[]
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
  heirs, kosekiRequests, properties, acquisitions = [], financialAssets, otherAssets = [], divisionDetails, agreementDispatches = [], tasks, clientCommunications, referrals, caseClients, contractDocuments,
  sagyoDocuments = [], receipts = [], guided = false, meetingMemos = [],
}: Props) {
  const [memoViewerOpen, setMemoViewerOpen] = useState(false)
  const supabase = createClient()
  const authUser = useAuth()
  // アシスタント（パート）はオーダーシートを参照のみ（入力・完成操作は不可）
  const ro = !!authUser && authUser.primaryRole === 'assistant' && !authUser.roles.includes('system_manager')
  const [saving, setSaving] = useState(false)
  const [reeditConfirm, setReeditConfirm] = useState(false)  // ハンコ×→「確定したオーダーシートを再編集」確認
  // 最終更新日＝order_sheet_completed_at（保存/GOで更新）。確定＝order_sheet_finalized_at（これでGO！のハンコ）。
  const lastUpdatedAt = caseData.order_sheet_completed_at
  const finalized = !!caseData.order_sheet_finalized_at

  // 「オーダーシートを保存」＝最終更新日を今に更新（各項目は入力時に自動保存済み）。
  const saveAndRefresh = async (): Promise<boolean> => {
    setSaving(true)
    const { error } = await supabase.from('cases').update({ order_sheet_completed_at: new Date().toISOString() }).eq('id', caseData.id)
    setSaving(false)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return false }
    onRefresh()
    showToast('オーダーシートを保存しました', 'success')
    return true
  }

  // 「これでGO！」＝確定（最終化）。管理担当でも受注担当でも押せる。GO日を最終更新日にも反映。
  const goFinalize = async (): Promise<boolean> => {
    setSaving(true)
    const now = new Date().toISOString()
    try {
      await patchCase({ order_sheet_finalized_at: now, order_sheet_finalized_by: authUser?.memberId ?? null, order_sheet_finalized_name: authUser?.memberName ?? null, order_sheet_completed_at: now })
    } catch (e) { setSaving(false); showToast(`確定に失敗しました: ${e instanceof Error ? e.message : ''}`, 'error'); return false }
    setSaving(false)
    showToast('オーダーシートを確定しました（これでGO！）', 'success')
    return true
  }
  // 確定解除（再編集）
  const unfinalize = async () => {
    await patchCase({ order_sheet_finalized_at: null, order_sheet_finalized_by: null, order_sheet_finalized_name: null })
    setReeditConfirm(false)
    showToast('確定を解除しました。再編集できます', 'success')
  }

  // 最終更新日の表示
  const lastUpdatedEl = lastUpdatedAt ? (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg whitespace-nowrap">
      <Clock className="w-4 h-4 text-gray-400" strokeWidth={2} />最終更新日 {lastUpdatedAt.slice(0, 10)}
    </span>
  ) : null

  // 「これでGO！」ボタン or 確定ハンコ（×で再編集）
  const goOrStampEl = finalized ? (
    <span className="relative inline-flex items-start">
      <HankoStamp name={caseData.order_sheet_finalized_name} at={caseData.order_sheet_finalized_at} size="sm" />
      {!ro && (
        <button type="button" onClick={() => setReeditConfirm(true)} title="確定を解除して再編集"
          className="absolute -top-1.5 -right-2 w-[18px] h-[18px] rounded-full bg-white border border-gray-300 text-gray-500 hover:text-red-600 hover:border-red-300 flex items-center justify-center shadow-sm">
          <X className="w-3 h-3" strokeWidth={2.5} />
        </button>
      )}
    </span>
  ) : (!ro ? (
    <button type="button" onClick={goFinalize} disabled={saving}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-colors disabled:opacity-50">
      <Flag className="w-4 h-4" strokeWidth={2.25} />これでGO！
    </button>
  ) : null)

  // 面談メモ（原本）：白紙メモタブで保存した画像を、オーダーシート入力中いつでも開けるようにする。
  const memoViewerEl = meetingMemos.length > 0 ? (
    <button type="button" onClick={() => setMemoViewerOpen(true)}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors">
      <FileText className="w-4 h-4" />面談メモ（原本）
    </button>
  ) : null

  // 確定解除の確認ポップ（ハンコ×）
  const reeditModalEl = (
    <Modal isOpen={reeditConfirm} onClose={() => setReeditConfirm(false)} title="確定したオーダーシートを再編集" maxWidth="max-w-sm"
      footer={<><Button variant="secondary" onClick={() => setReeditConfirm(false)}>いいえ</Button><Button variant="primary" onClick={unfinalize}>はい</Button></>}>
      <p className="text-[13px] text-gray-700 leading-relaxed">確定を解除して、オーダーシートを再編集しますか？（ハンコが消え、「これでGO！」ボタンに戻ります）</p>
    </Modal>
  )

  // 受注区分→選択業務 で実務セクションを出し分け（service_category 未設定の旧案件は全表示）
  const selectedGyomu = [...new Set((caseData.intake_roles ?? []).map(r => r.gyomu).filter(Boolean))]
  const allowedTabs = caseData.service_category
    ? new Set(selectedGyomu.map(g => GYOMU_TAB[g]).filter(Boolean) as TabKey[])
    : null
  // 依頼者情報は業務(gyomu)に依存しない固定セクションなので、allowedTabs に関わらず常に表示する。
  const ALWAYS_SEC = new Set<TabKey>(['clientInfo'])
  const showSec = (gate?: TabKey) => !gate || ALWAYS_SEC.has(gate) || !allowedTabs || allowedTabs.has(gate)

  // workContentKey: 上部フリー欄(WorkContentField)の保存先キー。省略時は gate ?? title
  //   財産調査（不動産）→ assets_re、財産調査（金融資産）→ assets_deposit（面談シートのキーと揃える）
  // 相続債務・その他費用は既定で出さない（発生する案件が少ないため）。
  // 中身があるか、「＋ ◯◯を追加」を押したときだけセクションとして現れる。
  const ALWAYS_OTHER_KIND = 'その他財産'
  const [revealedOtherKinds, setRevealedOtherKinds] = useState<string[]>([])
  const otherKindVisible = (kind: string) =>
    kind === ALWAYS_OTHER_KIND || otherAssets.some(r => r.kind === kind) || revealedOtherKinds.includes(kind)
  const hiddenOtherKinds = OTHER_ASSET_KINDS.map(k => k.kind).filter(k => !otherKindVisible(k))

  const allOsSections: { title: string; gate?: TabKey; anchorId?: string; workContentKey?: string; node: ReactNode }[] = [
    // 面談シート(MeetingSheetTab)と work_content のキーを揃えるため gate/workContentKey を明示（面談メモがオーダーシート/実務タブに引き継がれる）
    { title: '依頼者情報', gate: 'clientInfo', node: <ClientInfoTab caseData={caseData} clientCommunications={clientCommunications} patchCase={patchCase} patchClient={patchClient} onRefresh={onRefresh} orderSheetMode caseClients={caseClients} /> },
    { title: '受注内容', workContentKey: 'order', node: <OrderContentTab caseData={caseData} patchCase={patchCase} orderSheetMode hideOrderMemo={guided} /> },
    { title: '相続人調査', gate: 'deceased', node: <DeceasedTab caseData={caseData} heirs={heirs} kosekiRequests={kosekiRequests} onRefresh={onRefresh} patchCase={patchCase} orderSheetMode contractDocuments={contractDocuments} caseClients={caseClients} /> },
    // 財産調査は「合計 → 不動産 → 金融資産 → その他財産 → 相続債務 → その他費用」の順に並べる。
    // 合計は先頭の1か所だけ（各ブロックの合計バンドは hideSummary で消す）。
    // その他財産・相続債務・その他費用は金融資産ではないので、金融ブロックから出して別に置く。
    { title: '財産調査（合計）', gate: 'assets', workContentKey: 'assets', node: <AssetsTotalBand properties={properties} financialAssets={financialAssets} otherAssets={otherAssets} /> },
    { title: '財産（不動産）', gate: 'assets', workContentKey: 'assets_re', node: <AssetsTab caseData={caseData} properties={properties} acquisitions={acquisitions} financialAssets={financialAssets} onRefresh={onRefresh} patchCase={patchCase} orderSheetMode contractDocuments={contractDocuments} showKinds={['realestate']} showOtherKinds={[]} hideSummary /> },
    { title: '財産（金融資産）', gate: 'assets', workContentKey: 'assets_deposit', node: <AssetsTab caseData={caseData} properties={properties} acquisitions={acquisitions} financialAssets={financialAssets} otherAssets={otherAssets} heirs={heirs} onRefresh={onRefresh} patchCase={patchCase} orderSheetMode contractDocuments={contractDocuments} showKinds={['deposit', 'securities', 'trust', 'insurance']} showOtherKinds={[]} hideSummary /> },
    // その他財産は常に出す。相続債務・その他費用はあまり発生しないので、
    // 中身があるときか「＋ 追加」を押したときだけセクションを出す。
    ...OTHER_ASSET_KINDS.filter(k => otherKindVisible(k.kind)).map(k => ({
      title: k.kind,
      gate: 'assets' as TabKey,
      workContentKey: `assets_other_${k.kind}`,
      node: (
        <>
          <AssetsTab caseData={caseData} properties={properties} acquisitions={acquisitions} financialAssets={financialAssets} otherAssets={otherAssets} heirs={heirs} onRefresh={onRefresh} patchCase={patchCase} orderSheetMode contractDocuments={contractDocuments} showKinds={[]} showOtherKinds={[k.kind]} hideSummary />
          {k.kind === 'その他財産' && hiddenOtherKinds.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-3">
              {hiddenOtherKinds.map(h => (
                <button key={h} type="button" onClick={() => setRevealedOtherKinds(prev => [...prev, h])}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 border border-dashed border-brand-300 rounded-lg px-3 py-1.5">
                  ＋ {h}を追加
                </button>
              ))}
            </div>
          )}
        </>
      ),
    })),
    { title: '他事業者紹介', gate: 'referral', anchorId: 'os-referral', node: <ReferralTab caseData={caseData} referrals={referrals} onRefresh={onRefresh} orderSheetMode /> },
    { title: '遺産分割', gate: 'division', node: <DivisionTab caseData={caseData} divisionDetails={divisionDetails} heirs={heirs} agreementDispatches={agreementDispatches} onRefresh={onRefresh} patchCase={patchCase} mode="division" orderSheetMode /> },
    { title: '遺言', gate: 'will', node: <DivisionTab caseData={caseData} divisionDetails={divisionDetails} heirs={heirs} onRefresh={onRefresh} patchCase={patchCase} mode="will" orderSheetMode /> },
    { title: '相続登記', gate: 'registration', node: <RegistrationTab caseData={caseData} properties={properties} onRefresh={onRefresh} patchCase={patchCase} contractDocuments={contractDocuments} orderSheetMode /> },
    { title: '解約等（銀行・証券・自動車）', gate: 'cancellation', node: <CancellationTab financialAssets={financialAssets} onRefresh={onRefresh} receipts={receipts} orderSheetMode /> },
    ...PROCEDURE_TABS.map(p => ({
      title: p.title,
      gate: p.tab,
      node: <PracticeProcedureTab caseData={caseData} patchCase={patchCase} gyomu={p.gyomu} title={p.title} description={p.description} court={p.court} trust={p.trust} mediation={p.mediation} heirs={heirs} tasks={tasks} sagyoDocuments={sagyoDocuments} receipts={receipts} onRefresh={onRefresh} embedded />,
    })),
    // 専用の管理項目が無い業務（手紙・執行通知・契約書作成）は作業内容（フリー）のみ
    { title: '手紙', gate: 'letter', node: <HintNote>作業内容を下の欄に書いてください（専用の入力項目は今後追加予定です）。</HintNote> },
    { title: '執行通知', gate: 'execution', node: <HintNote>作業内容を下の欄に書いてください（専用の入力項目は今後追加予定です）。</HintNote> },
    { title: '契約書作成', gate: 'contractCreate', node: <HintNote>契約書を作る作業を下の欄に書いてください（残りの手続きとは別です。専用の入力項目は今後追加予定）。</HintNote> },
    // 契約・報酬・請求はオーダーシートでは扱わない（請求タブで管理）
  ]
  const osSections = allOsSections.filter(s => showSec(s.gate))

  // 各大セクションのアンカーID（左ガイドのジャンプ先／スクロール監視に使用）
  const sectionId = (s: { anchorId?: string }, i: number) => s.anchorId ?? `os-sec-${i}`

  // PC左ガイド：スクロールに合わせて現在地セクションをハイライト（IntersectionObserver）
  const [activeSectionId, setActiveSectionId] = useState('')
  useEffect(() => {
    if (guided) return
    const els = osSections.map((s, i) => document.getElementById(sectionId(s, i))).filter((el): el is HTMLElement => !!el)
    if (els.length === 0) return
    const obs = new IntersectionObserver(
      entries => {
        const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (vis[0]) setActiveSectionId(vis[0].target.id)
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    )
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osSections.length, guided])

  // スマホ用ガイド入力：1セクション1画面のステップ表示（簡易メモ＋詳細展開）
  if (guided) {
    return (
      <OrderSheetGuided
        sections={osSections}
        caseData={caseData}
        patchCase={patchCase}
        finalized={finalized}
        lastUpdatedAt={lastUpdatedAt}
        onSaveOnly={saveAndRefresh}
        saving={saving}
      />
    )
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
        {ro && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg">
            <Eye className="w-4 h-4" />参照のみ（アシスタント）
          </span>
        )}
        {memoViewerEl}
        {lastUpdatedEl}
        {goOrStampEl}
      </div>

      <div className="lg:flex lg:gap-5 lg:items-start">
        {/* PC左ガイド（追従・クリックでジャンプ・現在地ハイライト）。スマホは非表示 */}
        <nav className="hidden lg:block lg:w-44 lg:flex-shrink-0 lg:sticky lg:top-4 self-start">
          <div className="text-[11px] text-gray-400 px-2.5 mb-1.5">セクション</div>
          <div className="flex flex-col gap-0.5">
            {osSections.map((s, i) => {
              const id = sectionId(s, i)
              const active = id === activeSectionId
              return (
                <a
                  key={s.title}
                  href={`#${id}`}
                  onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); setActiveSectionId(id) }}
                  className={`text-[12.5px] px-2.5 py-1.5 rounded border-l-[3px] transition ${active ? 'bg-brand-50 text-brand-700 font-semibold border-brand-600' : 'text-gray-500 hover:bg-gray-50 border-transparent'}`}
                >
                  {s.title}
                </a>
              )
            })}
          </div>
        </nav>

        <fieldset disabled={ro} className="flex-1 min-w-0 space-y-5 border-0 p-0 m-0">
          {osSections.map((s, i) => (
            <OSSection key={s.title} title={s.title} id={sectionId(s, i)}>
              {/* 依頼者情報は作業内容欄が不要（依頼者の属性入力のみ）／受注内容はOrderContentTab側でgyomu="order"のフリー欄を持つため二重表示回避 */}
              {s.title !== '依頼者情報' && s.title !== '受注内容' && (
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <WorkContentField caseData={caseData} gyomu={s.workContentKey ?? s.gate ?? s.title} patchCase={patchCase} label="作業内容・関連情報" placeholder={workContentPlaceholder(s.gate ?? s.title)} />
                </div>
              )}
              {s.node}
            </OSSection>
          ))}
        </fieldset>
      </div>

      {/* 最下部の保存／確定アクション（各項目は入力時に自動保存されます） */}
      {!ro && (
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-3">
        <p className="flex-1 text-[12px] text-gray-500">各項目は入力した時点で自動保存されます。「オーダーシートを保存」で最終更新日を更新、「これでGO！」で確定します。</p>
        {lastUpdatedEl}
        <button
          type="button"
          onClick={saveAndRefresh}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50 transition-colors disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />
          {saving ? '保存中...' : 'オーダーシートを保存'}
        </button>
        {goOrStampEl}
      </div>
      )}

      {reeditModalEl}
      <MeetingMemoViewer memos={meetingMemos} open={memoViewerOpen} onClose={() => setMemoViewerOpen(false)} />
      <BackToTopButton />
    </div>
  )
}

// 大セクション見出し（オーダーシートの親）。子の Section（カード）を束ねる上位の帯。番号は付けない。
// 大セクション（親）。小セクション（白カード＝Section）と明確に区別するため、
// 親は「濃い青の見出し＋薄グレー地の容器」にして、中の白カード群を包む＝親子の階層を視覚化する。
function OSSection({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24 bg-[#FEF8EA] border border-[#EADFC7] rounded-lg">
      <div className="px-4 py-2.5 bg-brand-600 rounded-t-lg">
        <h2 className="text-[14px] font-bold text-white tracking-[0.02em]">{title}</h2>
      </div>
      {/* 中の Section は「親の中の見出しブロック」に切り替える（枠なし・灰見出し）。
          中身エリアは白背景にして、内側の表がベージュに透けないようにする（ベージュは外枠として残る）。 */}
      <NestedSectionContext.Provider value={true}>
        <div className="p-4 space-y-4 rounded-b-lg bg-white">{children}</div>
      </NestedSectionContext.Provider>
    </section>
  )
}

