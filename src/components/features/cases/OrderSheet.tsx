'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, FileSpreadsheet, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/providers/AuthProvider'
import { showToast } from '@/components/ui/Toast'
import ClientInfoTab from './ClientInfoTab'
import OrderContentTab from './OrderContentTab'
import DeceasedTab from './DeceasedTab'
import AssetsTab from './AssetsTab'
import ReferralTab from './ReferralTab'
import CancellationTab from './CancellationTab'
import RegistrationTab from './RegistrationTab'
import DivisionTab from './DivisionTab'
import PracticeProcedureTab from './PracticeProcedureTab'
import { WorkContentField, workContentPlaceholder } from './WorkContentField'
import OrderSheetGuided from './OrderSheetGuided'
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
  // スマホ用ガイド入力（1セクション1画面ステップ＋簡易メモ＋詳細展開）。既定は従来の縦積み表示。
  guided?: boolean
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
  heirs, kosekiRequests, properties, acquisitions = [], financialAssets, divisionDetails, agreementDispatches = [], tasks, clientCommunications, referrals, caseClients, contractDocuments,
  sagyoDocuments = [], receipts = [], guided = false,
}: Props) {
  const supabase = createClient()
  const authUser = useAuth()
  // アシスタント（パート）はオーダーシートを参照のみ（入力・完成操作は不可）
  const ro = !!authUser && authUser.primaryRole === 'assistant' && !authUser.roles.includes('system_manager')
  const [saving, setSaving] = useState(false)
  const completed = !!caseData.order_sheet_completed_at

  const saveAndRefresh = async () => {
    setSaving(true)
    onRefresh()
    setSaving(false)
    showToast('オーダーシートを保存しました', 'success')
  }

  const markComplete = async (): Promise<boolean> => {
    setSaving(true)
    // 完成済でも編集可（作業進行中になるまで）。再度押しても完成日は初回のまま保持する。
    const { error } = await supabase
      .from('cases')
      .update({ order_sheet_completed_at: caseData.order_sheet_completed_at ?? new Date().toISOString() })
      .eq('id', caseData.id)
    setSaving(false)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return false }
    showToast(completed ? 'オーダーシートを更新しました' : 'オーダーシートを完成しました', 'success')
    onRefresh()
    return true
  }

  // 受注区分→選択業務 で実務セクションを出し分け（service_category 未設定の旧案件は全表示）
  const selectedGyomu = [...new Set((caseData.intake_roles ?? []).map(r => r.gyomu).filter(Boolean))]
  const allowedTabs = caseData.service_category
    ? new Set(selectedGyomu.map(g => GYOMU_TAB[g]).filter(Boolean) as TabKey[])
    : null
  const showSec = (gate?: TabKey) => !gate || !allowedTabs || allowedTabs.has(gate)

  const allOsSections: { title: string; gate?: TabKey; anchorId?: string; node: ReactNode }[] = [
    { title: '依頼者情報', node: <ClientInfoTab caseData={caseData} clientCommunications={clientCommunications} patchCase={patchCase} patchClient={patchClient} onRefresh={onRefresh} orderSheetMode caseClients={caseClients} /> },
    { title: '受注内容', node: <OrderContentTab caseData={caseData} patchCase={patchCase} orderSheetMode /> },
    { title: '相続人調査', gate: 'deceased', node: <DeceasedTab caseData={caseData} heirs={heirs} kosekiRequests={kosekiRequests} onRefresh={onRefresh} patchCase={patchCase} orderSheetMode contractDocuments={contractDocuments} caseClients={caseClients} /> },
    { title: '財産調査', gate: 'assets', node: <AssetsTab caseData={caseData} properties={properties} acquisitions={acquisitions} financialAssets={financialAssets} onRefresh={onRefresh} patchCase={patchCase} orderSheetMode contractDocuments={contractDocuments} /> },
    { title: '他事業者紹介', anchorId: 'os-referral', node: <ReferralTab caseData={caseData} referrals={referrals} onRefresh={onRefresh} orderSheetMode /> },
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
    { title: '手紙', gate: 'letter', node: <p className="text-[12px] text-gray-400">作業内容を下欄に記載してください（詳細な管理項目は今後追加予定）。</p> },
    { title: '執行通知', gate: 'execution', node: <p className="text-[12px] text-gray-400">作業内容を下欄に記載してください（詳細な管理項目は今後追加予定）。</p> },
    { title: '契約書作成', gate: 'contractCreate', node: <p className="text-[12px] text-gray-400">契約書の作成作業を下欄に記載してください（残手続きとは別。詳細な管理項目は今後追加予定）。</p> },
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
        completed={completed}
        onComplete={markComplete}
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
        {ro ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg">
            <Eye className="w-4 h-4" />
            参照のみ（アシスタント）
          </span>
        ) : completed ? (
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
              {/* 依頼者情報は作業内容欄が不要（依頼者の属性入力のみ） */}
              {s.title !== '依頼者情報' && (
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <WorkContentField caseData={caseData} gyomu={s.gate ?? s.title} patchCase={patchCase} label="作業内容・関連情報" placeholder={workContentPlaceholder(s.gate ?? s.title)} />
                </div>
              )}
              {s.node}
            </OSSection>
          ))}
        </fieldset>
      </div>

      {/* 最下部の保存／完成アクション（各項目は入力時に自動保存されます） */}
      {!ro && (
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-3">
        <p className="flex-1 text-[12px] text-gray-500">各項目は入力した時点で自動保存されます。最後にこのボタンで保存を確定できます。</p>
        <button
          type="button"
          onClick={saveAndRefresh}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50 transition-colors disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />
          オーダーシートを保存
        </button>
        <button
          type="button"
          onClick={markComplete}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-colors disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />
          {saving ? '保存中...' : completed ? '完成を更新' : 'オーダーシートを完成'}
        </button>
      </div>
      )}

      <BackToTopButton />
    </div>
  )
}

// 大セクション見出し（オーダーシートの親）。子の Section（カード）を束ねる上位の帯。番号は付けない。
// 大セクション（親）。小セクション（白カード＝Section）と明確に区別するため、
// 親は「濃い青の見出し＋薄グレー地の容器」にして、中の白カード群を包む＝親子の階層を視覚化する。
function OSSection({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24 bg-white border border-gray-200 rounded-lg">
      <div className="px-4 py-2.5 bg-brand-600 rounded-t-lg">
        <h2 className="text-[14px] font-bold text-white tracking-[0.02em]">{title}</h2>
      </div>
      {/* 中の Section は「親の中の見出しブロック」に切り替える（枠なし・灰見出し） */}
      <NestedSectionContext.Provider value={true}>
        <div className="p-4 space-y-4 rounded-b-lg">{children}</div>
      </NestedSectionContext.Provider>
    </section>
  )
}

