'use client'

// 金融財産調査（実務タブ）。調査先（金融機関）ごとに1ページ。
//
// いままでは口座の表1枚に、口座の話でないもの（凍結・全店調査・請求日・到着日）まで書いていた。
// ここでは「銀行に1回のこと」「口座のこと」「請求のこと」を3つのタブに分ける。
//   手続き … 工程図 → ①最初の連絡（凍結・依頼書・全店調査を同じ電話で） → ②郵送か来店か → ③請求タブへ
//   口座   … 支店・種別・口座番号・残高。状態は請求から自動で入る
//   請求   … 1行＝金融機関へ一度に出したまとまり。到着処理はここから
//
// 右上の「次の対応」と状況バッジは financialWorkflow が入力値から出す。ここでは選ばない。
// タスクは作らない。対応待ちに「担当する」を押した人だけ tasks に入る（段階3）。
// 印鑑登録証明書は案件に1つ（原本は1通）。上の帯に置き、機関ごとには持たない。

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Copy, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { LeftRail } from './LeftRail'
import { PracticeRow } from './PracticeCard'
import { SubTabs } from '@/components/ui/SubTabs'
import { SectionHeading } from '@/components/ui/InlineFields'
import ProgressSummary from './ProgressSummary'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { TxtCell, SelCell, DateCell, MoneyCell } from './PracticeTableCells'
import FinancialRequestModal from './FinancialRequestModal'
import FinancialArrivalModal, { StatusChip } from './FinancialArrivalModal'
import {
  evaluateInstitution, sealCertificateStatus, sealOriginalStatus, accountDocStatus, requestStatus, itemConditionLabel,
  procedureStage, formSecured, allBranchSearchDone,
  FORM_SOURCES, FORM_SOURCE_LABEL, SEARCH_METHODS, SEARCH_METHOD_LABEL, SUBMISSION_METHODS,
  HOLDING_KINDS, KNOWN_ADMINISTRATORS, JASDEC_RESULT_KINDS, JASDEC_ACCOUNT_KINDS, canonicalAdministratorName,
  type InstitutionEvaluation,
} from '@/lib/financialWorkflow'
import { normalizeTaskStatus, getStartSignal } from '@/lib/taskReadiness'
import { SURVEY_BAN_DESIGNATIONS, SURVEY_BAN_METHODS } from '@/lib/financialBan'
import type {
  FinancialAssetRow, FinancialInstitutionRow, FinancialRequestRow, FinancialRequestItemRow, SecuritiesHoldingRow, FinancialJasdecResultRow, CaseRow, TaskRow, ContractDocumentRow,
} from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Kind = '預貯金' | '証券' | '信託銀行' | '証券・信託'
/** 実務タブの種別 → 調査先の種別。「証券・信託」は証券会社・株主名簿管理人・ほふりを1つのタブで扱う
    （ほふりの開示結果から証券会社と信託銀行の特別口座が一緒に判明し、証券会社の銘柄から株主名簿管理人への請求が生まれるため） */
const KINDS_OF: Record<Kind, FinancialInstitutionRow['kind'][]> = { '預貯金': ['預金'], '証券': ['証券', 'ほふり'], '信託銀行': ['株主名簿管理人'], '証券・信託': ['証券', '株主名簿管理人', 'ほふり'] }
const JASDEC_NAME = '証券保管振替機構（ほふり）'
const ACCOUNT_TYPES = ['普通', '定期', '当座', '貯蓄', 'その他']
const collator = new Intl.Collator('ja')
const yen = (n: number | null) => (n == null ? '—' : `¥${Math.round(n).toLocaleString('ja-JP')}`)
const md = (d: string | null | undefined) => (d ? d.slice(5).replace('-', '/') : '—')
const todayYmd = () => new Date().toLocaleDateString('sv-SE')

type Props = {
  caseId: string
  kind: Kind
  scopePrefix: string
  assets: FinancialAssetRow[]
  institutions: FinancialInstitutionRow[]
  requests: FinancialRequestRow[]
  requestItems: FinancialRequestItemRow[]
  holdings: SecuritiesHoldingRow[]
  /** ほふり開示結果（証券・信託タブ） */
  jasdecResults?: FinancialJasdecResultRow[]
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  onRefresh?: () => void
  roles?: CaseRow['intake_roles']
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  contractDocs?: ContractDocumentRow[]
  focus?: string | null   // タスク詳細からの着地：金融機関名
}

