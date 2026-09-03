'use client'

// 金融財産調査（実務タブ）。調査先（金融機関）ごとに1ページ。
//
// いままでは口座の表1枚に、口座の話でないもの（凍結・全店調査・請求日・到着日）まで書いていた。
// ここでは「銀行に1回のこと」「口座のこと」「請求のこと」を3つのタブに分ける。
//   手続き … 01 凍結／死亡連絡 → 02 依頼書 → 03 全店調査（並行） → 04 郵送か来店か
//   口座   … 支店・種別・口座番号・残高。状態は請求から自動で入る
//   請求   … 1行＝金融機関へ一度に出したまとまり。到着処理はここから
//
// 右上の「次の対応」と状況バッジは financialWorkflow が入力値から出す。ここでは選ばない。
// タスクは作らない。対応待ちに「担当する」を押した人だけ tasks に入る（段階3）。
// 印鑑登録証明書は案件に1つ（原本は1通）。上の帯に置き、機関ごとには持たない。

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Check, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { LeftRail } from './LeftRail'
import { PracticeGroup, PracticeRow } from './PracticeCard'
import { SubTabs } from '@/components/ui/SubTabs'
import { SectionHeading } from '@/components/ui/InlineFields'
import ProgressSummary from './ProgressSummary'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { TxtCell, SelCell, DateCell, MoneyCell } from './PracticeTableCells'
import FinancialRequestModal from './FinancialRequestModal'
import FinancialArrivalModal, { StatusChip } from './FinancialArrivalModal'
import {
  evaluateInstitution, sealCertificateStatus, sealOriginalStatus, stageLabel, accountDocStatus, requestStatus, itemConditionLabel,
  FORM_SOURCES, SEARCH_METHODS, SUBMISSION_METHODS, HANDLING_METHODS, SEARCH_TARGETS, JASDEC_KNOWN,
  type InstitutionEvaluation,
} from '@/lib/financialWorkflow'
import { SURVEY_BAN_DESIGNATIONS, SURVEY_BAN_METHODS } from '@/lib/financialBan'
import type {
  FinancialAssetRow, FinancialInstitutionRow, FinancialRequestRow, FinancialRequestItemRow, SecuritiesHoldingRow, CaseRow, TaskRow, ContractDocumentRow,
} from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Kind = '預貯金' | '証券' | '信託銀行'
/** 実務タブの種別 → 調査先の種別。証券タブにはほふりも出す（証券会社を生やす起点） */
const KINDS_OF: Record<Kind, FinancialInstitutionRow['kind'][]> = { '預貯金': ['預金'], '証券': ['証券', 'ほふり'], '信託銀行': ['株主名簿管理人'] }
const ACCOUNT_TYPES = ['普通', '定期', '当座', '貯蓄', 'その他']
const collator = new Intl.Collator('ja')
const yen = (n: number | null) => (n == null ? '—' : `¥${Math.round(n).toLocaleString('ja-JP')}`)
const md = (d: string | null | undefined) => (d ? d.slice(5).replace('-', '/') : '—')
const todayYmd = () => new Date().toLocaleDateString('sv-SE')

const INST_STATUS_CLS: Record<InstitutionEvaluation['status'], string> = {
  '未着手': 'text-gray-400 border border-gray-200',
  '対応中': 'text-brand-700 bg-brand-50 border border-brand-200',
  '請求中': 'text-brand-700 bg-brand-50 border border-brand-200',
  '要確認': 'text-amber-700 bg-amber-50 border border-amber-200',
  '完了': 'text-gray-400 bg-gray-100',
  '調査禁止中': 'text-gray-600 bg-gray-100 border border-gray-300',
}

type Props = {
  caseId: string
  kind: Kind
  scopePrefix: string
  assets: FinancialAssetRow[]
  institutions: FinancialInstitutionRow[]
  requests: FinancialRequestRow[]
  requestItems: FinancialRequestItemRow[]
  holdings: SecuritiesHoldingRow[]
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  onRefresh?: () => void
  roles?: CaseRow['intake_roles']
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  contractDocs?: ContractDocumentRow[]
  focus?: string | null   // タスク詳細からの着地：金融機関名
}

export default function FinancialSection({ caseId, kind, scopePrefix, assets, institutions: rawInstitutions, requests: allRequests, requestItems: allItems, holdings: allHoldings, caseData, onRefresh, focus }: Props) {
  const supabase = createClient()
  const memberId = useCurrentMember(null)
  const today = todayYmd()
  // 保存できた値を、サーバー再取得が返るまで手元に重ねる（チェックしてから画面が変わるまでのラグをなくす）。
  // サーバーの値が変わったら上書きは剥がす（他の人の編集を消さないため）。
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<FinancialInstitutionRow>>>({})
  const [seenRaw, setSeenRaw] = useState(rawInstitutions)
  if (seenRaw !== rawInstitutions) { setSeenRaw(rawInstitutions); setLocalEdits({}) }
  const allInstitutions = useMemo(() => rawInstitutions.map(i => (localEdits[i.id] ? { ...i, ...localEdits[i.id] } : i)), [rawInstitutions, localEdits])

  const institutions = useMemo(() => allInstitutions.filter(i => KINDS_OF[kind].includes(i.kind)).sort((a, b) => a.sort_order - b.sort_order || collator.compare(a.name, b.name)), [allInstitutions, kind])
  const [sub, setSub] = useState<string>(() => (focus && institutions.some(i => i.name.trim() === focus)) ? (institutions.find(i => i.name.trim() === focus)?.id ?? 'top') : 'top')
  const [tab, setTab] = useState<'procedure' | 'accounts' | 'requests' | 'holdings'>('procedure')
  const [addOpen, setAddOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [arrivalId, setArrivalId] = useState<string | null>(null)

  const seal = sealCertificateStatus(caseData, today)
  // 請求登録の「原本を同封」の横に出す、手元の通数と期限。要る場面はここだけ
  const sealInfoText = (() => {
    const o = sealOriginalStatus(caseData.seal_cert_copies, allRequests, allInstitutions)
    const parts: string[] = []
    if (o.inHand != null) parts.push(`手元に${o.inHand}通`)
    if (seal.expiry) parts.push(`期限 ${seal.expiry.slice(5).replace('-', '/')}`)
    if (o.out.length > 0) parts.push(o.out.map(x => `${x.institutionName}へ提出中`).join('・'))
    return parts.join('・') || '契約手続きに発行日・通数が未登録'
  })()
  const evalOf = (inst: FinancialInstitutionRow): InstitutionEvaluation => {
    const reqs = allRequests.filter(r => r.institution_id === inst.id)
    const ids = new Set(reqs.map(r => r.id))
    return evaluateInstitution({ institution: inst, requests: reqs, items: allItems.filter(it => ids.has(it.request_id)), holdings: allHoldings.filter(h => h.institution_id === inst.id), seal, today })
  }
  const accountsOf = (inst: FinancialInstitutionRow) => assets.filter(a => a.institution_id === inst.id)
    .sort((a, b) => collator.compare(a.branch_name ?? '', b.branch_name ?? '') || ACCOUNT_TYPES.indexOf(a.account_type ?? 'その他') - ACCOUNT_TYPES.indexOf(b.account_type ?? 'その他'))

  const railItems = [
    { key: 'top', label: '一覧（TOP）' },
    ...institutions.map(i => ({
      key: i.id, label: i.name || '（名称未入力）',
      note: i.kind === '預金' ? null : i.kind,
      count: i.kind === '預金' ? accountsOf(i).length : i.kind === 'ほふり' ? null : allHoldings.filter(h => h.institution_id === i.id).length,
      received: allItems.some(it => allRequests.some(r => r.id === it.request_id && r.institution_id === i.id) && !!it.arrival_date),
    })),
  ]
  const active = institutions.find(i => i.id === sub) ?? null

  // ── 調査先の追加・削除 ──
  const addInstitution = async (form: { kind: FinancialInstitutionRow['kind']; name: string; branch: string; code: string }) => {
    const row: Record<string, unknown> = {
      case_id: caseId, kind: form.kind, name: form.name.trim(), branch_name: form.branch.trim() || null, institution_code: form.code.trim() || null,
      sort_order: institutions.length,
    }
    if (form.kind === '証券') row.search_required = false
    if (form.kind === 'ほふり') { row.name = '証券保管振替機構（ほふり）'; row.jasdec_company_known = '不明'; row.freeze_required = false; row.form_required = false }
    const { data, error } = await supabase.from('financial_institutions').insert(row).select('id').single()
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setAddOpen(false); setSub((data as { id: string }).id); setTab('procedure'); onRefresh?.()
  }
  const deleteInstitution = async (key: string) => {
    const inst = institutions.find(i => i.id === key); if (!inst) return
    const n = accountsOf(inst).length, m = allRequests.filter(r => r.institution_id === inst.id).length
    if (!window.confirm(`「${inst.name}」を削除します。\n口座 ${n}件・請求 ${m}件も一緒に消えます。よろしいですか？`)) return
    const { error } = await supabase.from('financial_institutions').delete().eq('id', inst.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    if (sub === key) setSub('top')
    onRefresh?.()
  }
  const saveInst = async (inst: FinancialInstitutionRow, patch: Partial<FinancialInstitutionRow>) => {
    setLocalEdits(prev => ({ ...prev, [inst.id]: { ...prev[inst.id], ...patch } }))   // 先に画面へ
    const { error } = await supabase.from('financial_institutions').update(patch).eq('id', inst.id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }
  const saveAsset = async (id: string, patch: Partial<FinancialAssetRow>) => {
    const { error } = await supabase.from('financial_assets').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }
  const addAccount = async (inst: FinancialInstitutionRow) => {
    const { error } = await supabase.from('financial_assets').insert({ case_id: caseId, asset_type: kind, institution_id: inst.id, institution_name: inst.name, branch_name: inst.branch_name, acquirer: inst.acquirer })
    if (error) { showToast(`追加に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }
  const deleteAccount = async (a: FinancialAssetRow) => {
    if (!window.confirm(`口座「${[a.branch_name, a.account_type, a.account_number].filter(Boolean).join('｜') || '未入力'}」を削除しますか？請求の対象口座からも外れます。`)) return
    const { error } = await supabase.from('financial_assets').delete().eq('id', a.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }
  const deleteRequest = async (r: FinancialRequestRow) => {
    if (!window.confirm('この請求を削除しますか？明細も一緒に消えます。')) return
    const { error } = await supabase.from('financial_requests').delete().eq('id', r.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-start">
        <LeftRail items={railItems} active={sub} onChange={k => { setSub(k); setTab('procedure') }} onDelete={deleteInstitution} extra={
          <button type="button" onClick={() => setAddOpen(true)} className="mt-1 text-left text-[11.5px] px-2.5 py-1.5 rounded-md border border-dashed border-gray-300 text-gray-500 hover:text-brand-700 hover:border-brand-300 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> 調査先
          </button>
        } />
        <div className="flex-1 min-w-0 space-y-3.5">
          {!active ? (
            <>
              <SealWarning caseData={caseData} requests={allRequests} institutions={allInstitutions} today={today} />
              <TopTable institutions={institutions} evalOf={evalOf} accountsOf={accountsOf} holdings={allHoldings} onOpen={id => { setSub(id); setTab('procedure') }} />
            </>
          ) : (
            <InstitutionPage
              inst={active} ev={evalOf(active)} accounts={accountsOf(active)}
              requests={allRequests.filter(r => r.institution_id === active.id).sort((a, b) => (b.request_date ?? '9999').localeCompare(a.request_date ?? '9999') || b.created_at.localeCompare(a.created_at))}
              items={allItems} holdings={allHoldings.filter(h => h.institution_id === active.id)}
              tab={tab} setTab={setTab} scopePrefix={scopePrefix} caseId={caseId} memberId={memberId} today={today}
              sealWarning={<SealWarning caseData={caseData} requests={allRequests} institutions={allInstitutions} today={today} />}
              saveInst={p => saveInst(active, p)} saveAsset={saveAsset} addAccount={() => addAccount(active)} deleteAccount={deleteAccount}
              openRequest={() => setRequestOpen(true)} openArrival={setArrivalId} deleteRequest={deleteRequest}
            />
          )}
        </div>
      </div>

      {addOpen && <AddInstitutionModal kind={kind} onClose={() => setAddOpen(false)} onSubmit={addInstitution} />}
      {active && requestOpen && (
        <FinancialRequestModal isOpen onClose={() => setRequestOpen(false)} institution={active} accounts={accountsOf(active)} defaultBalanceDate={caseData.date_of_death} sealInfo={sealInfoText} onSaved={() => onRefresh?.()} />
      )}
      {active && arrivalId && (() => {
        const r = allRequests.find(x => x.id === arrivalId); if (!r) return null
        return <FinancialArrivalModal isOpen onClose={() => setArrivalId(null)} request={r} items={allItems.filter(it => it.request_id === r.id)} accounts={accountsOf(active)} onSaved={() => onRefresh?.()} />
      })()}
    </div>
  )
}

// ── 印鑑登録証明書の期限警告 ─────────────────────────────────
// ふだんは何も出さない。通数や期限が要るのは請求を登録するときだけで、そこに出す。
// 使用期限まで30日以内・期限切れのときだけ、一覧と銀行ページの上に1行出す。
// 発行日・有効期間・通数の入力は契約手続きタブの受領書類の行。原本の所在は請求から出す。
function SealWarning({ caseData, requests, institutions, today }: {
  caseData: CaseRow; requests: FinancialRequestRow[]; institutions: FinancialInstitutionRow[]; today: string
}) {
  const st = sealCertificateStatus(caseData, today)
  if (st.status !== '期限間近' && st.status !== '期限切れ') return null
  const orig = sealOriginalStatus(caseData.seal_cert_copies, requests, institutions)
  const expired = st.status === '期限切れ'
  return (
    <div className={`mx-3.5 mt-2.5 rounded-md border px-3 py-1.5 flex items-center gap-3 flex-wrap text-[12px] ${expired ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      <span className="font-semibold">依頼者の印鑑登録証明書</span>
      <span>{expired ? `使用期限（${st.expiry?.replace(/-/g, '/')}）を過ぎています。差し替えが要ります` : `使用期限まであと${st.daysLeft}日（${st.expiry?.replace(/-/g, '/')}）`}</span>
      {orig.out.length > 0 && <span>原本：{orig.out.map(o => `${o.institutionName}へ提出中`).join('・')}</span>}
      <Link href={`/cases/${caseData.id}?tab=contractProc`} className="ml-auto inline-flex items-center gap-1 text-[11px] underline">契約手続きで確認 <ExternalLink className="w-3 h-3" /></Link>
    </div>
  )
}

// ── TOP：調査先の一覧 ─────────────────────────────────────────
function TopTable({ institutions, evalOf, accountsOf, holdings, onOpen }: {
  institutions: FinancialInstitutionRow[]
  evalOf: (i: FinancialInstitutionRow) => InstitutionEvaluation
  accountsOf: (i: FinancialInstitutionRow) => FinancialAssetRow[]
  holdings: SecuritiesHoldingRow[]
  onOpen: (id: string) => void
}) {
  const total = institutions.reduce((s, i) => s + accountsOf(i).reduce((x, a) => x + (a.balance_amount ?? 0), 0) + holdings.filter(h => h.institution_id === i.id).reduce((x, h) => x + (h.amount ?? ((h.quantity ?? 0) * (h.unit_price ?? 0))), 0), 0)
  return (
    <div>
      <SectionHeading title="調査先の一覧" hint="行を押すとその調査先を開きます。工程と次の対応は入力内容から自動で出ます。" className="mb-1.5 pb-1.5 border-b border-gray-200" />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 820 }}>
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300 text-[12.5px] text-gray-600">
              {/* 調査先に幅を付けないと余った幅を全部取って表が間延びする。伸びるのは「次の対応」だけにする */}
              <th className="px-2.5 py-2 text-left font-semibold w-60">調査先</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">種別</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">口座・銘柄</th>
              <th className="px-2.5 py-2 text-left font-semibold w-28">工程</th>
              <th className="px-2.5 py-2 text-left font-semibold">次の対応</th>
              <th className="px-2.5 py-2 text-left font-semibold w-20">期限</th>
              <th className="px-2.5 py-2 text-right font-semibold w-32">残高・評価額</th>
            </tr>
          </thead>
          <tbody>
            {institutions.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">調査先がありません。左下の「＋ 調査先」から追加してください。</td></tr>
            ) : institutions.map(i => {
              const ev = evalOf(i)
              const accs = accountsOf(i)
              const hs = holdings.filter(h => h.institution_id === i.id)
              const amount = accs.reduce((x, a) => x + (a.balance_amount ?? 0), 0) + hs.reduce((x, h) => x + (h.amount ?? ((h.quantity ?? 0) * (h.unit_price ?? 0))), 0)
              return (
                <tr key={i.id} onClick={() => onOpen(i.id)} className="border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-brand-50/30">
                  <td className="px-2.5 py-2 font-medium text-gray-800">{i.name}{i.branch_name && <span className="ml-1.5 text-[11px] text-gray-400">{i.branch_name}</span>}</td>
                  <td className="px-2.5 py-2 text-gray-600">{i.kind}</td>
                  <td className="px-2.5 py-2 text-gray-600">{i.kind === 'ほふり' ? '案件単位' : i.kind === '預金' ? `${accs.length}口座` : `${hs.length}銘柄`}</td>
                  <td className="px-2.5 py-2"><span className={`inline-block whitespace-nowrap text-[10.5px] px-2 py-[1px] rounded-full font-semibold ${INST_STATUS_CLS[ev.status]}`}>{stageLabel(ev)}</span></td>
                  <td className="px-2.5 py-2 text-gray-700">{ev.next}{ev.parallelNext && <span className="block text-[10.5px] text-gray-400">並行：{ev.parallelNext}</span>}</td>
                  <td className="px-2.5 py-2 text-gray-600">{md(ev.nextDeadline)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{amount ? yen(amount) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
          {institutions.length > 0 && (
            <tfoot><tr className="bg-gray-50 font-semibold text-gray-700"><td className="px-2.5 py-2 text-right" colSpan={6}>合計（入力済みの金額）</td><td className="px-2.5 py-2 text-right tabular-nums">{yen(total)}</td></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ── 調査先のページ ────────────────────────────────────────────
function InstitutionPage({ inst, ev, accounts, requests, items, holdings, tab, setTab, scopePrefix, caseId, memberId, today, sealWarning, saveInst, saveAsset, addAccount, deleteAccount, openRequest, openArrival, deleteRequest }: {
  inst: FinancialInstitutionRow; ev: InstitutionEvaluation; accounts: FinancialAssetRow[]
  requests: FinancialRequestRow[]; items: FinancialRequestItemRow[]; holdings: SecuritiesHoldingRow[]
  tab: 'procedure' | 'accounts' | 'requests' | 'holdings'; setTab: (t: 'procedure' | 'accounts' | 'requests' | 'holdings') => void
  scopePrefix: string; caseId: string; memberId: string | null; today: string
  /** 印鑑登録証明書の期限警告（期限間近・切れのときだけ中身がある） */
  sealWarning: React.ReactNode
  saveInst: (p: Partial<FinancialInstitutionRow>) => Promise<void>
  saveAsset: (id: string, p: Partial<FinancialAssetRow>) => Promise<void>
  addAccount: () => void; deleteAccount: (a: FinancialAssetRow) => void
  openRequest: () => void; openArrival: (id: string) => void; deleteRequest: (r: FinancialRequestRow) => void
}) {
  const isDeposit = inst.kind === '預金', isSec = inst.kind === '証券', isAdmin = inst.kind === '株主名簿管理人', isJasdec = inst.kind === 'ほふり'
  const reqItems = (r: FinancialRequestRow) => items.filter(it => it.request_id === r.id)
  const tabs: Array<{ key: typeof tab; label: string; count?: number }> = [
    { key: 'procedure', label: '手続き' },
    ...(isDeposit ? [{ key: 'accounts' as const, label: '口座', count: accounts.length }] : []),
    ...(!isJasdec ? [{ key: 'requests' as const, label: '請求', count: requests.length }] : []),
    ...(isSec || isAdmin ? [{ key: 'holdings' as const, label: '銘柄', count: holdings.length }] : []),
  ]
  return (
    <div className="space-y-3.5">
      <ProgressSummary caseId={caseId} scopeKey={`${scopePrefix}_inst_${inst.id}`} title={`進捗/結果（${inst.name}）`} />
      <div className="bg-white">
        {/* 銀行名の見出しは置かない。どの銀行かは左レール（選択中）と進捗タイトルで分かる。
            名前・種別の修正は手続きタブ「この銀行の前提」の先頭行。状態は右の「次の対応」が言う */}
        {sealWarning}
        <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 border-b border-gray-200">
          <SubTabs tabs={tabs} active={tab} onChange={k => setTab(k as typeof tab)} />
          <div className="min-w-0 text-right text-[13px] text-gray-500 truncate">
            次の対応
            <span className="ml-2 text-[14px] font-semibold text-gray-800">{ev.next}</span>
            {ev.nextDeadline && <span className="ml-2 text-[13px] text-amber-700">期限 {ev.nextDeadline.slice(5).replace('-', '/')}</span>}
            {ev.parallelNext && <span className="ml-2 text-[12px] text-gray-500">並行：{ev.parallelNext}</span>}
          </div>
        </div>
        <div className="p-3.5">
          {tab === 'procedure' && (isJasdec ? <JasdecCard inst={inst} save={saveInst} /> : <ProcedureCards inst={inst} save={saveInst} memberId={memberId} today={today} />)}
          {tab === 'accounts' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11.5px] text-gray-500">支店 → 普通・定期・その他の順。残高証明・取引履歴の状態は請求から自動で入ります。</p>
                <button type="button" onClick={addAccount} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50"><Plus className="w-3.5 h-3.5" />口座を追加</button>
              </div>
              <table className="w-full text-[13px] border-collapse">
                <thead><tr className="bg-slate-100 border-b border-slate-300 text-[12.5px] text-gray-600">
                  <th className="px-2 py-2 text-left font-semibold w-40">支店</th><th className="px-2 py-2 text-left font-semibold w-24">種別</th><th className="px-2 py-2 text-left font-semibold w-36">口座番号</th>
                  <th className="px-2 py-2 text-left font-semibold w-28">残高証明</th><th className="px-2 py-2 text-left font-semibold w-28">取引履歴</th><th className="px-2 py-2 text-right font-semibold w-36">残高</th><th className="px-2 py-2 text-left font-semibold">備考</th><th className="w-8" />
                </tr></thead>
                <tbody>
                  {accounts.length === 0 ? <tr><td colSpan={8} className="px-3 py-5 text-center text-gray-400">口座がありません</td></tr> : accounts.map(a => {
                    const b = accountDocStatus(a.id, '残高証明', (a.balance_cert_required ?? '要') !== '不要', requests, items)
                    const h = accountDocStatus(a.id, '取引履歴', (a.transaction_detail_required ?? '') === '要', requests, items)
                    return (
                      <tr key={a.id} className="border-b border-gray-100 last:border-b-0 [&>td]:align-top">
                        <td className="px-2 py-1.5"><TxtCell value={a.branch_name} onCommit={v => void saveAsset(a.id, { branch_name: v || null })} placeholder="支店" /></td>
                        <td className="px-2 py-1.5"><SelCell value={a.account_type} options={ACCOUNT_TYPES} onChange={v => void saveAsset(a.id, { account_type: v || null })} /></td>
                        <td className="px-2 py-1.5 font-mono"><TxtCell value={a.account_number} onCommit={v => void saveAsset(a.id, { account_number: v || null })} placeholder="全桁" /></td>
                        <td className="px-2 py-1.5"><StatusChip s={b.label} />{b.count && <span className="ml-1 text-[10.5px] text-gray-400">{b.count}</span>}</td>
                        <td className="px-2 py-1.5"><StatusChip s={h.label} />{h.count && <span className="ml-1 text-[10.5px] text-gray-400">{h.count}</span>}</td>
                        <td className="px-2 py-1.5"><MoneyCell value={a.balance_amount} onCommit={v => void saveAsset(a.id, { balance_amount: v === '' ? null : Number(v) })} /></td>
                        <td className="px-2 py-1.5"><TxtCell value={a.notes} onCommit={v => void saveAsset(a.id, { notes: v || null })} placeholder="—" /></td>
                        <td className="px-1 py-1.5 text-center"><button type="button" onClick={() => deleteAccount(a)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'requests' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11.5px] text-gray-500">1行＝金融機関へ一度に出したまとまり。到着日は受信簿のW-Checkで入ります。</p>
                <button type="button" onClick={openRequest} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700"><Plus className="w-3.5 h-3.5" />請求を登録</button>
              </div>
              <table className="w-full text-[13px] border-collapse">
                <thead><tr className="bg-slate-100 border-b border-slate-300 text-[12.5px] text-gray-600">
                  <th className="px-2 py-2 text-left font-semibold w-28">請求内容</th><th className="px-2 py-2 text-left font-semibold">指定日・期間</th><th className="px-2 py-2 text-left font-semibold">対象口座</th>
                  <th className="px-2 py-2 text-left font-semibold w-24">請求日</th><th className="px-2 py-2 text-left font-semibold w-24">到着</th><th className="px-2 py-2 text-left font-semibold w-24">状況</th><th className="w-40" />
                </tr></thead>
                <tbody>
                  {requests.length === 0 ? <tr><td colSpan={7} className="px-3 py-5 text-center text-gray-400">請求がありません</td></tr> : requests.map(r => {
                    const its = reqItems(r)
                    const arrived = its.filter(it => !!it.arrival_date).length
                    const accIds = [...new Set(its.flatMap(it => (it.financial_request_item_accounts ?? []).map(a => a.asset_id)))]
                    return (
                      <tr key={r.id} className="border-b border-gray-100 last:border-b-0 [&>td]:align-top">
                        <td className="px-2 py-2 font-medium text-gray-800">{[...new Set(its.map(it => it.doc_type))].map(t => <div key={t}>{t}</div>)}</td>
                        <td className="px-2 py-2 text-gray-700">{its.map(it => <div key={it.id}>{itemConditionLabel(it)}</div>)}</td>
                        <td className="px-2 py-2 text-gray-600 font-mono text-[11px]">{isSec ? '保有口座全体' : accIds.map(id => { const a = accounts.find(x => x.id === id); return <div key={id}>{a ? [a.branch_name, a.account_type, a.account_number].filter(Boolean).join('｜') : '—'}</div> })}</td>
                        <td className="px-2 py-2 text-gray-700">{md(r.request_date)}</td>
                        <td className="px-2 py-2 text-gray-700">{its.length === 0 ? '—' : arrived === its.length ? '到着済' : arrived > 0 ? `一部到着 ${arrived}/${its.length}` : '未到着'}</td>
                        <td className="px-2 py-2"><StatusChip s={requestStatus(r, its)} /></td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <button type="button" onClick={() => openArrival(r.id)} className="text-[12px] font-semibold text-brand-700 hover:underline">{r.request_date ? '到着処理' : '請求日を登録'}</button>
                          <button type="button" onClick={() => deleteRequest(r)} className="ml-2 text-gray-300 hover:text-red-500 align-middle" title="削除"><Trash2 className="w-3.5 h-3.5 inline" /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'holdings' && (
            <p className="text-[12px] text-gray-500 px-1 py-4">銘柄の登録と株主名簿管理人の特定は段階4で作ります。いまは従来の銘柄明細（証券タブ）をご利用ください。</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 手続きカード（Step1〜4）。項目名が左・入力欄が右（戸籍タブと同じ PracticeGroup / PracticeRow） ──
const chipStatus = (done: boolean, started: boolean) => (done ? '取得済' : started ? '請求中' : '請求準備中')

/** 見出し右端の「不要」チェック。ふだんは要なので触らず、要らないときだけチェックする */
function NotNeeded({ required, onChange }: { required: boolean; onChange: (required: boolean) => void }) {
  const off = !required
  return (
    <label className={`inline-flex items-center gap-1 text-[11px] cursor-pointer px-1.5 py-0.5 rounded border ${off ? 'border-gray-400 bg-gray-200 text-gray-700 font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
      <input type="checkbox" checked={off} onChange={e => onChange(!e.target.checked)} className="w-3.5 h-3.5 accent-gray-600" />
      不要
    </label>
  )
}

function ProcedureCards({ inst: i, save, memberId, today }: { inst: FinancialInstitutionRow; save: (p: Partial<FinancialInstitutionRow>) => Promise<void>; memberId: string | null; today: string }) {
  const isSec = i.kind === '証券', isAdmin = i.kind === '株主名簿管理人'
  const formDone = !!i.form_arrival_date || (i.form_source === '社内在庫' && !!i.form_stock_date)
  const formStarted = !!i.form_request_date || !!i.form_stock_date
  const searchLabel = i.search_submission_method === '郵送'
    ? (i.search_method === '要原本確認' ? '原本発送日' : '調査請求書発送日')
    : (i.search_method === '要原本確認' ? '原本提出日（来店日）' : '調査請求日（来店日）')
  const onHold = (i.survey_prohibited_designation ?? '') === '指定あり'
  const muted = <span className="text-[11px] text-gray-400">—</span>
  return (
    <div className="space-y-2.5">
      {/* この銀行の前提。誰が請求するか（取得区分）と、お客様の「まだ調べないで」（調査禁止）。
          どちらも Step1 より前に決まることなので、工程の上に置く。調査禁止が立っている間はどの工程も進めない */}
      <PracticeGroup title="この銀行の前提" right={onHold ? <span className="text-[12px] font-semibold px-2 py-[1px] bg-gray-200 text-gray-700">調査禁止中</span> : undefined}>
        <PracticeRow label="金融機関名"><TxtCell value={i.name} onCommit={v => { if (v.trim()) void save({ name: v.trim() }) }} placeholder="金融機関名" /></PracticeRow>
        <PracticeRow label="種別"><span>{i.kind}</span></PracticeRow>
        <PracticeRow label="取得区分" hint="自社＝うちが請求する。依頼者＝依頼者が自分で取ってくる（請求のタスクは出ない）">
          <SelCell value={i.acquirer} options={['自社', '依頼者']} onChange={v => void save({ acquirer: v || '自社' })} />
        </PracticeRow>
        <PracticeRow label="調査禁止指定" hint="お客様から「まだ調べないで」と言われているとき。期間指定なら終了日まで、連絡待ちなら解除するまで、この調査先は止まる。">
          <SelCell value={i.survey_prohibited_designation ?? '指定なし'} options={[...SURVEY_BAN_DESIGNATIONS]} onChange={v => void save({ survey_prohibited_designation: v || '指定なし' })} />
        </PracticeRow>
        {onHold && (<>
          <PracticeRow label="禁止方法"><SelCell value={i.survey_prohibited_method} options={[...SURVEY_BAN_METHODS]} onChange={v => void save({ survey_prohibited_method: v || null })} /></PracticeRow>
          <PracticeRow label="理由"><TxtCell value={i.survey_prohibited_reason} onCommit={v => void save({ survey_prohibited_reason: v || null })} placeholder="禁止理由" /></PracticeRow>
          {i.survey_prohibited_method === '期間指定' ? (<>
            <PracticeRow label="開始日"><DateCell value={i.survey_prohibited_start} onCommit={v => void save({ survey_prohibited_start: v || null })} /></PracticeRow>
            <PracticeRow label="終了日"><DateCell value={i.survey_prohibited_end} onCommit={v => void save({ survey_prohibited_end: v || null })} /></PracticeRow>
          </>) : (
            <PracticeRow label="お客様の連絡" full>
              {i.prohibition_released_at
                ? <span className="text-[12px] text-emerald-700">連絡あり・解除済 {i.prohibition_released_at.slice(0, 10)}</span>
                : <button type="button" onClick={() => void save({ prohibition_released_at: new Date().toISOString() })} className="px-2.5 py-1 rounded-md text-[12px] font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50">お客様からOKの連絡があった（解除）</button>}
            </PracticeRow>
          )}
        </>)}
      </PracticeGroup>

      {!isAdmin && (
        <PracticeGroup no="Step1" title={isSec ? '死亡連絡' : '口座凍結'} sub={isSec ? '口座名義人の死亡を証券会社へ連絡' : '口座名義人の死亡連絡による一括凍結'}
          tone={i.freeze_required ? 'normal' : 'muted'}
          right={<><NotNeeded required={i.freeze_required} onChange={v => void save({ freeze_required: v })} />{i.freeze_required && <StatusChip s={i.freeze_date ? '取得済' : '請求準備中'} />}</>}>
          {i.freeze_required && (<>
            <PracticeRow label={isSec ? '死亡連絡日' : '凍結依頼日（凍結日）'}><DateCell value={i.freeze_date} onCommit={v => void save({ freeze_date: v || null })} /></PracticeRow>
            {!isSec ? (
              <PracticeRow label="凍結してよいか" sub="管理担当の確認" hint="解約に進む前のゲート。確認したらチェック。">
                <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={i.freeze_confirmed} onChange={e => void save(e.target.checked
                    ? { freeze_confirmed: true, freeze_confirmed_at: new Date().toISOString(), freeze_confirmed_by: memberId }
                    : { freeze_confirmed: false, freeze_confirmed_at: null, freeze_confirmed_by: null, freeze_confirmed_name: null })} className="w-4 h-4 accent-emerald-600" />
                  {i.freeze_confirmed ? <span className="text-emerald-700 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" />確認済{i.freeze_confirmed_name ? `（${i.freeze_confirmed_name}）` : ''}</span> : <span className="text-gray-500">未確認</span>}
                </label>
              </PracticeRow>
            ) : <PracticeRow label=" ">{muted}</PracticeRow>}
          </>)}
        </PracticeGroup>
      )}

      <PracticeGroup no="Step2" title="依頼書の手配" sub={isAdmin ? '所有株式数証明書等の請求書式' : isSec ? '残高証明書等を取るための証券会社所定書式' : '金融機関所定書式の取り寄せ、または社内在庫'}
        tone={i.form_required ? 'normal' : 'muted'}
        right={<><NotNeeded required={i.form_required} onChange={v => void save({ form_required: v })} />{i.form_required && <StatusChip s={chipStatus(formDone, formStarted)} />}</>}>
        {i.form_required && (<>
          <PracticeRow label="入手方法"><SelCell value={i.form_source} options={[...FORM_SOURCES]} onChange={v => void save({ form_source: v || '未確認' })} /></PracticeRow>
          {i.form_source === '金融機関へ請求' && <PracticeRow label="請求日"><DateCell value={i.form_request_date} onCommit={v => void save({ form_request_date: v || null })} /></PracticeRow>}
          {i.form_source === '金融機関へ請求' && <PracticeRow label="到着日"><DateCell value={i.form_arrival_date} onCommit={v => void save({ form_arrival_date: v || null })} /></PracticeRow>}
          {i.form_source === '社内在庫' && <PracticeRow label="在庫確認日"><DateCell value={i.form_stock_date} onCommit={v => void save({ form_stock_date: v || null })} /></PracticeRow>}
          {i.form_source === '未確認' && <PracticeRow label=" "><span className="text-[11px] text-gray-500">未確認のままだと次に進めません</span></PracticeRow>}
        </>)}
      </PracticeGroup>

      {!isAdmin && (
        <PracticeGroup no="Step3" title="全店調査" sub="他支店・旧取引店を含む口座の有無（並行して進める）"
          tone={i.search_required ? 'normal' : 'muted'}
          right={<><NotNeeded required={i.search_required} onChange={v => void save({ search_required: v })} />{i.search_required && <StatusChip s={i.search_answer_date ? '取得済' : i.search_request_date ? '請求中' : '請求準備中'} />}</>}>
          {i.search_required && (<>
            <PracticeRow label="調査方法" hint="金融機関によって回答の条件が違う。電話回答／要原本確認（戸籍・委任状の原本を出す）／要請求（正式な調査請求書）">
              <SelCell value={i.search_method} options={[...SEARCH_METHODS]} onChange={v => void save({ search_method: v || '未確認' })} />
            </PracticeRow>
            {i.search_method === '未確認' && <PracticeRow label=" "><span className="text-[11px] text-gray-500">金融機関へ確認し、回答条件に合う調査方法を選んでください</span></PracticeRow>}
            {i.search_method === '電話回答' && (<>
              <PracticeRow label="確認日"><DateCell value={i.search_answer_date} onCommit={v => void save({ search_answer_date: v || null })} /></PracticeRow>
              <PracticeRow label="回答者" sub="金融機関担当者名"><TxtCell value={i.search_responder} onCommit={v => void save({ search_responder: v || null })} placeholder="例：相続担当 佐藤様" /></PracticeRow>
            </>)}
            {(i.search_method === '要原本確認' || i.search_method === '要請求') && (<>
              <PracticeRow label={i.search_method === '要原本確認' ? '原本提出方法' : '調査請求方法'}><SelCell value={i.search_submission_method} options={[...SUBMISSION_METHODS]} onChange={v => void save({ search_submission_method: v || '未確認' })} /></PracticeRow>
              <PracticeRow label={searchLabel}>{i.search_submission_method === '未確認' ? <span className="text-[11px] text-gray-400">提出方法を選ぶと入力できます</span> : <DateCell value={i.search_request_date} onCommit={v => void save({ search_request_date: v || null })} />}</PracticeRow>
              <PracticeRow label="回答日"><DateCell value={i.search_answer_date} onCommit={v => void save({ search_answer_date: v || null })} /></PracticeRow>
            </>)}
            <PracticeRow label="調査対象" full>
              {SEARCH_TARGETS.map(t => {
                const on = i.search_targets.includes(t)
                return <button key={t} type="button" onClick={() => void save({ search_targets: on ? i.search_targets.filter(x => x !== t) : [...i.search_targets, t] })}
                  className={`px-2 py-0.5 text-[11px] rounded border ${on ? 'bg-brand-50 text-brand-700 border-brand-300 font-semibold' : 'bg-white text-gray-500 border-gray-200'}`}>{t}</button>
              })}
              <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                <input type="checkbox" checked={i.search_all_accounts_registered} onChange={e => void save({ search_all_accounts_registered: e.target.checked })} className="w-3.5 h-3.5 accent-brand-600" />判明した口座をすべて口座一覧に登録済み
              </label>
            </PracticeRow>
          </>)}
        </PracticeGroup>
      )}

      {!isAdmin && (
        <PracticeGroup no="Step4" title="証明書発行依頼の方法" sub="郵送か来店か。以降の工程がここで分かれる"
          right={<StatusChip s={i.handling_method === '未確認' ? '請求準備中' : '取得済'} />}>
          <PracticeRow label="対応方法"><SelCell value={i.handling_method} options={[...HANDLING_METHODS]} onChange={v => void save({ handling_method: v || '未確認', ...(v !== '未確認' && !i.method_confirm_date ? { method_confirm_date: today } : {}) })} /></PracticeRow>
          <PracticeRow label="対応方法確認日"><DateCell value={i.method_confirm_date} onCommit={v => void save({ method_confirm_date: v || null })} /></PracticeRow>
          {i.handling_method === '来店' && <PracticeRow label="来店日" sub="予約済みの訪問日"><DateCell value={i.visit_date} onCommit={v => void save({ visit_date: v || null })} /></PracticeRow>}
          <PracticeRow label="工程" full>
            <div className="w-full"><MethodSteps inst={i} formDone={formDone} onPrepDone={() => void save({ visit_prep_done_at: new Date().toISOString(), visit_prep_done_by: memberId })} onPrepUndo={() => void save({ visit_prep_done_at: null, visit_prep_done_by: null })} /></div>
          </PracticeRow>
        </PracticeGroup>
      )}
    </div>
  )
}

function MethodSteps({ inst: i, formDone, onPrepDone, onPrepUndo }: { inst: FinancialInstitutionRow; formDone: boolean; onPrepDone: () => void; onPrepUndo: () => void }) {
  if (i.handling_method === '未確認') return <p className="text-[11px] text-gray-400">対応方法を選ぶと、以降の工程が出ます。</p>
  const steps: Array<{ title: string; detail: string; state: 'done' | 'now' | 'wait' }> = i.handling_method === '郵送'
    ? [
        { title: '依頼書到着・確保', detail: '到着または社内在庫', state: formDone ? 'done' : 'now' },
        { title: '依頼書発送', detail: '請求を登録して請求日を入れる', state: formDone ? 'now' : 'wait' },
      ]
    : [
        { title: '依頼書到着・確保', detail: '到着または社内在庫', state: formDone ? 'done' : 'now' },
        { title: '来店予約', detail: '来店日を入れる', state: !formDone ? 'wait' : i.visit_date ? 'done' : 'now' },
        { title: '来店準備', detail: i.visit_date ? `期限 ${new Date(new Date(`${i.visit_date}T00:00:00`).getTime() - 2 * 86400000).toLocaleDateString('sv-SE').slice(5).replace('-', '/')}（前々日）` : '依頼書・戸籍・本人確認資料・印鑑', state: !i.visit_date ? 'wait' : i.visit_prep_done_at ? 'done' : 'now' },
        { title: '来店（証明書発行依頼）', detail: '来店日を請求日として入れる', state: i.visit_prep_done_at ? 'now' : 'wait' },
      ]
  return (
    <div className="mt-1">
      <div className="flex">
        {steps.map((s, idx) => (
          <div key={s.title} className="flex-1 text-center relative">
            {idx < steps.length - 1 && <div className="absolute top-[9px] left-1/2 right-[-50%] h-px bg-gray-200" />}
            <div className={`relative z-10 w-[18px] h-[18px] mx-auto rounded-full text-[10px] font-bold flex items-center justify-center ${s.state === 'done' ? 'bg-emerald-600 text-white' : s.state === 'now' ? 'bg-brand-600 text-white' : 'bg-gray-300 text-white'}`}>{s.state === 'done' ? '✓' : idx + 1}</div>
            <div className={`mt-1 text-[11px] ${s.state === 'wait' ? 'text-gray-400' : 'text-gray-800 font-semibold'}`}>{s.title}</div>
            <div className="text-[10px] text-gray-400">{s.detail}</div>
          </div>
        ))}
      </div>
      {i.handling_method === '来店' && i.visit_date && (
        <div className="mt-2 flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5">
          <span className="text-[11px] text-gray-600">来店準備の完了：依頼書・戸籍・本人確認資料・印鑑が揃った時点で押す（この工程だけ手で完了にする）</span>
          {i.visit_prep_done_at
            ? <button type="button" onClick={onPrepUndo} className="ml-auto text-[11px] text-gray-500 underline">完了を取り消す（{i.visit_prep_done_at.slice(0, 10)}）</button>
            : <button type="button" onClick={onPrepDone} className="ml-auto px-3 py-1 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700">来店準備を完了</button>}
        </div>
      )}
    </div>
  )
}

// ── ほふり ─────────────────────────────────────────────────────
function JasdecCard({ inst: i, save }: { inst: FinancialInstitutionRow; save: (p: Partial<FinancialInstitutionRow>) => Promise<void> }) {
  return (
    <div className="space-y-2.5">
      <PracticeGroup title="この調査先の前提" sub="ほふりは証券会社ではなく、開示結果から証券会社を追加する起点">
        <PracticeRow label="名称"><TxtCell value={i.name} onCommit={v => { if (v.trim()) void save({ name: v.trim() }) }} placeholder="名称" /></PracticeRow>
        <PracticeRow label="種別"><span>{i.kind}</span></PracticeRow>
      </PracticeGroup>
      <PracticeGroup no="Step1" title="開示請求" sub="登録済加入者情報の開示請求" right={<StatusChip s={i.jasdec_arrival_date ? '取得済' : i.jasdec_request_date ? '請求中' : '請求準備中'} />}>
        <PracticeRow label="判明状況"><SelCell value={i.jasdec_company_known} options={[...JASDEC_KNOWN]} onChange={v => void save({ jasdec_company_known: v || null })} /></PracticeRow>
        <PracticeRow label="開示請求日"><DateCell value={i.jasdec_request_date} onCommit={v => void save({ jasdec_request_date: v || null })} /></PracticeRow>
        <PracticeRow label="結果到着日"><DateCell value={i.jasdec_arrival_date} onCommit={v => void save({ jasdec_arrival_date: v || null })} /></PracticeRow>
        <PracticeRow label="調査対象住所" sub="現住所・旧住所。複数可" full><TxtCell value={i.jasdec_searched_addresses} onCommit={v => void save({ jasdec_searched_addresses: v || null })} placeholder="住所を「、」区切りで" /></PracticeRow>
        <PracticeRow label="判明した証券会社" full><TxtCell value={i.jasdec_result_institutions} onCommit={v => void save({ jasdec_result_institutions: v || null })} placeholder="例：○○証券、△△証券" /></PracticeRow>
      </PracticeGroup>
    </div>
  )
}

// ── 調査先を追加 ──────────────────────────────────────────────
function AddInstitutionModal({ kind, onClose, onSubmit }: { kind: Kind; onClose: () => void; onSubmit: (f: { kind: FinancialInstitutionRow['kind']; name: string; branch: string; code: string }) => Promise<void> }) {
  const options = KINDS_OF[kind]
  const [k, setK] = useState<FinancialInstitutionRow['kind']>(options[0])
  const [name, setName] = useState(''); const [branch, setBranch] = useState(''); const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const inp = 'w-full px-2 py-1.5 text-[13px] border border-gray-300 rounded bg-white outline-none focus:border-brand-500'
  const isJasdec = k === 'ほふり'
  return (
    <Modal isOpen onClose={onClose} title="調査先を追加" maxWidth="max-w-md" footer={<>
      <Button variant="secondary" onClick={onClose} disabled={busy}>キャンセル</Button>
      <Button variant="primary" loading={busy} disabled={!isJasdec && !name.trim()} onClick={async () => { setBusy(true); await onSubmit({ kind: k, name, branch, code }); setBusy(false) }}>追加する</Button>
    </>}>
      <div className="space-y-3 text-[13px]">
        {options.length > 1 && (
          <label className="block"><span className="text-[11.5px] text-gray-500">種別</span>
            <select value={k} onChange={e => setK(e.target.value as FinancialInstitutionRow['kind'])} style={{ fontFamily: 'inherit' }} className={inp}>
              {options.map(o => <option key={o} value={o}>{o === 'ほふり' ? '証券会社が不明（ほふりに開示請求）' : o}</option>)}
            </select>
          </label>
        )}
        {!isJasdec && <>
          <label className="block"><span className="text-[11.5px] text-gray-500">{k === '株主名簿管理人' ? '株主名簿管理人（信託銀行等）' : k === '証券' ? '証券会社名' : '金融機関名'} <span className="text-red-500">*</span></span><input value={name} onChange={e => setName(e.target.value)} className={inp} placeholder={k === '預金' ? '例：横浜銀行' : k === '証券' ? '例：東都証券' : '例：三菱UFJ信託銀行'} autoFocus /></label>
          {k !== '株主名簿管理人' && <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-[11.5px] text-gray-500">支店名（任意）</span><input value={branch} onChange={e => setBranch(e.target.value)} className={inp} placeholder="例：横浜駅前支店" /></label>
            <label className="block"><span className="text-[11.5px] text-gray-500">金融機関コード（任意）</span><input value={code} onChange={e => setCode(e.target.value)} className={inp} placeholder="例：0138" /></label>
          </div>}
        </>}
        {isJasdec && <p className="text-[12px] text-gray-600">証券保管振替機構（ほふり）を調査先として1件追加します。開示結果から証券会社を足していきます。</p>}
      </div>
    </Modal>
  )
}