export default function FinancialSection({ caseId, kind, scopePrefix, assets, institutions: rawInstitutions, requests: allRequests, requestItems: allItems, holdings: allHoldings, jasdecResults = [], caseData, patchCase, onRefresh, tasks = [], focus }: Props) {
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
    return evaluateInstitution({ institution: inst, requests: reqs, items: allItems.filter(it => ids.has(it.request_id)), holdings: allHoldings.filter(h => h.institution_id === inst.id), seal, today,
      jasdecResults: inst.kind === 'ほふり' ? jasdecResults.filter(r => r.jasdec_id === inst.id) : undefined })
  }
  // 口座は登録した順のまま。支店や種別で並べ直すと、種別を変えた瞬間に行が飛んで気持ち悪い
  const accountsOf = (inst: FinancialInstitutionRow) => assets.filter(a => a.institution_id === inst.id)
    .sort((a, b) => ((a as { created_at?: string }).created_at ?? '').localeCompare((b as { created_at?: string }).created_at ?? '') || a.id.localeCompare(b.id))

  const isSecTab = kind === '証券・信託'
  const jasdec = isSecTab ? (institutions.find(i => i.kind === 'ほふり') ?? null) : null
  const jasdecRows = jasdec ? jasdecResults.filter(r => r.jasdec_id === jasdec.id).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)) : []
  const railOf = (i: FinancialInstitutionRow) => ({
    key: i.id, label: i.name || '（名称未入力）',
    note: i.kind === '預金' || isSecTab ? null : i.kind,
    count: i.kind === '預金' ? accountsOf(i).length : i.kind === 'ほふり' ? null : allHoldings.filter(h => h.institution_id === i.id).length,
    received: allItems.some(it => allRequests.some(r => r.id === it.request_id && r.institution_id === i.id) && !!it.arrival_date),
  })
  const railItems = isSecTab
    ? [
        { key: 'top', label: '一覧（TOP）' },
        // ほふり照会は調査先ではなく案件に1つの入口。レールの先頭に固定で置く（無ければ押したときに作る）
        { key: 'jasdec', label: 'ほふり照会', note: jasdec ? (jasdec.jasdec_company_known === '調査不要' ? '不要' : jasdec.jasdec_arrival_date ? '結果あり' : jasdec.jasdec_request_date ? '回答待ち' : '未請求') : '未着手',
          dotColor: jasdec ? (jasdec.jasdec_company_known === '調査不要' || (jasdec.jasdec_arrival_date && jasdecRows.length > 0 && jasdecRows.every(r => !!r.institution_id)) ? '#059669' : jasdec.jasdec_request_date ? '#f59e0b' : '#9ca3af') : '#d1d5db' },
        { key: 'h-sec', label: '証券会社', heading: true },
        ...institutions.filter(i => i.kind === '証券').map(railOf),
        { key: 'h-adm', label: '株主名簿管理人（信託銀行等）', heading: true },
        ...institutions.filter(i => i.kind === '株主名簿管理人').map(railOf),
      ]
    : [{ key: 'top', label: '一覧（TOP）' }, ...institutions.map(railOf)]
  const active = sub === 'jasdec' ? jasdec : (institutions.find(i => i.id === sub && i.kind !== 'ほふり') ?? null)

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
  // ほふり照会を開く。まだ無ければ調査先（kind=ほふり）を作ってから開く
  const openJasdec = async () => {
    setSub('jasdec'); setTab('procedure')
    if (jasdec) return
    const { error } = await supabase.from('financial_institutions').insert({
      case_id: caseId, kind: 'ほふり', name: JASDEC_NAME, jasdec_company_known: '不明', freeze_required: false, form_required: false, search_required: false, sort_order: 0,
    })
    if (error) { showToast(`ほふり照会を作れませんでした: ${error.message}`, 'error'); return }
    onRefresh?.()
  }
  const addJasdecRow = async () => {
    if (!jasdec) return
    const { error } = await supabase.from('financial_jasdec_results').insert({ case_id: caseId, jasdec_id: jasdec.id, name: '', kind: '証券会社', account_kind: '取引口座', sort_order: jasdecRows.length })
    if (error) { showToast(`追加に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }
  const saveJasdecRow = async (id: string, patch: Partial<FinancialJasdecResultRow>) => {
    const { error } = await supabase.from('financial_jasdec_results').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }
  const deleteJasdecRow = async (r: FinancialJasdecResultRow) => {
    if (!window.confirm(`「${r.name || '（名称未入力）'}」を開示結果から外しますか？（調査先は消えません）`)) return
    const { error } = await supabase.from('financial_jasdec_results').delete().eq('id', r.id)
    if (error) showToast(`削除に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }
  /** 開示結果の1行を調査先にする。同名の調査先があればそれに紐づける */
  const addInstitutionFromJasdec = async (r: FinancialJasdecResultRow) => {
    const isAdminKind = r.kind === '株主名簿管理人'
    const name = (isAdminKind ? canonicalAdministratorName(r.name) : r.name).trim()
    if (!name) { showToast('機関名を入れてから追加してください', 'error'); return }
    const existing = allInstitutions.find(i => i.kind === (isAdminKind ? '株主名簿管理人' : '証券') && i.name.trim() === name)
    let instId = existing?.id ?? null
    if (!instId) {
      const { data, error } = await supabase.from('financial_institutions').insert({
        case_id: caseId, kind: isAdminKind ? '株主名簿管理人' : '証券', name, sort_order: institutions.length,
        freeze_required: !isAdminKind, search_required: false,
      }).select('id').single()
      if (error || !data) { showToast(`調査先の追加に失敗: ${error?.message ?? ''}`, 'error'); return }
      instId = (data as { id: string }).id
    }
    await saveJasdecRow(r.id, { institution_id: instId })
    showToast(existing ? `既にある「${name}」に紐づけました` : `「${name}」を調査先に追加しました`, 'success')
  }
  /** 銘柄の株主名簿管理人から調査先を作る（無ければ） */
  const addAdministratorInstitution = async (adminName: string) => {
    const name = canonicalAdministratorName(adminName).trim(); if (!name) return
    if (allInstitutions.some(i => i.kind === '株主名簿管理人' && i.name.trim() === name)) { showToast('その株主名簿管理人はもう調査先にあります', 'info'); return }
    const { error } = await supabase.from('financial_institutions').insert({ case_id: caseId, kind: '株主名簿管理人', name, sort_order: institutions.length, freeze_required: false, search_required: false })
    if (error) { showToast(`調査先の追加に失敗: ${error.message}`, 'error'); return }
    showToast(`「${name}」を調査先に追加しました`, 'success'); onRefresh?.()
  }
  const addHolding = async (inst: FinancialInstitutionRow) => {
    const n = allHoldings.filter(h => h.institution_id === inst.id).length
    const { error } = await supabase.from('securities_holdings').insert({ case_id: caseId, institution_id: inst.id, kind: inst.kind === '株主名簿管理人' ? '国内株式' : null, admin_status: inst.kind === '株主名簿管理人' ? '対象外' : '未特定', request_need: '未判断', sort_order: n })
    if (error) { showToast(`追加に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }
  const saveHolding = async (id: string, patch: Partial<SecuritiesHoldingRow>) => {
    const { error } = await supabase.from('securities_holdings').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }
  const deleteHolding = async (h: SecuritiesHoldingRow) => {
    if (!window.confirm(`銘柄「${h.brand_name || '（名称未入力）'}」を削除しますか？`)) return
    const { error } = await supabase.from('securities_holdings').delete().eq('id', h.id)
    if (error) showToast(`削除に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }
  const deleteInstitution = async (key: string) => {
    const inst = key === 'jasdec' ? jasdec : institutions.find(i => i.id === key); if (!inst) return
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
  // 請求のコピー：同じ内容（書類・日付・対象口座）で「請求準備中」の請求をもう1つ作る。請求日は空
  const copyRequest = async (r: FinancialRequestRow) => {
    const its = allItems.filter(it => it.request_id === r.id)
    const { data: created, error } = await supabase.from('financial_requests')
      .insert({ case_id: r.case_id, institution_id: r.institution_id, request_date: null, seal_original_sent: r.seal_original_sent, notes: r.notes })
      .select('id').single()
    if (error || !created) { showToast(`コピーに失敗: ${error?.message ?? ''}`, 'error'); return }
    const newId = (created as { id: string }).id
    for (const it of its) {
      const { data: ni, error: ie } = await supabase.from('financial_request_items')
        .insert({ case_id: it.case_id, request_id: newId, doc_type: it.doc_type, balance_date: it.balance_date, balance_recent: it.balance_recent, history_start: it.history_start, history_end: it.history_end, sort_order: it.sort_order })
        .select('id').single()
      if (ie || !ni) continue
      const accs = (it.financial_request_item_accounts ?? []).map(a => ({ item_id: (ni as { id: string }).id, asset_id: a.asset_id }))
      if (accs.length > 0) await supabase.from('financial_request_item_accounts').insert(accs)
    }
    showToast('請求をコピーしました（請求準備中）', 'success')
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
        <LeftRail items={railItems} active={sub} onChange={k => { if (k === 'jasdec') { void openJasdec(); return } setSub(k); setTab('procedure') }} onDelete={deleteInstitution} extra={
          <button type="button" onClick={() => setAddOpen(true)} className="mt-1 text-left text-[12px] px-2.5 py-1.5 rounded-md border border-dashed border-gray-300 text-gray-500 hover:text-brand-700 hover:border-brand-300 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> 調査先
          </button>
        } />
        <div className="flex-1 min-w-0 space-y-3.5">
          {!active ? (
            <>
              <SealWarning caseData={caseData} requests={allRequests} institutions={allInstitutions} today={today} />
              <TopTable layout={isSecTab ? 'securities' : 'deposit'} institutions={institutions} evalOf={evalOf} accountsOf={accountsOf} holdings={allHoldings} requests={allRequests} items={allItems} tasks={tasks} jasdecRows={jasdecRows}
                onOpen={id => { const i = institutions.find(x => x.id === id); if (i?.kind === 'ほふり') { void openJasdec(); return } setSub(id); setTab('procedure') }} />
            </>
          ) : sub === 'jasdec' && !active ? (
            <div className="bg-white px-4 py-8 text-center text-[13px] text-gray-500">ほふり照会を準備しています…</div>
          ) : active.kind === 'ほふり' ? (
            <JasdecPage inst={active} ev={evalOf(active)} rows={jasdecRows} institutions={allInstitutions} caseId={caseId} scopePrefix={scopePrefix} today={today}
              save={p => saveInst(active, p)} addRow={addJasdecRow} saveRow={saveJasdecRow} deleteRow={deleteJasdecRow} addInstitution={addInstitutionFromJasdec}
              openInstitution={id => { setSub(id); setTab('procedure') }} />
          ) : (
            <InstitutionPage
              inst={active} ev={evalOf(active)} accounts={accountsOf(active)}
              requests={allRequests.filter(r => r.institution_id === active.id).sort((a, b) => (b.request_date ?? '9999').localeCompare(a.request_date ?? '9999') || b.created_at.localeCompare(a.created_at))}
              items={allItems} holdings={allHoldings.filter(h => h.institution_id === active.id)}
              tab={tab} setTab={setTab} scopePrefix={scopePrefix} caseId={caseId} memberId={memberId} today={today}
              caseData={caseData} patchCase={patchCase}
              saveInst={p => saveInst(active, p)} saveAsset={saveAsset} addAccount={() => addAccount(active)} deleteAccount={deleteAccount}
              openRequest={() => setRequestOpen(true)} openArrival={setArrivalId} deleteRequest={deleteRequest} copyRequest={copyRequest}
              institutions={allInstitutions} addHolding={() => addHolding(active)} saveHolding={saveHolding} deleteHolding={deleteHolding}
              addAdministratorInstitution={addAdministratorInstitution} openInstitution={id => { setSub(id); setTab('procedure') }}
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
      <Link href={`/cases/${caseData.id}?tab=contractProc`} className="ml-auto inline-flex items-center gap-1 text-[12px] underline">契約手続きで確認 <ExternalLink className="w-3 h-3" /></Link>
    </div>
  )
}

// ── TOP：調査先の一覧（1行1口座。調査先・次の対応・進行中のタスクは銀行ごとに縦に結合） ──
// 工程と期限の列は置かない。工程は次の対応を短くしただけで、期限はタスクが持つ。
function taskIsForBank(t: TaskRow, bank: string): boolean {
  const m = (t.source_rid ?? '').match(/^(?:fin|fin-wf|fin-freeze|fin-read|cancel):([^:]+)/)
  if (m && m[1].trim() === bank) return true
  return !!bank && (t.title ?? '').includes(bank)
}
function TopTable({ layout, institutions, evalOf, accountsOf, holdings, requests, items, tasks, jasdecRows, onOpen }: {
  /** deposit＝1行1口座／securities＝1行1銘柄（ほふりは1行） */
  layout: 'deposit' | 'securities'
  jasdecRows: FinancialJasdecResultRow[]
  institutions: FinancialInstitutionRow[]
  evalOf: (i: FinancialInstitutionRow) => InstitutionEvaluation
  accountsOf: (i: FinancialInstitutionRow) => FinancialAssetRow[]
  holdings: SecuritiesHoldingRow[]
  requests: FinancialRequestRow[]
  items: FinancialRequestItemRow[]
  tasks: TaskRow[]
  onOpen: (id: string) => void
}) {
  const holdingAmount = (i: FinancialInstitutionRow) => holdings.filter(h => h.institution_id === i.id).reduce((x, h) => x + (h.amount ?? ((h.quantity ?? 0) * (h.unit_price ?? 0))), 0)
  const total = institutions.reduce((s, i) => s + accountsOf(i).reduce((x, a) => x + (a.balance_amount ?? 0), 0) + holdingAmount(i), 0)
  const openTaskOf = (i: FinancialInstitutionRow) => tasks
    .filter(t => normalizeTaskStatus(t.status) !== '完了' && taskIsForBank(t, i.name.trim()))
    .sort((a, b) => (normalizeTaskStatus(a.status) === '対応中' ? 0 : 1) - (normalizeTaskStatus(b.status) === '対応中' ? 0 : 1))[0]
  const taskCell = (i: FinancialInstitutionRow) => {
    const t = openTaskOf(i)
    if (!t) return <span className="text-[12px] text-gray-400">なし</span>
    const doing = normalizeTaskStatus(t.status) === '対応中'
    const ready = getStartSignal(t).ready
    const who = (t.task_assignees ?? []).map(a => a.members?.name).filter(Boolean).join('・')
    return (
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <span className={`flex-none px-1.5 text-[11px] font-semibold ${doing ? 'bg-blue-50 text-blue-700' : ready ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{doing ? '対応中' : ready ? '着手OK' : '着手前'}</span>
        <span className="truncate text-gray-800">{t.title}</span>
        <span className="flex-none text-[12px] text-gray-400">{who || '未割当'}</span>
      </span>
    )
  }
  const bankTd = 'px-2.5 py-2 align-middle'
  const bankBorder = 'border-b border-slate-300'
  const holdingAmt = (h: SecuritiesHoldingRow) => h.amount ?? ((h.quantity ?? 0) * (h.unit_price ?? 0))
  if (layout === 'securities') {
    // ほふりは先頭、次に証券会社、最後に株主名簿管理人
    const order = (i: FinancialInstitutionRow) => (i.kind === 'ほふり' ? 0 : i.kind === '証券' ? 1 : 2)
    const list = [...institutions].sort((a, b) => order(a) - order(b))
    return (
      <div>
        <SectionHeading title="調査先の一覧" hint="1行＝1銘柄。調査先・次の対応・進行中のタスクは調査先ごとに1つ。銘柄の株主名簿管理人から、信託銀行を調査先に足せます。" className="mb-1.5 pb-1.5 border-b border-gray-200" />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th className="px-2.5 py-2 text-left w-48">調査先</th>
                <th className="px-2.5 py-2 text-left">銘柄</th>
                <th className="px-2.5 py-2 text-left w-24">種類</th>
                <th className="px-2.5 py-2 text-right w-24">数量</th>
                <th className="px-2.5 py-2 text-right w-32">評価額</th>
                <th className="px-2.5 py-2 text-left w-40">株主名簿管理人</th>
                <th className="px-2.5 py-2 text-left w-56">次の対応</th>
                <th className="px-2.5 py-2 text-left w-60">進行中のタスク</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">調査先がありません。左の「ほふり照会」から始めるか、「＋ 調査先」で証券会社を追加してください。</td></tr>
              ) : list.map(i => {
                const ev = evalOf(i)
                const nextCell = <>{ev.next}{ev.parallelNext && <span className="block text-[12px] text-gray-400">並行：{ev.parallelNext}</span>}</>
                const rowCls = 'cursor-pointer hover:bg-brand-50/30'
                if (i.kind === 'ほふり') {
                  const linked = jasdecRows.filter(r => !!r.institution_id).length
                  return (
                    <tr key={i.id} onClick={() => onOpen(i.id)} className={`${rowCls} ${bankBorder}`}>
                      <td className={`${bankTd} font-medium text-gray-800`}>ほふり照会<span className="ml-1.5 text-[11px] text-gray-400">案件に1つ</span></td>
                      <td className={`${bankTd} text-[12px] text-gray-500`} colSpan={5}>
                        {i.jasdec_company_known === '調査不要' ? '不要（保有先が判明している）' : !i.jasdec_request_date ? '未請求' : !i.jasdec_arrival_date ? `開示請求 ${md(i.jasdec_request_date)}・結果待ち` : `開示結果 ${jasdecRows.length}機関 → 調査先へ ${linked}／${jasdecRows.length}`}
                      </td>
                      <td className={`${bankTd} text-gray-700`}>{nextCell}</td>
                      <td className={bankTd}>{taskCell(i)}</td>
                    </tr>
                  )
                }
                const hs = holdings.filter(h => h.institution_id === i.id)
                const n = Math.max(1, hs.length)
                const kindTag = <span className="ml-1.5 text-[11px] text-gray-400">{i.kind === '証券' ? '証券会社' : i.kind}</span>
                if (hs.length === 0) {
                  return (
                    <tr key={i.id} onClick={() => onOpen(i.id)} className={`${rowCls} ${bankBorder}`}>
                      <td className={`${bankTd} font-medium text-gray-800`}>{i.name}{kindTag}</td>
                      <td className={`${bankTd} text-[12px] text-gray-400`} colSpan={5}>銘柄なし{requests.some(r => r.institution_id === i.id) ? `（${requestStatus(requests.find(r => r.institution_id === i.id)!, items.filter(it => requests.some(r => r.id === it.request_id && r.institution_id === i.id)))}）` : ''}</td>
                      <td className={`${bankTd} text-gray-700`}>{nextCell}</td>
                      <td className={bankTd}>{taskCell(i)}</td>
                    </tr>
                  )
                }
                return hs.map((h, idx) => {
                  const last = idx === n - 1
                  const adminInst = h.administrator ? institutions.find(x => x.kind === '株主名簿管理人' && x.name.trim() === h.administrator!.trim()) : null
                  return (
                    <tr key={h.id} onClick={() => onOpen(i.id)} className={`${rowCls} ${last ? bankBorder : 'border-b border-gray-100'}`}>
                      {idx === 0 && <td rowSpan={n} className={`${bankTd} ${bankBorder} font-medium text-gray-800`}>{i.name}{kindTag}</td>}
                      <td className={`${bankTd} text-gray-800`}>{h.brand_name || <span className="text-gray-300">—</span>}{h.code && <span className="ml-1.5 text-[11px] text-gray-400">{h.code}</span>}</td>
                      <td className={`${bankTd} text-gray-600 text-[12px]`}>{h.kind ?? '—'}</td>
                      <td className={`${bankTd} text-right tabular-nums`}>{h.quantity != null ? h.quantity.toLocaleString('ja-JP') : '—'}</td>
                      <td className={`${bankTd} text-right tabular-nums`}>{holdingAmt(h) ? yen(holdingAmt(h)) : '—'}</td>
                      <td className={`${bankTd} text-[12px]`}>{i.kind === '株主名簿管理人' ? <span className="text-gray-300">—</span> : h.admin_status === '対象外' ? <span className="text-gray-400">対象外</span> : h.administrator ? <span className="text-gray-700">{h.administrator}{adminInst ? <span className="ml-1 text-emerald-700">✓</span> : <span className="ml-1 text-amber-700">未追加</span>}</span> : <span className="text-amber-700">未特定</span>}</td>
                      {idx === 0 && <td rowSpan={n} className={`${bankTd} ${bankBorder} text-gray-700`}>{nextCell}</td>}
                      {idx === 0 && <td rowSpan={n} className={`${bankTd} ${bankBorder}`}>{taskCell(i)}</td>}
                    </tr>
                  )
                })
              })}
            </tbody>
            {list.length > 0 && (
              <tfoot><tr className="bg-gray-50 font-semibold text-gray-700"><td className="px-2.5 py-2 text-right" colSpan={4}>合計（入力済みの評価額）</td><td className="px-2.5 py-2 text-right tabular-nums">{yen(holdings.filter(h => list.some(i => i.id === h.institution_id)).reduce((x, h) => x + holdingAmt(h), 0))}</td><td colSpan={3} /></tr></tfoot>
            )}
          </table>
        </div>
      </div>
    )
  }
  return (
    <div>
      <SectionHeading title="調査先の一覧" hint="1行＝1口座。調査先・次の対応・進行中のタスクは銀行ごとに1つ。行を押すとその調査先を開きます。" className="mb-1.5 pb-1.5 border-b border-gray-200" />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th className="px-2.5 py-2 text-left w-44">調査先</th>
              <th className="px-2.5 py-2 text-left w-28">支店</th>
              <th className="px-2.5 py-2 text-left w-16">種別</th>
              <th className="px-2.5 py-2 text-left w-28">口座番号</th>
              <th className="px-2.5 py-2 text-left w-40">残高証明・取引履歴</th>
              <th className="px-2.5 py-2 text-right w-32">残高・評価額</th>
              <th className="px-2.5 py-2 text-left">次の対応</th>
              <th className="px-2.5 py-2 text-left w-64">進行中のタスク</th>
            </tr>
          </thead>
          <tbody>
            {institutions.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">調査先がありません。左下の「＋ 調査先」から追加してください。</td></tr>
            ) : institutions.map(i => {
              const ev = evalOf(i)
              const accs = i.kind === '預金' ? accountsOf(i) : []
              const n = Math.max(1, accs.length)
              const nextCell = <>{ev.next}{ev.parallelNext && <span className="block text-[12px] text-gray-400">並行：{ev.parallelNext}</span>}</>
              const rowCls = 'cursor-pointer hover:bg-brand-50/30'
              if (accs.length === 0) {
                const hs = holdings.filter(h => h.institution_id === i.id)
                return (
                  <tr key={i.id} onClick={() => onOpen(i.id)} className={`${rowCls} ${bankBorder}`}>
                    <td className={`${bankTd} font-medium text-gray-800`}>{i.name}<span className="ml-1.5 text-[11px] text-gray-400">{i.kind}</span></td>
                    <td className={`${bankTd} text-gray-400 text-[12px]`} colSpan={3}>{i.kind === 'ほふり' ? '—' : i.kind === '預金' ? '口座なし' : `銘柄 ${hs.length}`}</td>
                    <td className={`${bankTd} text-[12px] text-gray-500`}>{i.kind === 'ほふり' ? '—' : requests.some(r => r.institution_id === i.id) ? requestStatus(requests.find(r => r.institution_id === i.id)!, items.filter(it => requests.some(r => r.id === it.request_id && r.institution_id === i.id))) : '未請求'}</td>
                    <td className={`${bankTd} text-right tabular-nums`}>{holdingAmount(i) ? yen(holdingAmount(i)) : '—'}</td>
                    <td className={`${bankTd} text-gray-700`}>{nextCell}</td>
                    <td className={`${bankTd}`}>{taskCell(i)}</td>
                  </tr>
                )
              }
              return accs.map((a, idx) => {
                const b = accountDocStatus(a.id, '残高証明', (a.balance_cert_required ?? '要') !== '不要', requests, items)
                const h = accountDocStatus(a.id, '取引履歴', (a.transaction_detail_required ?? '') === '要', requests, items)
                const last = idx === n - 1
                return (
                  <tr key={a.id} onClick={() => onOpen(i.id)} className={`${rowCls} ${last ? bankBorder : 'border-b border-gray-100'}`}>
                    {idx === 0 && <td rowSpan={n} className={`${bankTd} ${bankBorder} font-medium text-gray-800`}>{i.name}<span className="ml-1.5 text-[11px] text-gray-400">{i.kind}</span></td>}
                    <td className={`${bankTd} text-gray-700`}>{a.branch_name || <span className="text-gray-300">—</span>}</td>
                    <td className={`${bankTd} text-gray-700`}>{a.account_type || <span className="text-gray-300">—</span>}</td>
                    <td className={`${bankTd} font-mono text-gray-700`}>{a.account_number || <span className="text-gray-300">—</span>}</td>
                    <td className={`${bankTd} text-[12px] text-gray-600`}><span className="font-semibold text-gray-700">{b.label}</span>／{h.label}</td>
                    <td className={`${bankTd} text-right tabular-nums`}>{a.balance_amount != null ? yen(a.balance_amount) : '—'}</td>
                    {idx === 0 && <td rowSpan={n} className={`${bankTd} ${bankBorder} text-gray-700`}>{nextCell}</td>}
                    {idx === 0 && <td rowSpan={n} className={`${bankTd} ${bankBorder}`}>{taskCell(i)}</td>}
                  </tr>
                )
              })
            })}
          </tbody>
          {institutions.length > 0 && (
            <tfoot><tr className="bg-gray-50 font-semibold text-gray-700"><td className="px-2.5 py-2 text-right" colSpan={5}>合計（入力済みの金額）</td><td className="px-2.5 py-2 text-right tabular-nums">{yen(total)}</td><td colSpan={2} /></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ── 調査先のページ ────────────────────────────────────────────
function InstitutionPage({ inst, ev, accounts, requests, items, holdings, tab, setTab, scopePrefix, caseId, memberId, today, caseData, patchCase, saveInst, saveAsset, addAccount, deleteAccount, openRequest, openArrival, deleteRequest, copyRequest, institutions, addHolding, saveHolding, deleteHolding, addAdministratorInstitution, openInstitution }: {
  inst: FinancialInstitutionRow; ev: InstitutionEvaluation; accounts: FinancialAssetRow[]
  requests: FinancialRequestRow[]; items: FinancialRequestItemRow[]; holdings: SecuritiesHoldingRow[]
  tab: 'procedure' | 'accounts' | 'requests' | 'holdings'; setTab: (t: 'procedure' | 'accounts' | 'requests' | 'holdings') => void
  scopePrefix: string; caseId: string; memberId: string | null; today: string
  caseData: CaseRow; patchCase: (p: Partial<CaseRow>) => Promise<void>
  saveInst: (p: Partial<FinancialInstitutionRow>) => Promise<void>
  saveAsset: (id: string, p: Partial<FinancialAssetRow>) => Promise<void>
  addAccount: () => void; deleteAccount: (a: FinancialAssetRow) => void
  openRequest: () => void; openArrival: (id: string) => void; deleteRequest: (r: FinancialRequestRow) => void; copyRequest: (r: FinancialRequestRow) => void
  /** 銘柄タブ用：全調査先（管理人が調査先にあるか）と銘柄の操作 */
  institutions: FinancialInstitutionRow[]
  addHolding: () => void; saveHolding: (id: string, p: Partial<SecuritiesHoldingRow>) => Promise<void>; deleteHolding: (h: SecuritiesHoldingRow) => void
  addAdministratorInstitution: (name: string) => Promise<void>; openInstitution: (id: string) => void
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
      <ProgressSummary caseId={caseId} scopeKey={`${scopePrefix}_inst_${inst.id}`} title={`進捗/結果（${inst.name}）`} collapsible />
      <div className="bg-white">
        {/* 銀行名の見出しは置かない。どの銀行かは左レール（選択中）と進捗タイトルで分かる。
            名前・種別の修正は手続きタブ「この銀行の前提」の先頭行。状態は右の「次の対応」が言う */}
        <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 border-b border-gray-200">
          <SubTabs tabs={tabs} active={tab} onChange={k => setTab(k as typeof tab)} />
          {/* 次の対応。この画面でできること（主の対応待ちがある）ならボタンにして、押すとその入口へ。待ちのときは文字だけ */}
          <div className="min-w-0 flex items-center justify-end gap-2 text-[13px] text-gray-500">
            <span>次の対応</span>
            {(() => {
              const main = ev.pending.find(p => !p.parallel)
              if (!main) return <span className="text-[14px] font-semibold text-gray-800 truncate">{ev.next}</span>
              const go = () => {
                if (main.key === 'submit' || main.key === 'register') { openRequest(); return }
                if (main.key === 'irregular') { setTab('requests'); return }
                if (main.key === 'holdings' || main.key === 'administrator') { setTab('holdings'); return }
                setTab('procedure')
              }
              return (
                <button type="button" onClick={go} title={main.detail}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700">
                  {ev.next} →
                </button>
              )
            })()}
            {ev.nextDeadline && <span className="text-[13px] text-amber-700">期限 {ev.nextDeadline.slice(5).replace('-', '/')}</span>}
            {ev.parallelNext && <span className="text-[12px] text-gray-500 truncate">並行：{ev.parallelNext}</span>}
          </div>
        </div>
        <div className="p-3.5">
          {tab === 'procedure' && (<ProcedureCards inst={inst} ev={ev} requests={requests} save={saveInst} memberId={memberId} today={today} caseData={caseData} patchCase={patchCase} openRequest={openRequest} />)}
          {tab === 'accounts' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] text-gray-500">残高証明・取引履歴の状態は請求から自動で入ります。</p>
                <button type="button" onClick={addAccount} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50"><Plus className="w-3.5 h-3.5" />口座を追加</button>
              </div>
              <table className="w-full text-[13px] border-collapse">
                <thead><tr className="bg-slate-100 border-b border-slate-300 text-[13px] text-gray-600">
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
                        <td className="px-2 py-1.5"><StatusChip s={b.label} />{b.count && <span className="ml-1 text-[12px] text-gray-400">{b.count}</span>}</td>
                        <td className="px-2 py-1.5"><StatusChip s={h.label} />{h.count && <span className="ml-1 text-[12px] text-gray-400">{h.count}</span>}</td>
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
                <p className="text-[12px] text-gray-500">1行＝金融機関へ一度に出したまとまり。到着日は受信簿のW-Checkで入ります。</p>
                <button type="button" onClick={openRequest} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700"><Plus className="w-3.5 h-3.5" />請求を登録</button>
              </div>
              <table className="w-full text-[13px] border-collapse">
                <thead><tr className="bg-slate-100 border-b border-slate-300 text-[13px] text-gray-600">
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
                        <td className="px-2 py-2 text-gray-600 font-mono text-[12px]">{isSec ? '保有口座全体' : accIds.map(id => { const a = accounts.find(x => x.id === id); return <div key={id}>{a ? [a.branch_name, a.account_type, a.account_number].filter(Boolean).join('｜') : '—'}</div> })}</td>
                        <td className="px-2 py-2 text-gray-700">{md(r.request_date)}</td>
                        <td className="px-2 py-2 text-gray-700">{its.length === 0 ? '—' : arrived === its.length ? '到着済' : arrived > 0 ? `一部到着 ${arrived}/${its.length}` : '未到着'}</td>
                        <td className="px-2 py-2"><StatusChip s={requestStatus(r, its)} /></td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <button type="button" onClick={() => openArrival(r.id)} className="text-[12px] font-semibold text-brand-700 hover:underline">{r.request_date ? '到着処理' : '請求日を登録'}</button>
                          <button type="button" onClick={() => void copyRequest(r)} className="ml-2 text-gray-400 hover:text-brand-700 align-middle" title="この請求をコピーして新しい請求を作る"><Copy className="w-3.5 h-3.5 inline" /></button>
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
            <HoldingsTable inst={inst} holdings={holdings} institutions={institutions} addHolding={addHolding} saveHolding={saveHolding} deleteHolding={deleteHolding}
              addAdministratorInstitution={addAdministratorInstitution} openInstitution={openInstitution} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── 手続き：工程図 → ①最初の連絡 → ②請求方法 → ③請求 ──
// Step の番号はやめた。凍結・依頼書・全店調査は銀行への最初の電話で一度に済むもので順番がない。
// 順番があるのは ①→②→③ の大枠だけ。手で入れる日付は「連絡日」と「来店日」の2つ。あとは選択とチェックで、
// 日付は裏で記録する（凍結依頼日＝連絡日、届いた＝今日、など）。判定は financialWorkflow のまま。

/** 見出し右端の「不要」チェック。ふだんは要なので触らず、要らないときだけチェックする */
function NotNeeded({ required, onChange }: { required: boolean; onChange: (required: boolean) => void }) {
  const off = !required
  return (
    <label className={`inline-flex items-center gap-1 text-[12px] cursor-pointer px-1.5 py-0.5 border ${off ? 'border-gray-400 bg-gray-200 text-gray-700 font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
      <input type="checkbox" checked={off} onChange={e => onChange(!e.target.checked)} className="w-3.5 h-3.5 accent-gray-600" />
      不要
    </label>
  )
}

/** ①②③ の見出し */
function PhaseHeading({ no, title, sub, right }: { no: number; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-3 pt-4 pb-1.5 border-b border-slate-300">
      <span className="w-[22px] h-[22px] rounded-full bg-brand-600 text-white text-[12px] font-bold flex items-center justify-center">{no}</span>
      <span className="text-[14px] font-bold text-gray-900">{title}</span>
      {sub && <span className="text-[12px] text-gray-500 ml-1">{sub}</span>}
      {right && <span className="ml-auto flex items-center gap-2">{right}</span>}
    </div>
  )
}

/** 行の右端の「不要」。押すとその行の中身が消え、判定からも外れる */
function NotNeededAtEnd({ required, onChange }: { required: boolean; onChange: (v: boolean) => void }) {
  return <span className="ml-auto"><NotNeeded required={required} onChange={onChange} /></span>
}
/** チェック＋（付いた日） */
function Chk({ checked, onChange, label, note }: { checked: boolean; onChange: (on: boolean) => void; label: string; note?: string | null }) {
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer text-[13px]">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-brand-600" />
      <span className={checked ? 'text-gray-800' : 'text-gray-600'}>{label}</span>
      {checked && note && <span className="text-[12px] text-gray-400">{note}</span>}
    </label>
  )
}
/** 2択の切替（郵送／来店） */
function Seg({ value, options, onChange }: { value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex border border-gray-300">
      {options.map(o => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`px-4 py-1 text-[13px] font-semibold ${value === o ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{o}</button>
      ))}
    </div>
  )
}
const selCls = 'input-flat w-full px-2.5 py-1.5 text-[13px] text-gray-800 outline-none cursor-pointer'

/** 手続きタブの一番上：この銀行の工程図。今いる場所は右上の「次の対応」と同じ判定（procedureStage） */
function ProcedureStepper({ inst: i, ev, requests }: { inst: FinancialInstitutionRow; ev: InstitutionEvaluation; requests: FinancialRequestRow[] }) {
  const isSec = i.kind === '証券', isAdmin = i.kind === '株主名簿管理人'
  const stage = procedureStage(ev)
  const done = ev.status === '完了'
  const submitted = requests.filter(r => !!r.request_date).sort((a, b) => (b.request_date ?? '').localeCompare(a.request_date ?? ''))[0]
  const formSub = !i.form_required ? '不要' : formSecured(i) ? (i.form_source === '社内在庫' ? '社内在庫' : `到着 ${md(i.form_arrival_date)}`) : i.form_source === '未確認' ? '手配方法を選ぶ' : '到着待ち'
  const nodes: Array<{ label: string; sub: string }> = [
    { label: '最初の連絡', sub: i.first_contact_date ? `${md(i.first_contact_date)}${isAdmin ? '' : isSec ? ' 死亡連絡・依頼書' : ' 凍結・依頼書・全店調査'}` : (isAdmin ? '依頼書' : isSec ? '死亡連絡・依頼書' : '凍結・依頼書・全店調査') },
    { label: '依頼書', sub: formSub },
    { label: '請求方法', sub: isAdmin ? '—' : i.handling_method === '未確認' ? '郵送か来店か・印鑑証明' : i.handling_method + (i.handling_method === '来店' && i.visit_date ? ` ${md(i.visit_date)}` : '') },
    { label: '請求', sub: submitted ? `請求日 ${md(submitted.request_date)}` : '残高証明・取引履歴' },
    { label: '到着・完了', sub: done ? '完了' : ev.waiting === '証明書の到着待ち' ? '到着待ち' : ev.status === '要確認' ? '要確認あり' : isSec ? '銘柄を登録' : '残高を口座へ' },
  ]
  const searchText = !i.search_required ? null
    : allBranchSearchDone(i) ? `全店調査 完了${i.search_other_accounts ? `・他店口座${i.search_other_accounts}` : ''}`
    : ev.parallelNext ? `全店調査 ${ev.parallelNext.replace('全店調査', '')}` : '全店調査'
  return (
    <div className="px-2 pt-1 pb-2">
      <div className="flex">
        {nodes.map((n, idx) => {
          const k = idx + 1
          const st: 'done' | 'now' | 'wait' = done || k < stage ? 'done' : k === stage ? 'now' : 'wait'
          return (
            <div key={n.label} className="flex-1 text-center relative">
              {idx < nodes.length - 1 && <div className={`absolute top-[11px] left-1/2 right-[-50%] h-[2px] ${st === 'done' ? 'bg-emerald-600' : 'bg-gray-200'}`} />}
              {/* 番号は付けない（見出しの①〜④と食い違うため）。済＝緑の✓、今＝青の点、先＝灰色 */}
              <div className={`relative z-10 w-[20px] h-[20px] mx-auto rounded-full text-[11px] font-bold flex items-center justify-center ${st === 'done' ? 'bg-emerald-600 text-white' : st === 'now' ? 'bg-brand-600 ring-4 ring-brand-100' : 'bg-gray-200'}`}>{st === 'done' ? '✓' : ''}</div>
              <div className={`mt-1.5 text-[12.5px] ${st === 'now' ? 'text-brand-800 font-bold' : st === 'done' ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>{n.label}</div>
              <div className={`text-[11.5px] ${st === 'now' ? 'text-brand-700' : 'text-gray-400'}`}>{n.sub}</div>
            </div>
          )
        })}
      </div>
      {searchText && !isAdmin && (
        <div className="mt-2 ml-2 flex items-center gap-2 text-[12px] text-gray-500">
          <span className="w-10 border-t-2 border-dashed border-gray-300" />
          <span>並行</span>
          <span className={`px-2 py-[1px] text-[11.5px] font-semibold ${allBranchSearchDone(i) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{searchText}</span>
        </div>
      )}
    </div>
  )
}

/** 印鑑登録証明書の行（④請求するの表の中）。状態は文字の色で言い、「編集」で発行日・有効期間・使用期限・受領通数が開く。
    未登録・期限切れのときは最初から開く。値は案件に1つ（契約手続きタブと同じ列） */
function SealRows({ caseData, patchCase, today }: { caseData: CaseRow; patchCase: (p: Partial<CaseRow>) => Promise<void>; today: string }) {
  const st = sealCertificateStatus(caseData, today)
  const mustInput = st.status === '未登録' || st.status === '期限切れ'
  const [editing, setEditing] = useState(false)
  const needInput = mustInput || editing
  const inp = 'input-flat w-full px-2.5 py-1.5 text-[14px] text-gray-800 outline-none'
  const status = st.status === '有効' ? <span className="text-emerald-700 font-semibold">有効<span className="ml-1.5 font-normal text-gray-500">期限 {st.expiry?.replace(/-/g, '/')}</span></span>
    : st.status === '期限間近' ? <span className="text-amber-700 font-semibold">期限間近<span className="ml-1.5 font-normal text-gray-500">あと{st.daysLeft}日（{st.expiry?.replace(/-/g, '/')}）</span></span>
    : st.status === '期限切れ' ? <span className="text-red-700 font-semibold">期限切れ<span className="ml-1.5 font-normal text-gray-500">{st.expiry?.replace(/-/g, '/')}。差し替えが要ります</span></span>
    : <span className="text-amber-700 font-semibold">未登録</span>
  return (
    <>
      <PracticeRow label="印鑑登録証明書" sub="依頼者・案件に1つ" full>
        {status}
        {caseData.seal_cert_copies != null && <span className="text-[12px] text-gray-500">手元 {caseData.seal_cert_copies}通</span>}
        {!mustInput && (
          <button type="button" onClick={() => setEditing(e => !e)} className="text-[12px] text-brand-600 underline underline-offset-2 hover:text-brand-700">{editing ? '閉じる' : '編集'}</button>
        )}
        <span className="text-[12px] text-gray-400">{mustInput ? '発行日を入れると使用期限が出ます。' : ''}契約手続きタブと同じ値です</span>
      </PracticeRow>
      {needInput && (<>
        <PracticeRow label="発行日" sub="最古の1通">
          <input type="date" key={`si-${caseData.seal_cert_oldest_issue_date ?? ''}`} defaultValue={caseData.seal_cert_oldest_issue_date ?? ''}
            onBlur={e => { if (e.target.value !== (caseData.seal_cert_oldest_issue_date ?? '')) void patchCase({ seal_cert_oldest_issue_date: e.target.value || null }) }} className={inp} />
        </PracticeRow>
        <PracticeRow label="有効期間">
          <select value={caseData.seal_cert_validity_months == null ? 'custom' : String(caseData.seal_cert_validity_months)}
            onChange={e => void patchCase({ seal_cert_validity_months: e.target.value === 'custom' ? null : Number(e.target.value) })}
            style={{ fontFamily: 'inherit' }} className={`${inp} cursor-pointer`}>
            <option value="6">発行後6か月</option><option value="3">発行後3か月</option><option value="custom">個別指定</option>
          </select>
        </PracticeRow>
        <PracticeRow label="使用期限">
          {caseData.seal_cert_validity_months == null
            ? <input type="date" key={`se-${caseData.seal_cert_custom_expiry ?? ''}`} defaultValue={caseData.seal_cert_custom_expiry ?? ''}
                onBlur={e => { if (e.target.value !== (caseData.seal_cert_custom_expiry ?? '')) void patchCase({ seal_cert_custom_expiry: e.target.value || null }) }} className={inp} />
            : <span className="text-[13px] text-gray-500">自動（発行日＋{caseData.seal_cert_validity_months}か月）{st.expiry ? `：${st.expiry.replace(/-/g, '/')}` : ''}</span>}
        </PracticeRow>
        <PracticeRow label="受領通数">
          <input type="number" min={0} key={`sc-${caseData.seal_cert_copies ?? ''}`} defaultValue={caseData.seal_cert_copies ?? ''}
            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (caseData.seal_cert_copies ?? null)) void patchCase({ seal_cert_copies: v }) }} className={`${inp} max-w-[8rem]`} />
        </PracticeRow>
      </>)}
    </>
  )
}

function ProcedureCards({ inst: i, ev, requests, save, memberId, today, caseData, patchCase, openRequest }: {
  inst: FinancialInstitutionRow; ev: InstitutionEvaluation; requests: FinancialRequestRow[]
  save: (p: Partial<FinancialInstitutionRow>) => Promise<void>; memberId: string | null; today: string
  caseData: CaseRow; patchCase: (p: Partial<CaseRow>) => Promise<void>; openRequest: () => void
}) {
  const isSec = i.kind === '証券', isAdmin = i.kind === '株主名簿管理人'
  const onHold = (i.survey_prohibited_designation ?? '') === '指定あり'
  const stamp = () => i.first_contact_date || today
  const grid4 = 'grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[9.5rem_minmax(0,1fr)_9.5rem_minmax(0,1fr)]'
  const needsSubmit = i.search_method === '要原本確認' || i.search_method === '要請求'
  // 依頼書の手配の結果。選んだ瞬間に日付を裏で入れる（頼んだ日＝連絡日、在庫確認日＝連絡日）
  const setFormSource = (v: string) => {
    if (v === '社内在庫') return save({ form_source: v, form_stock_date: stamp(), form_request_date: null, form_arrival_date: null })
    if (v === '金融機関へ請求' || v === '窓口で受け取る') return save({ form_source: v, form_request_date: stamp(), form_stock_date: null, form_arrival_date: null })
    return save({ form_source: '未確認', form_request_date: null, form_stock_date: null, form_arrival_date: null })
  }
  const setSearchMethod = (v: string) => {
    if (v === '電話回答') return save({ search_method: v, search_answer_date: stamp(), search_request_date: null, search_submission_method: '未確認' })
    if (v === '要原本確認' || v === '要請求') return save({ search_method: v, search_answer_date: null, search_request_date: null, search_other_accounts: null })
    return save({ search_method: '未確認', search_answer_date: null, search_request_date: null, search_other_accounts: null, search_submission_method: '未確認' })
  }
  const otherSel = (
    <select value={i.search_other_accounts ?? ''} onChange={e => void save({ search_other_accounts: e.target.value || null, ...(e.target.value !== 'あり' ? { search_all_accounts_registered: false } : {}) })} style={{ fontFamily: 'inherit' }} className={selCls}>
      <option value="">—</option><option value="なし">他店口座 なし</option><option value="あり">他店口座 あり</option>
    </select>
  )
  return (
    <div className="space-y-1">
      <ProcedureStepper inst={i} ev={ev} requests={requests} />

      {/* ① 基本情報。誰が請求するか（取得区分）と、お客様の「まだ調べないで」（調査禁止）。
          どちらも連絡の前に決まることなので先頭に置く。調査禁止が立っている間はどの工程も進めない */}
      <PhaseHeading no={1} title="基本情報" sub="誰が取るか（取得区分）と、お客様からの「まだ調べないで」" right={onHold ? <span className="text-[12px] font-semibold px-2 py-[1px] bg-gray-200 text-gray-700">調査禁止中</span> : undefined} />
      <div className={grid4}>
        <PracticeRow label="金融機関名"><TxtCell value={i.name} onCommit={v => { if (v.trim()) void save({ name: v.trim() }) }} placeholder="金融機関名" /></PracticeRow>
        <PracticeRow label="種別"><span>{i.kind}</span></PracticeRow>
        <PracticeRow label="取得区分" hint="自社＝うちが請求する。依頼者＝依頼者が自分で取ってくる（請求のタスクは出ない）">
          <SelCell value={i.acquirer} options={['自社', '依頼者']} onChange={v => void save({ acquirer: v || '自社' })} />
        </PracticeRow>
        <PracticeRow label="調査禁止指定" hint="お客様から「まだ調べないで」と言われているとき。期間指定なら終了日まで、連絡待ちなら解除するまで、この調査先は止まる。">
          <SelCell value={i.survey_prohibited_designation ?? '指定なし'} options={[...SURVEY_BAN_DESIGNATIONS]} onChange={v => void save({ survey_prohibited_designation: v || '指定なし' })} />
        </PracticeRow>
        {onHold && (<>
          {/* 解除済にしたあとに禁止方法を「期間指定」へ変えられると、解除の記録と食い違うので触れなくする */}
          <PracticeRow label="禁止方法" disabled={!!i.prohibition_released_at} disabledNote="解除済のため変更できません"><SelCell value={i.survey_prohibited_method} options={[...SURVEY_BAN_METHODS]} onChange={v => void save({ survey_prohibited_method: v || null })} /></PracticeRow>
          <PracticeRow label="理由"><TxtCell value={i.survey_prohibited_reason} onCommit={v => void save({ survey_prohibited_reason: v || null })} placeholder="禁止理由" /></PracticeRow>
          {i.survey_prohibited_method === '期間指定' ? (<>
            <PracticeRow label="開始日"><DateCell value={i.survey_prohibited_start} onCommit={v => void save({ survey_prohibited_start: v || null })} /></PracticeRow>
            <PracticeRow label="終了日"><DateCell value={i.survey_prohibited_end} onCommit={v => void save({ survey_prohibited_end: v || null })} /></PracticeRow>
          </>) : (
            <PracticeRow label="お客様の連絡" full>
              {i.prohibition_released_at
                ? <>
                    <span className="text-[12px] text-emerald-700">連絡あり・解除済 {i.prohibition_released_at.slice(0, 10)}</span>
                    {/* 間違えて解除したときの戻し口。誰でも押せる。戻すと禁止方法も再び選べる */}
                    <button type="button"
                      onClick={() => { if (window.confirm('解除を取り消して、調査禁止の状態に戻します。よろしいですか？')) void save({ prohibition_released_at: null }) }}
                      className="ml-2 text-[12px] text-gray-500 underline underline-offset-2 hover:text-gray-800">解除を取り消す</button>
                  </>
                : <button type="button" onClick={() => { if (window.confirm('お客様からOKの連絡があったものとして、この調査先の調査禁止を解除します。\n解除すると禁止方法は変更できなくなります。よろしいですか？')) void save({ prohibition_released_at: new Date().toISOString() }) }} className="px-2.5 py-1 rounded-md text-[12px] font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50">お客様からOKの連絡があった（解除）</button>}
            </PracticeRow>
          )}
        </>)}
      </div>

      {/* ② 最初の連絡：日付は連絡日の1つ。3項目は連絡の結果 */}
      <PhaseHeading no={2} title={isAdmin ? '株主名簿管理人への最初の連絡' : isSec ? '証券会社への最初の連絡' : '銀行への最初の連絡'} sub={isAdmin ? '依頼書式をどう手に入れるか' : '同じ電話でまとめて済ませる。ここで分かった結果を残す'} />
      <div className={grid4}>
        <PracticeRow label="連絡日"><DateCell value={i.first_contact_date} onCommit={v => void save({ first_contact_date: v || null })} /></PracticeRow>
        <PracticeRow label="相手" sub="金融機関の担当者名"><TxtCell value={i.first_contact_person} onCommit={v => void save({ first_contact_person: v || null })} placeholder="例：相続センター 佐藤様" /></PracticeRow>
        {!isAdmin && (
          <PracticeRow label={isSec ? '死亡連絡' : '口座の凍結'} full>
            {i.freeze_required
              ? <Chk checked={!!i.freeze_date} onChange={on => void save({ freeze_date: on ? stamp() : null })} label={isSec ? '死亡を連絡した' : '凍結を依頼した'} note={md(i.freeze_date)} />
              : <span className="text-[12px] text-gray-400">この銀行では不要</span>}
            <NotNeededAtEnd required={i.freeze_required} onChange={v => void save({ freeze_required: v, ...(v ? {} : { freeze_date: null }) })} />
          </PracticeRow>
        )}
        <PracticeRow label="依頼書の手配" full>
          {i.form_required ? (<>
            <select value={i.form_source} onChange={e => void setFormSource(e.target.value)} style={{ fontFamily: 'inherit' }} className={`${selCls} max-w-[16rem]`}>
              {FORM_SOURCES.map(o => <option key={o} value={o}>{FORM_SOURCE_LABEL[o]}</option>)}
            </select>
            {i.form_source === '社内在庫' && <span className="text-[12px] text-gray-500">在庫あり {md(i.form_stock_date)}</span>}
            {(i.form_source === '金融機関へ請求' || i.form_source === '窓口で受け取る') && (<>
              <Chk checked={!!i.form_arrival_date} onChange={on => void save({ form_arrival_date: on ? today : null })} label={i.form_source === '窓口で受け取る' ? '受け取った' : '届いた'} note={md(i.form_arrival_date)} />
              {!i.form_arrival_date && <span className="text-[12px] text-gray-400">{i.form_source === '窓口で受け取る' ? '受け取るまで請求に進めません' : '到着待ち'}</span>}
            </>)}
          </>) : <span className="text-[12px] text-gray-400">この銀行では不要</span>}
          <NotNeededAtEnd required={i.form_required} onChange={v => void save({ form_required: v })} />
        </PracticeRow>
        {!isAdmin && (
          <PracticeRow label="全店調査" full>
            {i.search_required ? (<>
              <select value={i.search_method} onChange={e => void setSearchMethod(e.target.value)} style={{ fontFamily: 'inherit' }} className={`${selCls} max-w-[16rem]`}>
                {SEARCH_METHODS.map(o => <option key={o} value={o}>{SEARCH_METHOD_LABEL[o]}</option>)}
              </select>
              {i.search_method === '電話回答' && (<>
                <span className="max-w-[11rem] w-full">{otherSel}</span>
                <span className="max-w-[16rem] w-full"><TxtCell value={i.search_responder} onCommit={v => void save({ search_responder: v || null })} placeholder="回答者 例：相続担当 佐藤様" /></span>
              </>)}
              {needsSubmit && (<>
                <select value={i.search_submission_method} onChange={e => void save({ search_submission_method: e.target.value || '未確認' })} style={{ fontFamily: 'inherit' }} className={`${selCls} max-w-[9rem]`}>
                  {SUBMISSION_METHODS.map(o => <option key={o} value={o}>{o === '未確認' ? '提出方法 —' : `提出方法 ${o}`}</option>)}
                </select>
                <Chk checked={!!i.search_request_date} onChange={on => void save({ search_request_date: on ? today : null, ...(on ? {} : { search_answer_date: null }) })} label={i.search_method === '要原本確認' ? '原本を提出した' : '調査依頼書を提出した'} note={md(i.search_request_date)} />
                {i.search_request_date && <Chk checked={!!i.search_answer_date} onChange={on => void save({ search_answer_date: on ? today : null, ...(on ? {} : { search_other_accounts: null }) })} label="回答が来た" note={md(i.search_answer_date)} />}
                {i.search_answer_date && <span className="max-w-[11rem] w-full">{otherSel}</span>}
              </>)}
              {i.search_other_accounts === 'あり' && (
                <Chk checked={i.search_all_accounts_registered} onChange={on => void save({ search_all_accounts_registered: on })} label="判明した口座を口座一覧に登録済み" />
              )}
            </>) : <span className="text-[12px] text-gray-400">この銀行では不要</span>}
            <NotNeededAtEnd required={i.search_required} onChange={v => void save({ search_required: v })} />
          </PracticeRow>
        )}
      </div>

      {/* ③ 請求方法：郵送か来店か。確認日は選んだ瞬間に裏で記録 */}
      {!isAdmin && (<>
        <PhaseHeading no={3} title="残高証明・取引履歴の請求方法" sub="郵送で送るか、窓口に持って行くか。銀行に聞いた結果" />
        <div className={grid4}>
          <PracticeRow label="請求方法">
            <Seg value={i.handling_method} options={['郵送', '来店']} onChange={v => void save({ handling_method: v, ...(i.method_confirm_date ? {} : { method_confirm_date: today }) })} />
          </PracticeRow>
          {i.handling_method === '来店'
            ? <PracticeRow label="来店日" sub="予約した訪問日"><DateCell value={i.visit_date} onCommit={v => void save({ visit_date: v || null })} /></PracticeRow>
            : <PracticeRow label=" "><span className="text-[12px] text-gray-400">{i.handling_method === '郵送' ? '請求は郵送。来店の予定はありません' : '選ぶと次へ進めます'}</span></PracticeRow>}
        </div>
      </>)}

      {/* ④ 請求する：必要なもの（依頼書・印鑑登録証明書・来店なら来店準備）が揃っているかの表＋下の操作バー。
          揃っていなければ主ボタンは押せず、足りないものを左に書く。押すとその場で請求の登録ウィンドウが開く */}
      {(() => {
        const seal = sealCertificateStatus(caseData, today)
        const sealBlocked = seal.status === '未登録' || seal.status === '期限切れ'
        const visit = !isAdmin && i.handling_method === '来店'
        const missing: string[] = []
        if (onHold) missing.push('調査禁止中')
        if (!formSecured(i)) missing.push(i.form_source === '窓口で受け取る' ? '依頼書を受け取っていません' : '依頼書の到着待ち')
        if (!isAdmin && i.handling_method === '未確認') missing.push('請求方法（郵送か来店か）が未選択')
        if (sealBlocked) missing.push(seal.status === '期限切れ' ? '印鑑登録証明書が期限切れ' : '印鑑登録証明書が未登録')
        if (visit && !i.visit_date) missing.push('来店日が未入力')
        if (visit && i.visit_date && !i.visit_prep_done_at) missing.push('来店準備が未完了')
        const ready = missing.length === 0
        return (<>
          <PhaseHeading no={isAdmin ? 3 : 4} title="請求する" sub="必要なものが揃ったら、請求内容を登録する" />
          <div className={grid4}>
            <PracticeRow label="依頼書" full>
              {!i.form_required ? <span className="text-gray-500">不要</span>
                : formSecured(i) ? <><span className="text-emerald-700 font-semibold">手元にある</span><span className="text-[12px] text-gray-500">{i.form_source === '社内在庫' ? `社内在庫 ${md(i.form_stock_date)}` : `${i.form_source === '窓口で受け取る' ? '受け取り' : '到着'} ${md(i.form_arrival_date)}`}</span></>
                : <><span className="text-amber-700 font-semibold">{i.form_source === '未確認' ? '手配方法が未選択' : i.form_source === '窓口で受け取る' ? '受け取り待ち' : '到着待ち'}</span><span className="text-[12px] text-gray-400">②の「依頼書の手配」で記録します</span></>}
            </PracticeRow>
            <SealRows caseData={caseData} patchCase={patchCase} today={today} />
            {visit && (
              <PracticeRow label="来店準備" sub="前々日まで" full>
                {!i.visit_date ? <span className="text-amber-700 font-semibold">来店日が未入力<span className="ml-1.5 font-normal text-[12px] text-gray-400">③で来店日を入れてください</span></span>
                  : i.visit_prep_done_at
                    ? <><span className="text-emerald-700 font-semibold">準備完了</span><span className="text-[12px] text-gray-500">{md(i.visit_prep_done_at.slice(0, 10))}</span><button type="button" onClick={() => void save({ visit_prep_done_at: null, visit_prep_done_by: null })} className="text-[12px] text-gray-500 underline underline-offset-2">取り消す</button></>
                    : <><span className="text-amber-700 font-semibold">未完了</span><span className="text-[12px] text-gray-500">依頼書・戸籍・本人確認資料・印鑑が揃ったら</span><button type="button" onClick={() => void save({ visit_prep_done_at: new Date().toISOString(), visit_prep_done_by: memberId })} className="px-3 py-1 text-[12px] font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50">来店準備を完了にする</button></>}
              </PracticeRow>
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-3 px-3 py-2.5 bg-slate-50 border-t border-slate-200 flex-wrap">
            <span className="text-[13px] text-gray-700">
              {ready
                ? <><span className="text-emerald-700 font-semibold">✓ 必要なものが揃っています</span><span className="ml-2">{isAdmin ? '所有株式数証明書などの請求内容を登録してください' : isSec ? '残高証明などの請求内容を登録してください' : '残高証明・取引履歴の請求内容を登録してください'}</span></>
                : <><span className="text-amber-700 font-semibold">まだ請求できません</span><span className="ml-2 text-gray-600">{missing.join('／')}</span></>}
              {requests.length > 0 && <span className="ml-2 text-[12px] text-gray-400">登録済み {requests.length}件</span>}
            </span>
            <button type="button" onClick={openRequest} disabled={!ready}
              className={`ml-auto inline-flex items-center gap-1 px-4 py-2 text-[13px] font-semibold ${ready ? 'text-white bg-brand-600 hover:bg-brand-700' : 'text-gray-400 bg-gray-200 cursor-not-allowed'}`}>
              <Plus className="w-3.5 h-3.5" />請求を登録
            </button>
          </div>
        </>)
      })()}
    </div>
  )
}

// ── ほふり照会のページ ──────────────────────────────────────────
// 証券・信託タブの入口。どこに株があるか分からないときに、証券保管振替機構へ開示請求する。
// 開示結果には証券会社の取引口座と、信託銀行（株主名簿管理人）の特別口座が一緒に載るので、
// 1行1機関で表に入れ、「調査先に追加」で左レールに増やす。全行を追加したら照会は完了。
function JasdecPage({ inst: i, ev, rows, institutions, caseId, scopePrefix, today, save, addRow, saveRow, deleteRow, addInstitution, openInstitution }: {
  inst: FinancialInstitutionRow; ev: InstitutionEvaluation; rows: FinancialJasdecResultRow[]; institutions: FinancialInstitutionRow[]
  caseId: string; scopePrefix: string; today: string
  save: (p: Partial<FinancialInstitutionRow>) => Promise<void>
  addRow: () => Promise<void>; saveRow: (id: string, p: Partial<FinancialJasdecResultRow>) => Promise<void>; deleteRow: (r: FinancialJasdecResultRow) => Promise<void>
  addInstitution: (r: FinancialJasdecResultRow) => Promise<void>; openInstitution: (id: string) => void
}) {
  const notNeeded = i.jasdec_company_known === '調査不要'
  const grid4 = 'grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[9.5rem_minmax(0,1fr)_9.5rem_minmax(0,1fr)]'
  const linked = rows.filter(r => !!r.institution_id).length
  return (
    <div className="space-y-3.5">
      <ProgressSummary caseId={caseId} scopeKey={`${scopePrefix}_inst_${i.id}`} title="進捗/結果（ほふり照会）" collapsible />
      <div className="bg-white">
        <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 border-b border-gray-200">
          <span className="text-[14px] font-bold text-gray-800">ほふり照会<span className="ml-2 text-[12px] font-normal text-gray-500">証券保管振替機構への登録済加入者情報の開示請求</span></span>
          <div className="min-w-0 text-right text-[13px] text-gray-500 truncate">次の対応<span className="ml-2 text-[14px] font-semibold text-gray-800">{ev.next}</span></div>
        </div>
        <div className="p-3.5 space-y-1">
          <PhaseHeading no={1} title="ほふり照会" sub="どこに株があるか分からないときの入口。保有先が判明していれば「不要」" />
          <div className={grid4}>
            <PracticeRow label="要否" full>
              <Chk checked={notNeeded} onChange={on => void save({ jasdec_company_known: on ? '調査不要' : '不明' })} label="不要（保有先が判明している）" />
            </PracticeRow>
            {!notNeeded && (<>
              <PracticeRow label="調査対象住所" sub="現住所・旧住所。複数可" full><TxtCell value={i.jasdec_searched_addresses} onCommit={v => void save({ jasdec_searched_addresses: v || null })} placeholder="住所を「、」区切りで" /></PracticeRow>
              <PracticeRow label="開示請求日"><DateCell value={i.jasdec_request_date} onCommit={v => void save({ jasdec_request_date: v || null })} /></PracticeRow>
              <PracticeRow label="結果到着"><Chk checked={!!i.jasdec_arrival_date} onChange={on => void save({ jasdec_arrival_date: on ? today : null })} label="届いた" note={md(i.jasdec_arrival_date)} /></PracticeRow>
            </>)}
          </div>

          {!notNeeded && (<>
            <PhaseHeading no={2} title="判明した口座管理機関" sub="開示結果の一覧をそのまま入れる。「調査先に追加」で左レールに増える" />
            <div className="px-1 pt-2">
              <table className="w-full text-[13px] border-collapse">
                <thead><tr>
                  <th className="px-2 py-2 text-left">機関名</th><th className="px-2 py-2 text-left w-36">区分</th><th className="px-2 py-2 text-left w-28">口座の種類</th><th className="px-2 py-2 text-left w-40">調査先</th><th className="w-8" />
                </tr></thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-5 text-center text-gray-400 text-[12.5px]">{i.jasdec_arrival_date ? '開示結果に載っている機関を1行ずつ追加してください' : '結果が届いたら、載っている機関をここに入れます'}</td></tr>
                  ) : rows.map(r => {
                    const linkedInst = r.institution_id ? institutions.find(x => x.id === r.institution_id) : null
                    return (
                      <tr key={r.id} className="border-b border-gray-100">
                        <td className="px-2 py-1.5"><TxtCell value={r.name} onCommit={v => void saveRow(r.id, { name: v })} placeholder={r.kind === '株主名簿管理人' ? '例：三井住友信託銀行' : '例：野村證券 横浜支店'} /></td>
                        <td className="px-2 py-1.5"><SelCell value={r.kind} options={[...JASDEC_RESULT_KINDS]} onChange={v => void saveRow(r.id, { kind: v || '証券会社', account_kind: v === '株主名簿管理人' ? '特別口座' : '取引口座' })} /></td>
                        <td className="px-2 py-1.5"><SelCell value={r.account_kind} options={[...JASDEC_ACCOUNT_KINDS]} onChange={v => void saveRow(r.id, { account_kind: v || null })} /></td>
                        <td className="px-2 py-1.5">
                          {linkedInst
                            ? <button type="button" onClick={() => openInstitution(linkedInst.id)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 hover:underline">✓ 追加済み（{linkedInst.name}）</button>
                            : <button type="button" onClick={() => void addInstitution(r)} className="px-2.5 py-1 text-[12px] font-semibold text-brand-700 bg-white border border-brand-400 hover:bg-brand-50">＋ 調査先に追加</button>}
                        </td>
                        <td className="px-1 py-1.5 text-center"><button type="button" onClick={() => void deleteRow(r)} className="text-gray-300 hover:text-red-500" title="外す"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex items-center gap-3 mt-2">
                <button type="button" onClick={() => void addRow()} className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50"><Plus className="w-3.5 h-3.5" />機関を追加</button>
                {rows.length > 0 && <span className="text-[12px] text-gray-500">調査先へ {linked}／{rows.length}</span>}
              </div>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}

// ── 銘柄の表（証券会社・株主名簿管理人） ──────────────────────
// 証券会社の残高証明が届いたら、銘柄をここに登録する。国内株式は株主名簿管理人（信託銀行）を入れると
// 「調査先に追加」で信託銀行のページが生まれる（特別口座・未受領配当の請求はそちら）。
function NumCell({ value, onCommit, step = 1 }: { value: number | null; onCommit: (v: number | null) => void; step?: number }) {
  return <input type="number" step={step} defaultValue={value ?? ''} key={`n-${value ?? ''}`} onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (value ?? null)) onCommit(v) }} className="input-flat w-full px-2.5 py-1.5 text-[14px] text-gray-800 outline-none text-right tabular-nums" />
}
function HoldingsTable({ inst, holdings, institutions, addHolding, saveHolding, deleteHolding, addAdministratorInstitution, openInstitution }: {
  inst: FinancialInstitutionRow; holdings: SecuritiesHoldingRow[]; institutions: FinancialInstitutionRow[]
  addHolding: () => void; saveHolding: (id: string, p: Partial<SecuritiesHoldingRow>) => Promise<void>; deleteHolding: (h: SecuritiesHoldingRow) => void
  addAdministratorInstitution: (name: string) => Promise<void>; openInstitution: (id: string) => void
}) {
  const isAdmin = inst.kind === '株主名簿管理人'
  const rows = [...holdings].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
  const total = rows.reduce((x, h) => x + (h.amount ?? ((h.quantity ?? 0) * (h.unit_price ?? 0))), 0)
  const adminApplies = (h: SecuritiesHoldingRow) => h.kind === '国内株式' || h.kind === 'ETF・REIT' || h.kind == null
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] text-gray-500">{isAdmin ? '特別口座の株式や未受領配当。所有株式数証明書から転記します。' : '残高証明書から銘柄・数量・評価額を転記します。国内株式は株主名簿管理人を入れると、その信託銀行を調査先に足せます。'}</p>
        <button type="button" onClick={addHolding} className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50"><Plus className="w-3.5 h-3.5" />銘柄を追加</button>
      </div>
      <datalist id="admin-candidates">{KNOWN_ADMINISTRATORS.map(a => <option key={a} value={a} />)}</datalist>
      <table className="w-full text-[13px] border-collapse">
        <thead><tr>
          <th className="px-2 py-2 text-left">銘柄名</th><th className="px-2 py-2 text-left w-20">コード</th><th className="px-2 py-2 text-left w-28">種類</th>
          <th className="px-2 py-2 text-right w-24">数量</th><th className="px-2 py-2 text-right w-24">単価</th><th className="px-2 py-2 text-right w-32">評価額</th><th className="px-2 py-2 text-left w-32">基準日</th>
          {!isAdmin && <th className="px-2 py-2 text-left w-56">株主名簿管理人</th>}
          <th className="px-2 py-2 text-left">備考</th><th className="w-8" />
        </tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={isAdmin ? 9 : 10} className="px-3 py-5 text-center text-gray-400">銘柄がありません</td></tr> : rows.map(h => {
            const adminInst = h.administrator ? institutions.find(x => x.kind === '株主名簿管理人' && x.name.trim() === h.administrator!.trim()) : null
            return (
              <tr key={h.id} className="border-b border-gray-100 [&>td]:align-middle">
                <td className="px-2 py-1"><TxtCell value={h.brand_name} onCommit={v => void saveHolding(h.id, { brand_name: v || null })} placeholder="例：トヨタ自動車" /></td>
                <td className="px-2 py-1"><TxtCell value={h.code} onCommit={v => void saveHolding(h.id, { code: v || null })} placeholder="7203" /></td>
                <td className="px-2 py-1"><SelCell value={h.kind} options={[...HOLDING_KINDS]} onChange={v => void saveHolding(h.id, { kind: v || null, ...(v && v !== '国内株式' && v !== 'ETF・REIT' && !h.administrator ? { admin_status: '対象外' } : {}), ...((v === '国内株式' || v === 'ETF・REIT') && h.admin_status === '対象外' ? { admin_status: h.administrator ? '特定済' : '未特定' } : {}) })} /></td>
                <td className="px-2 py-1"><NumCell value={h.quantity} onCommit={v => void saveHolding(h.id, { quantity: v })} /></td>
                <td className="px-2 py-1"><NumCell value={h.unit_price} onCommit={v => void saveHolding(h.id, { unit_price: v })} step={0.01} /></td>
                <td className="px-2 py-1"><MoneyCell value={h.amount ?? ((h.quantity != null && h.unit_price != null) ? h.quantity * h.unit_price : null)} onCommit={v => void saveHolding(h.id, { amount: v === '' ? null : Number(v) })} /></td>
                <td className="px-2 py-1"><DateCell value={h.base_date} onCommit={v => void saveHolding(h.id, { base_date: v || null })} /></td>
                {!isAdmin && (
                  <td className="px-2 py-1">
                    {!adminApplies(h) && h.admin_status === '対象外'
                      ? <span className="text-[12px] text-gray-400">対象外（{h.kind}）</span>
                      : (
                        <div className="flex items-center gap-1.5">
                          <TxtCell value={h.administrator} list="admin-candidates" placeholder="例：三井住友信託銀行" onCommit={v => { const name = v.trim() ? canonicalAdministratorName(v) : null; void saveHolding(h.id, { administrator: name, admin_status: name ? '特定済' : '未特定' }) }} />
                          {h.administrator && (adminInst
                            ? <button type="button" onClick={() => openInstitution(adminInst.id)} className="flex-none text-[11.5px] font-semibold text-emerald-700 hover:underline" title="調査先を開く">✓</button>
                            : <button type="button" onClick={() => void addAdministratorInstitution(h.administrator!)} className="flex-none px-2 py-0.5 text-[11.5px] font-semibold text-brand-700 bg-white border border-brand-400 hover:bg-brand-50 whitespace-nowrap">＋ 調査先</button>)}
                        </div>
                      )}
                  </td>
                )}
                <td className="px-2 py-1"><TxtCell value={h.note} onCommit={v => void saveHolding(h.id, { note: v || null })} placeholder="—" /></td>
                <td className="px-1 py-1 text-center"><button type="button" onClick={() => deleteHolding(h)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button></td>
              </tr>
            )
          })}
        </tbody>
        {rows.length > 0 && <tfoot><tr className="bg-gray-50 font-semibold text-gray-700"><td colSpan={5} className="px-2 py-2 text-right">合計</td><td className="px-2 py-2 text-right tabular-nums">{yen(total)}</td><td colSpan={isAdmin ? 3 : 4} /></tr></tfoot>}
      </table>
    </div>
  )
}

// ── 調査先を追加 ──────────────────────────────────────────────
function AddInstitutionModal({ kind, onClose, onSubmit }: { kind: Kind; onClose: () => void; onSubmit: (f: { kind: FinancialInstitutionRow['kind']; name: string; branch: string; code: string }) => Promise<void> }) {
  // 証券・信託タブでは、ほふりはレール先頭の「ほふり照会」から作るので、ここでは選ばせない
  const options = kind === '証券・信託' ? KINDS_OF[kind].filter(o => o !== 'ほふり') : KINDS_OF[kind]
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
          <label className="block"><span className="text-[12px] text-gray-500">種別</span>
            <select value={k} onChange={e => setK(e.target.value as FinancialInstitutionRow['kind'])} style={{ fontFamily: 'inherit' }} className={inp}>
              {options.map(o => <option key={o} value={o}>{o === 'ほふり' ? '証券会社が不明（ほふりに開示請求）' : o === '証券' ? '証券会社' : o === '株主名簿管理人' ? '株主名簿管理人（信託銀行等）' : o}</option>)}
            </select>
          </label>
        )}
        {!isJasdec && <>
          <label className="block"><span className="text-[12px] text-gray-500">{k === '株主名簿管理人' ? '株主名簿管理人（信託銀行等）' : k === '証券' ? '証券会社名' : '金融機関名'} <span className="text-red-500">*</span></span><input value={name} onChange={e => setName(e.target.value)} className={inp} placeholder={k === '預金' ? '例：横浜銀行' : k === '証券' ? '例：東都証券' : '例：三菱UFJ信託銀行'} autoFocus /></label>
          {k !== '株主名簿管理人' && <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-[12px] text-gray-500">支店名（任意）</span><input value={branch} onChange={e => setBranch(e.target.value)} className={inp} placeholder="例：横浜駅前支店" /></label>
            <label className="block"><span className="text-[12px] text-gray-500">金融機関コード（任意）</span><input value={code} onChange={e => setCode(e.target.value)} className={inp} placeholder="例：0138" /></label>
          </div>}
        </>}
        {isJasdec && <p className="text-[12px] text-gray-600">証券保管振替機構（ほふり）を調査先として1件追加します。開示結果から証券会社を足していきます。</p>}
      </div>
    </Modal>
  )
}
