'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Banknote, ClipboardList, Hourglass, CheckCircle2, AlertCircle, AlertTriangle, Undo2, Upload, Receipt, X, type LucideIcon } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import CreateInvoiceModal from './CreateInvoiceModal'
import EditInvoiceModal from './EditInvoiceModal'
import RecordPaymentModal from './RecordPaymentModal'
import BankCsvReconcileModal from './BankCsvReconcileModal'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import Button from '@/components/ui/Button'
import UserAvatar from '@/components/ui/UserAvatar'
import { Edit2, FileText, MessagesSquare, MoreHorizontal } from 'lucide-react'
import { useResizableColumns, ResizeHandle } from '@/lib/useResizableColumns'
import { openOfficialInvoice, openOfficialReceipt } from '@/lib/openInvoiceDoc'
import OpenInvoiceButton from './OpenInvoiceButton'
import { showToast } from '@/components/ui/Toast'
import { INVOICE_STATUS_STYLES, INVOICE_TYPE_LABEL, INVOICE_TYPE_STYLES, getCaseStatusLabel, billingPatternOf } from '@/lib/constants'
import UnmatchedDepositsPanel from './UnmatchedDepositsPanel'
import RefundListModal from './RefundListModal'
import type { BillingRequestRow } from './BillingRequestsPanel'
import BillingRefundRequestsList from './BillingRefundRequestsList'
import RespondBillingRequestModal, { type ConfirmRequestLite } from './RespondBillingRequestModal'
import { resolutionOf } from '@/lib/billingRequests'
import BillingRequestModal, { type RequestInvoice } from './BillingRequestModal'
import type { InvoiceRow, InvoiceStatus, CaseRow, ClientRow, MemberRow, CaseMemberRow, PaymentRow, UnmatchedDepositRow } from '@/types'

// 請求書に紐づく入金状況確認依頼（一覧表示用の軽量版）
type PayCheckLite = {
  id: string
  status: '依頼中' | '確認済'
  result_note: string | null
  requested_date: string
  confirmed_date: string | null
  confirmer_id: string | null
  auto_closed: boolean
}

type InvoiceWithRelations = InvoiceRow & {
  cases: CaseRow & {
    clients: ClientRow | null
    case_members: (CaseMemberRow & { members: MemberRow })[]
  }
  payments: PaymentRow[]
  payment_check_requests: PayCheckLite[]
}

type CaseOption = { id: string; case_number: string; deal_name: string }

type Props = {
  invoices: InvoiceWithRelations[]
  cases: CaseOption[]
  /** CSVのみ（システムに該当なし）の未処理入金 */
  deposits?: UnmatchedDepositRow[]
  /** 確認依頼／返金依頼（未完了） */
  requests?: BillingRequestRow[]
  currentMemberId?: string | null
  /** 銀行CSV取込・入金突合ができるか（経理・システム管理者のみ） */
  canReconcile?: boolean
  /** マイページ等に埋め込むとき（PageHeaderを出さず、検索/月だけのツールバーにする） */
  embedded?: boolean
}

// 手動で選べるステータス。入金済は「入金消込」／CSV突合で payments を伴って確定するためここには含めない。
const EDITABLE_STATUSES: InvoiceStatus[] = ['作成済', '入金待ち']

function fmt(n: number) {
  if (n === 0) return '—'
  return '¥' + n.toLocaleString()
}

function getPaidAmount(payments: PaymentRow[] | null | undefined): number {
  if (!payments || payments.length === 0) return 0
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

// 返金合計（正の額）。is_refund 行の amount はマイナスなので符号反転して合算。
function getRefundTotal(payments: PaymentRow[] | null | undefined): number {
  if (!payments || payments.length === 0) return 0
  return payments.filter(p => p.is_refund).reduce((sum, p) => sum - p.amount, 0)
}

// 入金期日からの超過日数。未入金（入金済/未請求以外）かつ期日を過ぎた場合のみ正の値、それ以外は null。
function overdueDays(dueDate: string | null, status: InvoiceStatus, todayMs: number): number | null {
  if (!dueDate || status === '入金済' || status === '未請求') return null
  const due = new Date(`${dueDate}T00:00:00`).getTime()
  if (isNaN(due)) return null
  const d = Math.floor((todayMs - due) / 86_400_000)
  return d > 0 ? d : null
}

type Assignee = { id: string; name: string; avatarUrl: string | null }
function getAssignees(caseData: InvoiceWithRelations['cases'] | null): {
  sales: Assignee | null
  manager: Assignee | null
} {
  const sales = caseData?.case_members?.find(cm => cm.role === 'sales')?.members ?? null
  const manager = caseData?.case_members?.find(cm => cm.role === 'manager')?.members ?? null
  const toA = (m: MemberRow | null): Assignee | null =>
    m ? { id: m.id, name: m.name, avatarUrl: m.avatar_url ?? null } : null
  return { sales: toA(sales), manager: toA(manager) }
}

// 契約形態 → 行/司/連名 色（行=青/司=赤/連名=紫）
function contractDot(contractType: string | null | undefined): { cls: string; label: string } {
  switch (contractType) {
    case '行政書士法人単独': return { cls: 'bg-blue-500', label: '行' }
    case '司法書士法人単独': return { cls: 'bg-red-500', label: '司' }
    case '行・司連名':       return { cls: 'bg-purple-500', label: '連' }
    default:                 return { cls: 'bg-gray-300', label: '—' }
  }
}

export default function BillingClient({ invoices, cases, deposits = [], requests = [], currentMemberId = null, canReconcile = false, embedded = false }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const caseFromUrl = searchParams.get('case')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [caseFilter, setCaseFilter] = useState<string | null>(caseFromUrl)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 行/司サマリーの開閉（既定は閉じる。請求合計KPIクリックで開く）
  const [showFirmSummary, setShowFirmSummary] = useState(false)

  // URL の ?case= が変わったら state にも反映
  useEffect(() => {
    setCaseFilter(caseFromUrl)
  }, [caseFromUrl])

  const filteredCase = useMemo(() =>
    caseFilter ? cases.find(c => c.id === caseFilter) ?? null : null,
    [caseFilter, cases]
  )

  const clearCaseFilter = () => {
    setCaseFilter(null)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('case')
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
  }

  const { widths: colWidths, reset: resetColWidths, startResize: startColResize } = useResizableColumns('billingListColWidths', {
    caseNo: 140, case: 180, pattern: 120, route: 110, referral: 130, type: 90, caseStatus: 100, sales: 110, manager: 110, status: 120, actionStatus: 130, reviewReason: 200, dueDate: 100, overdue: 140, amount: 110, advance: 100, expenses: 100, paid: 100, refund: 100, diff: 90, invoiceDate: 100, pdf: 90, receipt: 90, remarks: 160, actions: 90,
  })
  const HEADERS: Array<{ key: keyof typeof colWidths; label: string; align?: 'left' | 'right' }> = [
    { key: 'caseNo', label: '案件番号' },
    { key: 'case', label: '案件名' },
    { key: 'pattern', label: '請求パターン' },
    { key: 'route', label: '受注ルート' },
    { key: 'referral', label: '紹介元' },
    { key: 'type', label: '請求分類' },
    { key: 'caseStatus', label: '案件ステータス' },
    { key: 'sales', label: '受注担当' },
    { key: 'manager', label: '管理担当' },
    { key: 'status', label: '入金ステータス' },
    { key: 'actionStatus', label: '対応状況' },
    { key: 'reviewReason', label: '要確認理由' },
    { key: 'dueDate', label: '入金期日' },
    { key: 'overdue', label: '超過日数' },
    { key: 'amount', label: '請求金額', align: 'right' },
    { key: 'advance', label: '前受金', align: 'right' },
    { key: 'expenses', label: '実費', align: 'right' },
    { key: 'paid', label: '入金済額', align: 'right' },
    { key: 'refund', label: '返金額', align: 'right' },
    { key: 'diff', label: '差額', align: 'right' },
    { key: 'invoiceDate', label: '請求日' },
    { key: 'pdf', label: '請求書' },
    { key: 'receipt', label: '領収書' },
    { key: 'remarks', label: '備考' },
    { key: 'actions', label: '操作' },
  ]

  // Modal states
  const [createOpen, setCreateOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [editInvoice, setEditInvoice] = useState<InvoiceWithRelations | null>(null)
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceWithRelations | null>(null)
  const [deleteInvoice, setDeleteInvoice] = useState<InvoiceWithRelations | null>(null)

  // 一覧で選択中の「未請求」行（請求書発行ボタンで使う）
  const [checkedInvoiceId, setCheckedInvoiceId] = useState<string | null>(null)
  // 一括操作用の選択（複数）
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // 月フィルタ（KPIs用）
  const ymToday = new Date().toISOString().slice(0, 7)
  const [monthFilter, setMonthFilter] = useState<string>(ymToday)

  // 月候補（過去12ヶ月 + 全期間）
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = []
    const today = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = i === 0 ? `今月 (${d.getFullYear()}年${d.getMonth() + 1}月)` : `${d.getFullYear()}年${d.getMonth() + 1}月`
      opts.push({ value: ym, label })
    }
    opts.push({ value: 'all', label: '全期間' })
    return opts
  }, [])

  // KPI 計算対象の invoices（月でフィルタ済み）
  const monthFilteredInvoices = useMemo(() => {
    if (monthFilter === 'all') return invoices
    return invoices.filter(inv => (inv.issued_date ?? '').startsWith(monthFilter) || (!inv.issued_date && inv.status === '未請求'))
  }, [invoices, monthFilter])

  const checkedInvoice = useMemo(
    () => checkedInvoiceId ? invoices.find(i => i.id === checkedInvoiceId) ?? null : null,
    [checkedInvoiceId, invoices]
  )

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (caseFilter && inv.case_id !== caseFilter) return false
      // 月フィルタ：入金期日がその月のものだけ（要確認は横断キューなので対象外）
      if (monthFilter !== 'all' && statusFilter !== 'review' && !(inv.due_date ?? '').startsWith(monthFilter)) return false
      if (statusFilter === 'review') {
        if (!inv.needs_review) return false
      } else if (statusFilter === 'waiting') {
        if (inv.status !== '入金待ち') return false
      } else if (statusFilter !== 'all' && inv.status !== statusFilter) {
        return false
      }
      if (search) {
        const s = search.toLowerCase()
        const caseName = inv.cases?.deal_name || ''
        const caseNumber = inv.cases?.case_number || ''
        const clientName = inv.cases?.clients?.name || ''
        if (
          !caseName.toLowerCase().includes(s) &&
          !caseNumber.toLowerCase().includes(s) &&
          !clientName.toLowerCase().includes(s)
        ) return false
      }
      return true
    })
  }, [invoices, caseFilter, statusFilter, search, monthFilter])

  // 請求合計の内訳（発行済のみ）：純額（返金控除後）・入金済（実受領・純額）・未入金・返金。
  const collection = useMemo(() => {
    const issued = monthFilteredInvoices.filter(inv => inv.status !== '未請求')
    const gross = issued.reduce((s, inv) => s + inv.amount, 0)
    const refunds = issued.reduce((s, inv) => s + getRefundTotal(inv.payments), 0)
    const netBilled = Math.max(0, gross - refunds)
    const collected = issued.reduce((s, inv) => s + Math.max(0, Math.min(inv.amount, getPaidAmount(inv.payments))), 0)
    return { total: netBilled, refunds, collected, outstanding: Math.max(0, netBilled - collected), count: issued.length }
  }, [monthFilteredInvoices])

  // 返金一覧（当月・KPIの返金額クリックで開く）
  const refundEntries = useMemo(() => {
    const out: import('./RefundListModal').RefundEntry[] = []
    for (const inv of monthFilteredInvoices) {
      for (const p of inv.payments ?? []) {
        if (p.is_refund) out.push({ id: p.id, caseId: inv.case_id, caseNumber: inv.cases?.case_number ?? '', dealName: inv.cases?.deal_name ?? '', date: p.payment_date, amount: -p.amount, reason: p.match_note ?? '' })
      }
    }
    return out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [monthFilteredInvoices])
  const [refundListOpen, setRefundListOpen] = useState(false)
  // 行の「依頼」（確認依頼/返金依頼を種類選択するモーダル）
  const [requestTarget, setRequestTarget] = useState<{ inv: RequestInvoice; defaultMode: 'confirm' | 'refund' } | null>(null)

  // 確認依頼/返金依頼(未完了)を invoice_id で対応づけ（対応状況列・操作パネルに使う）
  const confirmByInvoice = new Map<string, BillingRequestRow>()
  const refundByInvoice = new Map<string, BillingRequestRow>()
  for (const r of requests) {
    if (r.status === '完了') continue
    if (r.kind === 'confirm') confirmByInvoice.set(r.invoice_id, r)
    else if (r.kind === 'refund') refundByInvoice.set(r.invoice_id, r)
  }
  const refundReqs = requests.filter(r => r.kind === 'refund' && r.status !== '完了')
  // 行の「対応状況」（1状態）：返金依頼 > 確認依頼中 > 確認済(判定) > 要確認(未依頼) > なし
  const actionStatusOf = (inv: InvoiceWithRelations): { label: string; cls: string } | null => {
    if (refundByInvoice.has(inv.id)) return { label: '返金依頼', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
    const c = confirmByInvoice.get(inv.id)
    if (c?.status === '依頼中') return { label: '確認依頼中', cls: 'bg-brand-50 text-brand-700 border-brand-200' }
    if (c?.status === '回答済') { const r = resolutionOf(c.resolution); return { label: `確認済${r ? `・${r.label}` : ''}`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' } }
    if (inv.needs_review) return { label: '要確認', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    return null
  }
  // 確認依頼への回答（受注/管理）はアラートから自動オープン
  const [respondTarget, setRespondTarget] = useState<ConfirmRequestLite | null>(null)
  // アラート(?respond=1)から来たら、その案件の未回答の確認依頼を自動でモーダル表示（案件ごとに1回）
  const respondHandledRef = useRef<string | null>(null)
  useEffect(() => {
    if (searchParams.get('respond') !== '1' || !caseFilter || respondHandledRef.current === caseFilter) return
    const req = requests.find(r => r.kind === 'confirm' && r.status === '依頼中' && r.case_id === caseFilter)
    if (req) { respondHandledRef.current = caseFilter; setRespondTarget({ id: req.id, case_id: req.case_id, requester_id: req.requester_id, request_note: req.request_note, caseNumber: req.caseNumber, dealName: req.dealName }) }
  }, [searchParams, caseFilter, requests])

  const kpis = useMemo(() => {
    const src = monthFilteredInvoices
    const unpaid = src.filter(inv => inv.status === '未請求').length
    const created = src.filter(inv => inv.status === '作成済').length
    const waiting = src.filter(inv => inv.status === '入金待ち').length
    const waitingAmt = src
      .filter(inv => inv.status === '入金待ち')
      .reduce((s, inv) => s + inv.amount - getPaidAmount(inv.payments), 0)
    const paid = src.filter(inv => inv.status === '入金済').length
    // 要確認（CSV突合②③）・返金依頼は全期間で件数管理（月フィルタ非依存の処理待ちキュー）
    const review = invoices.filter(inv => inv.needs_review).length
    const refundOpen = requests.filter(r => r.kind === 'refund' && r.status !== '完了').length
    return [
      { key: 'all',     label: '請求合計', Icon: Banknote as LucideIcon,      value: fmt(collection.total), sub: `${collection.count}件発行済` },
      { key: '未請求',   label: '未請求',   Icon: ClipboardList as LucideIcon, value: String(unpaid),     sub: '請求書未発行', color: 'text-gray-500' },
      { key: '作成済',   label: '作成済',   Icon: AlertCircle as LucideIcon,   value: String(created),    sub: '請求書作成済', color: 'text-gray-700' },
      { key: '入金待ち', label: '入金待ち', Icon: Hourglass as LucideIcon,     value: String(waiting),    sub: fmt(waitingAmt), color: 'text-amber-600' },
      { key: 'review',   label: '要確認',   Icon: AlertTriangle as LucideIcon, value: String(review),     sub: 'CSV突合②③', color: 'text-amber-700' },
      { key: 'refund',   label: '返金依頼', Icon: Undo2 as LucideIcon,         value: String(refundOpen), sub: '経理の対応待ち', color: 'text-rose-600' },
      { key: '入金済',   label: '入金済',   Icon: CheckCircle2 as LucideIcon,  value: String(paid),       sub: fmt(collection.collected), color: 'text-green-600' },
    ]
  }, [monthFilteredInvoices, invoices, collection, requests])

  // 行/司 別の集計（発行済のみ）。請求合計・前受金・確定請求・入金を法人で分ける
  const firmSummary = useMemo(() => {
    const issued = monthFilteredInvoices.filter(inv => inv.status !== '未請求')
    const calc = (pred: (inv: InvoiceWithRelations) => boolean) => {
      const rows = issued.filter(pred)
      return {
        count: rows.length,
        total: rows.reduce((s, inv) => s + inv.amount, 0),
        advance: rows.filter(inv => inv.invoice_type === '前受金').reduce((s, inv) => s + inv.amount, 0),
        confirmed: rows.filter(inv => inv.invoice_type === '確定請求').reduce((s, inv) => s + inv.amount, 0),
        paid: rows.reduce((s, inv) => s + getPaidAmount(inv.payments), 0),
      }
    }
    return {
      gyosei: calc(inv => inv.firm_type === 'gyosei'),
      shiho: calc(inv => inv.firm_type === 'shiho'),
      unset: calc(inv => inv.firm_type !== 'gyosei' && inv.firm_type !== 'shiho'),
    }
  }, [monthFilteredInvoices])

  const selected = selectedId ? invoices.find(inv => inv.id === selectedId) ?? null : null

  const handleDeleteInvoice = async () => {
    if (!deleteInvoice) return
    const supabase = createClient()
    // Delete related payments first
    await supabase.from('payments').delete().eq('invoice_id', deleteInvoice.id)
    const { error } = await supabase.from('invoices').delete().eq('id', deleteInvoice.id)
    if (error) throw new Error(error.message)
    setDeleteInvoice(null)
    setSelectedId(null)
    router.refresh()
  }


  // 備考のインライン保存
  const handleNotesCommit = async (invoiceId: string, value: string) => {
    const supabase = createClient()
    await supabase.from('invoices').update({ notes: value || null }).eq('id', invoiceId)
  }
  // 領収書を発行（生成）→発行日が入るので一覧を更新
  const handleIssueReceipt = async (invoiceId: string) => {
    await openOfficialReceipt(invoiceId)
    router.refresh()
  }

  const handleStatusChange = async (invoiceId: string, nextStatus: InvoiceStatus) => {
    try {
      const supabase = createClient()
      // 入金済にした場合は「要確認（CSV突合②③）」フラグも解消する
      const update: { status: InvoiceStatus; needs_review?: boolean; review_reason?: null } = { status: nextStatus }
      if (nextStatus === '入金済') { update.needs_review = false; update.review_reason = null }
      const { error } = await supabase.from('invoices').update(update).eq('id', invoiceId)
      if (error) throw error
      showToast(`ステータスを「${nextStatus}」に変更しました`, 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      showToast('ステータス変更に失敗しました', 'error')
    }
  }

  // 一括: 選択切替
  const toggleBulkSelect = (invoiceId: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(invoiceId)) next.delete(invoiceId)
      else next.add(invoiceId)
      return next
    })
  }

  // 一括: 表示中の全行を選択 / 解除
  const toggleSelectAll = (ids: string[]) => {
    setBulkSelected(prev => {
      const all = ids.every(id => prev.has(id))
      const next = new Set(prev)
      if (all) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  const clearBulkSelection = () => setBulkSelected(new Set())

  // 一括: ステータス変更
  const handleBulkStatus = async (nextStatus: InvoiceStatus) => {
    if (bulkSelected.size === 0 || bulkBusy) return
    setBulkBusy(true)
    try {
      const supabase = createClient()
      const ids = Array.from(bulkSelected)
      const { error } = await supabase.from('invoices').update({ status: nextStatus }).in('id', ids)
      if (error) throw error
      showToast(`${ids.length} 件のステータスを「${nextStatus}」に変更しました`, 'success')
      clearBulkSelection()
      router.refresh()
    } catch (e) {
      console.error(e)
      showToast('一括変更に失敗しました', 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  // 一括: 削除
  const handleBulkDelete = async () => {
    if (bulkSelected.size === 0 || bulkBusy) return
    setBulkBusy(true)
    try {
      const supabase = createClient()
      const ids = Array.from(bulkSelected)
      await supabase.from('payments').delete().in('invoice_id', ids)
      const { error } = await supabase.from('invoices').delete().in('id', ids)
      if (error) throw error
      showToast(`${ids.length} 件を削除しました`, 'success')
      clearBulkSelection()
      setBulkDeleteOpen(false)
      router.refresh()
    } catch (e) {
      console.error(e)
      showToast('一括削除に失敗しました', 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  const toolbar = (
    <>
      <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
        <span className="text-gray-400 text-xs">🔍</span>
        <input
          type="text"
          placeholder="案件名・依頼者で検索"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-transparent border-none outline-none text-xs text-gray-700 w-44 placeholder:text-gray-300"
        />
      </div>
      <select
        value={monthFilter}
        onChange={e => setMonthFilter(e.target.value)}
        className="px-2.5 py-1 text-[12px] border border-gray-300 rounded-md focus:border-brand-400 outline-none bg-white"
        title="集計・表示期間（入金期日）"
      >
        {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {canReconcile && (
        <Button variant="secondary" size="sm" leftIcon={<Upload className="w-3.5 h-3.5" strokeWidth={2} />} onClick={() => setCsvOpen(true)}>
          入金突合
        </Button>
      )}
      {canReconcile && !embedded && (
        <Link
          href="/billing/sales-report"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition"
        >
          📊 確定売上表
        </Link>
      )}
      {canReconcile && !embedded && (
        <Link
          href="/billing/payment-detail"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition"
        >
          🧾 入金明細
        </Link>
      )}
    </>
  )

  return (
    <div>
      {embedded ? (
        <div className="flex items-center justify-end gap-1.5 mb-4 flex-wrap">{toolbar}</div>
      ) : (
        <PageHeader eyebrow="Billing" title="請求・入金管理" icon={Receipt} description="請求書発行・入金消込・銀行CSV突合" right={toolbar} />
      )}

      {/* 案件フィルタ表示（?case= で遷移してきた場合） */}
      {filteredCase && (
        <div className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 bg-brand-50 border border-brand-200 rounded-full text-[13px]">
          <span className="text-gray-500">この案件で絞り込み中:</span>
          <span className="font-mono text-brand-700 bg-white px-1.5 py-0.5 rounded border border-brand-200 text-[12px]">
            {filteredCase.case_number}
          </span>
          <span className="font-semibold text-gray-900">{filteredCase.deal_name}</span>
          <button
            onClick={clearCaseFilter}
            className="ml-1 p-0.5 text-gray-400 hover:text-red-500 rounded hover:bg-white"
            title="絞り込みを解除"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 一括操作バー（選択数 > 0 時のみ） */}
      {bulkSelected.size > 0 && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-3 flex-wrap shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-800">
            <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />
            {bulkSelected.size} 件選択中
          </span>
          <span className="text-[12px] text-gray-500">一括操作:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {EDITABLE_STATUSES.map(s => {
              const style = INVOICE_STATUS_STYLES[s] ?? { bg: '', text: '', border: '', dot: '#6B7280' }
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleBulkStatus(s)}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold text-white rounded-md border shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                  style={{ backgroundColor: style.dot, borderColor: style.dot }}
                  title={`${s} に変更`}
                >
                  {s}
                </button>
              )
            })}
            <span className="text-gray-300 mx-1">|</span>
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
            >
              削除
            </button>
          </div>
          <button
            type="button"
            onClick={clearBulkSelection}
            disabled={bulkBusy}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[12px] text-gray-500 hover:text-gray-700 hover:bg-white rounded transition-colors"
          >
            <X className="w-3 h-3" />
            選択解除
          </button>
        </div>
      )}

      {/* KPI Cards（請求合計は入金済/未入金の内訳を出すため2枠ぶん） */}
      <div className="grid grid-cols-3 lg:grid-cols-8 gap-3 mb-5">
        {kpis.map(kpi => {
          const ratio = collection.total > 0 ? Math.round((collection.collected / collection.total) * 100) : 0
          return (
          <button
            key={kpi.key}
            onClick={() => { if (kpi.key === 'all') { setShowFirmSummary(s => !s); setStatusFilter('all') } else setStatusFilter(kpi.key === statusFilter ? 'all' : kpi.key) }}
            className={`bg-white border rounded-xl p-3.5 text-left transition shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md ${kpi.key === 'all' ? 'col-span-2' : ''} ${
              (kpi.key === 'all' ? showFirmSummary : statusFilter === kpi.key) ? 'border-brand-300 bg-brand-50 border-t-[3px] border-t-brand-500' : 'border-gray-200 border-t-[3px] border-t-transparent'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-semibold text-gray-500">{kpi.label}</span>
              <kpi.Icon className="w-5 h-5 text-gray-400" strokeWidth={1.75} />
            </div>
            <div className={`text-[22px] font-extrabold tracking-tight leading-none ${kpi.color || ''}`}>{kpi.value}</div>
            {kpi.key === 'all' ? (
              <>
                <div className="text-[11px] text-gray-400 mt-1">{kpi.sub}・クリックで行/司内訳</div>
                <div className="mt-2 h-[6px] rounded-full bg-rose-100 overflow-hidden flex">
                  <div className="bg-green-500 h-full" style={{ width: `${ratio}%` }} />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11.5px]">
                  <span className="text-green-700">● 入金済 <span className="font-mono font-semibold">{fmt(collection.collected)}</span></span>
                  <span className="text-rose-600">● 未入金 <span className="font-mono font-semibold">{fmt(collection.outstanding)}</span></span>
                </div>
                {collection.refunds > 0 && (
                  <span role="button" tabIndex={0}
                    onClick={e => { e.stopPropagation(); setRefundListOpen(true) }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setRefundListOpen(true) } }}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-rose-600 hover:underline cursor-pointer">
                    ▲返金 <span className="font-mono font-semibold">{fmt(collection.refunds)}</span>（純額に控除済・クリックで内訳）
                  </span>
                )}
              </>
            ) : (
              <div className="text-[12px] text-gray-400 mt-1">{kpi.sub}</div>
            )}
          </button>
          )
        })}
      </div>

      {/* 行/司 別の集計（発行法人ごと）。請求合計KPIクリックで開閉 */}
      {showFirmSummary && (<>
      <div className="grid grid-cols-2 gap-3 mb-5">
        {([
          { key: 'gyosei', label: '行政書士法人', sum: firmSummary.gyosei, ring: 'border-blue-100', head: 'bg-blue-50 border-blue-100 text-blue-800', accent: 'text-blue-800' },
          { key: 'shiho',  label: '司法書士法人', sum: firmSummary.shiho,  ring: 'border-red-100', head: 'bg-red-50 border-red-100 text-red-800', accent: 'text-red-800' },
        ] as const).map(f => (
          <div key={f.key} className={`bg-white border rounded overflow-hidden ${f.ring}`}>
            <div className={`px-4 py-2.5 flex items-center justify-between border-b ${f.head}`}>
              <span className="text-[13px] font-medium">{f.label}</span>
              <span className="text-[11px] text-gray-500">{f.sum.count}件発行済</span>
            </div>
            <div className="px-4 py-3.5 grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <div className="text-[11px] text-gray-400 mb-0.5">請求合計</div>
                <div className={`text-[19px] font-semibold font-mono leading-none ${f.accent}`}>{fmt(f.sum.total)}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-0.5">入金済</div>
                <div className="text-[19px] font-semibold font-mono leading-none text-emerald-700">{fmt(f.sum.paid)}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-0.5">前受金</div>
                <div className="text-[13px] font-medium font-mono text-gray-600">{fmt(f.sum.advance)}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-0.5">確定売上</div>
                <div className="text-[13px] font-medium font-mono text-gray-600">{fmt(f.sum.confirmed)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {firmSummary.unset.count > 0 && (
        <div className="mb-5 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          発行法人が未設定の請求書が {firmSummary.unset.count} 件（{fmt(firmSummary.unset.total)}）あります。集計を正確にするには各請求書の発行法人を設定してください。
        </div>
      )}
      </>)}

      {/* CSVのみ（システムに該当なし）の未処理入金。突合できなかった入金を後追いで紐付け／対象外に。 */}
      {canReconcile && <UnmatchedDepositsPanel deposits={deposits} invoices={invoices} onChanged={() => router.refresh()} />}

      <RefundListModal isOpen={refundListOpen} onClose={() => setRefundListOpen(false)} entries={refundEntries}
        periodLabel={monthOptions.find(o => o.value === monthFilter)?.label ?? '全期間'} />

      {requestTarget && (
        <BillingRequestModal isOpen defaultMode={requestTarget.defaultMode} invoice={requestTarget.inv} currentMemberId={currentMemberId}
          onClose={() => setRequestTarget(null)} onSaved={() => { setRequestTarget(null); router.refresh() }} />
      )}

      {respondTarget && (
        <RespondBillingRequestModal isOpen request={respondTarget}
          onClose={() => setRespondTarget(null)} onSaved={() => { setRespondTarget(null); router.refresh() }} />
      )}

      {statusFilter === 'refund' ? (
        <BillingRefundRequestsList refundReqs={refundReqs} refundEntries={refundEntries} canReconcile={canReconcile} currentMemberId={currentMemberId} onChanged={() => router.refresh()} />
      ) : (
      <div>
        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-x-auto">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2.5">
            <h2 className="text-[13px] font-semibold text-gray-900">請求・入金一覧</h2>
            <span className="text-[13px] text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded">{filtered.length}件</span>
            <button
              onClick={resetColWidths}
              className="ml-auto text-[12px] text-gray-400 hover:text-gray-600 transition"
              title="列幅をリセット"
            >
              列幅リセット
            </button>
          </div>
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 36 }} />
              {HEADERS.map(h => (
                <col key={h.key as string} style={{ width: colWidths[h.key] }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="bg-brand-50/60 border-b border-brand-100 px-2 py-2">
                  {/* 全選択（発行済の行のみが対象、未請求は別チェック用） */}
                  {(() => {
                    const issuableIds = filtered.filter(inv => inv.status !== '未請求').map(inv => inv.id)
                    const allSel = issuableIds.length > 0 && issuableIds.every(id => bulkSelected.has(id))
                    const someSel = issuableIds.some(id => bulkSelected.has(id))
                    return (
                      <input
                        type="checkbox"
                        aria-label="表示中の全請求書を選択"
                        checked={allSel}
                        ref={el => { if (el) el.indeterminate = !allSel && someSel }}
                        onChange={() => toggleSelectAll(issuableIds)}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                      />
                    )
                  })()}
                </th>
                {HEADERS.map(h => (
                  <th
                    key={h.key as string}
                    className={`relative bg-brand-50/60 border-b border-brand-100 px-3.5 py-2 text-[11px] font-medium text-brand-700 tracking-[0.04em] ${h.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {h.label}
                    <ResizeHandle onMouseDown={startColResize(h.key)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={HEADERS.length + 1} className="px-4 py-12 text-center text-sm text-gray-400">
                    該当する請求データがありません
                  </td>
                </tr>
              ) : (
                filtered.map(inv => {
                  const st = INVOICE_STATUS_STYLES[inv.status] ?? INVOICE_STATUS_STYLES['作成済']
                  const paidAmount = getPaidAmount(inv.payments)
                  const refundTotal = getRefundTotal(inv.payments)
                  const diff = inv.amount - paidAmount
                  const od = overdueDays(inv.due_date, inv.status, Date.now())
                  const { sales, manager } = getAssignees(inv.cases)
                  const cdot = contractDot(inv.cases?.contract_type)
                  const caseStatusLabel = getCaseStatusLabel(inv.cases?.status)
                  const caseName = inv.cases?.deal_name || '—'
                  const caseNumber = inv.cases?.case_number || ''
                  const deceasedName = inv.cases?.deceased_name || ''
                  const isUnissued = inv.status === '未請求'
                  const isChecked = checkedInvoiceId === inv.id
                  const isBulkSelected = bulkSelected.has(inv.id)
                  const typeLabel = INVOICE_TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type
                  const typeStyle = INVOICE_TYPE_STYLES[inv.invoice_type] ?? { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' }
                  return (
                    <tr
                      key={inv.id}
                      className={`border-b border-gray-100 last:border-b-0 transition ${
                        isBulkSelected ? 'bg-brand-50/60' :
                        isChecked ? 'bg-brand-50/80' :
                        selectedId === inv.id ? 'bg-brand-50/40' :
                        'hover:bg-gray-50/50'
                      }`}
                    >
                      <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        {isUnissued ? (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => setCheckedInvoiceId(isChecked ? null : inv.id)}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                            title="この案件で請求書を発行"
                          />
                        ) : (
                          <input
                            type="checkbox"
                            checked={isBulkSelected}
                            onChange={() => toggleBulkSelect(inv.id)}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                            title="一括操作の対象に追加"
                          />
                        )}
                      </td>
                      {/* 案件番号（左に契約形態色／クリックで案件詳細へ） */}
                      <td className="px-3.5 py-2.5 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold text-white flex-shrink-0 ${cdot.cls}`} title={inv.cases?.contract_type ?? '契約形態未設定'}>{cdot.label}</span>
                          {inv.cases?.id ? (
                            <Link href={`/cases/${inv.cases.id}`} className="font-mono text-[12px] text-gray-700 truncate hover:text-brand-700 hover:underline" title="案件詳細を開く">{caseNumber || '—'}</Link>
                          ) : (
                            <span className="font-mono text-[12px] text-gray-700 truncate">{caseNumber || '—'}</span>
                          )}
                        </div>
                      </td>
                      {/* 案件名（被相続人） */}
                      <td className="px-3.5 py-2.5 overflow-hidden">
                        {inv.cases?.id ? (
                          <Link href={`/cases/${inv.cases.id}`} onClick={e => e.stopPropagation()} className="block group min-w-0">
                            <div className="text-xs font-semibold text-gray-900 truncate group-hover:text-brand-700 group-hover:underline">{caseName}</div>
                            {deceasedName && <div className="text-[12px] text-gray-400 truncate">被相続人: {deceasedName}</div>}
                          </Link>
                        ) : (
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-gray-900 truncate">{caseName}</div>
                            {deceasedName && <div className="text-[12px] text-gray-400 truncate">被相続人: {deceasedName}</div>}
                          </div>
                        )}
                      </td>
                      {/* 請求パターン */}
                      <td className="px-3.5 py-2.5 overflow-hidden">
                        {(() => {
                          const p = billingPatternOf(inv.cases?.billing_pattern)
                          const short = p.value === 'staged' ? '段階請求' : p.value === 'lump_expense' ? '一括＋実費' : '一括のみ'
                          const cls = p.value === 'staged' ? 'bg-gray-50 text-gray-600 border-gray-200' : 'bg-brand-50 text-brand-700 border-brand-100'
                          return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`} title={p.desc}><span className="font-semibold">{p.no}</span>{short}</span>
                        })()}
                      </td>
                      {/* 受注ルート */}
                      <td className="px-3.5 py-2.5 text-xs text-gray-600 truncate">{inv.cases?.order_route || <span className="text-gray-300">—</span>}</td>
                      {/* 紹介元（詳細） */}
                      <td className="px-3.5 py-2.5 text-xs text-gray-600 truncate">{inv.cases?.order_route_detail || <span className="text-gray-300">—</span>}</td>
                      {/* 請求分類（前受金 / 確定売上）＋ 発行法人 */}
                      <td className="px-3.5 py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${typeStyle.bg} ${typeStyle.text}`}>{typeLabel}</span>
                          {inv.firm_type === 'gyosei' && <span className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[10px] font-medium bg-blue-50 text-blue-800">行政書士</span>}
                          {inv.firm_type === 'shiho' && <span className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[10px] font-medium bg-red-50 text-red-800">司法書士</span>}
                        </div>
                      </td>
                      {/* 案件ステータス */}
                      <td className="px-3.5 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium bg-slate-100 text-slate-600">{caseStatusLabel || '—'}</span>
                      </td>
                      {/* 受注担当 */}
                      <td className="px-3.5 py-2.5" onClick={e => e.stopPropagation()}>
                        {sales ? (
                          <Link href={`/profile/${sales.id}`} className="flex items-center gap-1.5 hover:text-brand-700 hover:underline">
                            <UserAvatar name={sales.name} role="sales" url={sales.avatarUrl} size="sm" />
                            <span className="text-xs text-gray-600 truncate">{sales.name}</span>
                          </Link>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      {/* 管理担当 */}
                      <td className="px-3.5 py-2.5" onClick={e => e.stopPropagation()}>
                        {manager ? (
                          <Link href={`/profile/${manager.id}`} className="flex items-center gap-1.5 hover:text-brand-700 hover:underline">
                            <UserAvatar name={manager.name} role="manager" url={manager.avatarUrl} size="sm" />
                            <span className="text-xs text-gray-600 truncate">{manager.name}</span>
                          </Link>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      {/* 入金ステータス（個別ドロップダウン編集可能） */}
                      <td className="px-3.5 py-2.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isUnissued || inv.status === '入金済' ? (
                            // 未請求・入金済は読み取り専用（入金済は入金消込／CSVでのみ確定）
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] text-[11.5px] font-medium ${st.bg} ${st.text}`} title={inv.status === '入金済' ? '入金済は入金消込／CSV突合で確定します' : undefined}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{inv.status}
                            </span>
                          ) : (
                            <select value={inv.status} onChange={e => handleStatusChange(inv.id, e.target.value as InvoiceStatus)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[11.5px] font-medium cursor-pointer outline-none focus:ring-2 focus:ring-brand-300 ${st.bg} ${st.text}`} title="クリックでステータス変更">
                              {EDITABLE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          )}
                          {(inv.payments ?? []).some(p => p.matched_by === 'ai') && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-[5px] text-[10px] font-medium bg-slate-100 text-slate-600" title="銀行CSVでAIが自動突合した入金です">AI判定</span>
                          )}
                          {refundTotal > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[10px] font-medium bg-rose-50 text-rose-700" title={`返金 ¥${refundTotal.toLocaleString()}`}>
                              {paidAmount <= 0 ? '全額返金' : '一部返金'}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* 対応状況（要確認・依頼系を1状態で表示） */}
                      <td className="px-3.5 py-2.5">
                        {(() => {
                          const a = actionStatusOf(inv)
                          return a
                            ? <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-bold border ${a.cls}`}>{a.label}</span>
                            : <span className="text-gray-300 text-xs">—</span>
                        })()}
                      </td>
                      {/* 要確認理由（CSV突合でAIが要確認にした理由） */}
                      <td className="px-3.5 py-2.5 overflow-hidden">
                        {inv.needs_review && inv.review_reason
                          ? <span className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 inline-block leading-snug" title={inv.review_reason}>{inv.review_reason}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      {/* 入金期日 */}
                      <td className={`px-3.5 py-2.5 text-xs font-mono ${od ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{inv.due_date || '—'}</td>
                      {/* 超過日数（超過した未入金のみ） */}
                      <td className="px-3.5 py-2.5">
                        {od == null ? (
                          <span className="text-gray-300 text-xs">—</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium bg-red-50 text-red-700">{od}日超過</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-xs font-mono font-medium text-gray-900">{fmt(inv.amount)}</td>
                      {/* 前受金（前受金請求＝請求額／確定請求＝差し引いた前受金控除） */}
                      <td className="px-3.5 py-2.5 text-right text-xs font-mono text-gray-700">{fmt(inv.invoice_type === '前受金' ? inv.amount : (inv.advance_deduction || 0))}</td>
                      {/* 実費（立替実費） */}
                      <td className="px-3.5 py-2.5 text-right text-xs font-mono text-gray-700">{fmt(inv.expenses_amount || 0)}</td>
                      <td className="px-3.5 py-2.5 text-right text-xs font-mono text-green-600">{fmt(paidAmount)}</td>
                      {/* 返金額 */}
                      <td className="px-3.5 py-2.5 text-right text-xs font-mono">
                        {refundTotal > 0 ? <span className="text-rose-600">−{fmt(refundTotal)}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-xs font-mono">
                        {inv.amount > 0 ? <span className={diff > 0 ? 'text-red-500' : 'text-gray-400'}>{diff > 0 ? fmt(diff) : '—'}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3.5 py-2.5 text-xs text-gray-500 font-mono">{inv.issued_date || '—'}</td>
                      {/* 請求書（公式Excelに一本化。無い旧データは開く時に生成） */}
                      <td className="px-3.5 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        {isUnissued ? (
                          <span className="text-gray-300 text-[12px]">未発行</span>
                        ) : (
                          <OpenInvoiceButton invoiceId={inv.id} />
                        )}
                      </td>
                      {/* 領収書（発行済→開く＋発行日／未発行→発行ボタン。前受金は基本発行しない運用） */}
                      <td className="px-3.5 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        {isUnissued ? (
                          <span className="text-gray-300 text-[12px]">—</span>
                        ) : inv.receipt_issued_date ? (
                          <button type="button" onClick={() => openOfficialReceipt(inv.id)} className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-50 rounded" title={`発行日 ${inv.receipt_issued_date}`}>
                            <FileText className="w-3 h-3" strokeWidth={2.25} />領収書
                          </button>
                        ) : (
                          <button type="button" onClick={() => handleIssueReceipt(inv.id)} className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 rounded" title="領収書を発行（Excel生成）">
                            <FileText className="w-3 h-3" strokeWidth={2.25} />発行
                          </button>
                        )}
                      </td>
                      {/* 備考（表上で直接編集） */}
                      <td className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
                        <RemarksCell value={inv.notes} onCommit={v => handleNotesCommit(inv.id, v)} />
                      </td>
                      {/* 操作：入金消込・確認依頼・返金依頼をまとめた右パネルを開く（回答待ちはドット表示） */}
                      <td className="px-2 py-2.5">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setSelectedId(inv.id === selectedId ? null : inv.id)}
                            className={`inline-flex items-center justify-center gap-1 w-[72px] py-1 text-[12px] font-semibold rounded border transition ${selectedId === inv.id ? 'bg-brand-50 text-brand-700 border-brand-200' : 'text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-brand-700'}`}
                            title="入金消込・確認依頼・返金依頼などの操作を開く"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={2} />操作
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Detail Panel */}
        {selected && (() => {
          const selPaidAmount = getPaidAmount(selected.payments)
          const selRefund = getRefundTotal(selected.payments)
          const selDiff = selected.amount - selPaidAmount
          const selAssignee = getAssignees(selected.cases).sales
          return (
            <>
              <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedId(null)} />
              <div className="fixed top-0 right-0 h-full w-[340px] max-w-[92vw] bg-white border-l border-gray-200 shadow-2xl z-50 overflow-y-auto">
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] text-gray-400">{selected.cases?.case_number || ''}</span>
                  <button onClick={() => setSelectedId(null)} className="w-6 h-6 rounded flex items-center justify-center text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition">✕</button>
                </div>
                <div className="text-sm font-bold text-gray-900">{selected.cases?.deal_name || '—'}</div>
                <div className="text-[13px] text-gray-400">被相続人: {selected.cases?.deceased_name || '—'}</div>
                {/* Payment flow（4ステップ統一） */}
                <div className="flex items-center gap-0 mt-3">
                  {(['未請求', '作成済', '入金待ち', '入金済'] as InvoiceStatus[]).map((step, i, arr) => {
                    const stepIndex = arr.indexOf(selected.status)
                    const passed = i < stepIndex
                    const active = i === stepIndex
                    return (
                      <div key={step} className="flex-1 flex flex-col items-center gap-1 relative">
                        <div className={`w-2.5 h-2.5 rounded-full z-10 ${active ? 'bg-green-500 ring-2 ring-green-200 w-3 h-3' : passed ? 'bg-green-500 opacity-50' : 'bg-gray-300'}`} />
                        <span className={`text-[11px] ${active ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>{step}</span>
                        {i < arr.length - 1 && <div className={`absolute top-1.5 left-1/2 right-[-50%] h-px z-0 ${passed ? 'bg-green-400 opacity-40' : 'bg-gray-200'}`} />}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="px-4 py-3 space-y-4">
                <DetailSection title="請求情報">
                  <DetailRow label="請求金額" value={fmt(selected.amount)} />
                  {selected.expenses_amount > 0 && (
                    <>
                      <DetailRow label="└ 報酬" value={fmt(selected.fee_amount)} className="text-gray-400 text-[11px]" />
                      <DetailRow label="└ 立替実費" value={fmt(selected.expenses_amount)} className="text-gray-400 text-[11px]" />
                    </>
                  )}
                  <DetailRow label="入金済額" value={fmt(selPaidAmount)} className="text-green-600" />
                  {selRefund > 0 && <DetailRow label="返金額" value={`−${fmt(selRefund)}`} className="text-rose-600" />}
                  <DetailRow label="差額" value={selected.amount > 0 ? fmt(selDiff) : '—'} className={selDiff > 0 ? 'text-red-500' : ''} />
                  <DetailRow label="請求日" value={selected.issued_date || '—'} />
                  {(() => {
                    const sOd = overdueDays(selected.due_date, selected.status, Date.now())
                    return <DetailRow label="入金期日" value={selected.due_date ? `${selected.due_date}${sOd ? `（${sOd}日超過）` : ''}` : '—'} className={sOd ? 'text-red-600 font-semibold' : ''} />
                  })()}
                </DetailSection>
                <DetailSection title="案件情報">
                  <DetailRow label="受注担当" value={selAssignee?.name || '—'} />
                  <DetailRow label="請求分類" value={INVOICE_TYPE_LABEL[selected.invoice_type] ?? selected.invoice_type} />
                  <DetailRow label="ステータス" value={selected.status} />
                </DetailSection>
                {/* Payment history */}
                {selected.payments && selected.payments.length > 0 && (
                  <DetailSection title="入金履歴">
                    {selected.payments.map(p => (
                      <div key={p.id} className="flex justify-between items-center py-1 text-xs border-b border-gray-50 last:border-b-0">
                        <span className="text-gray-400 font-mono">{p.payment_date}</span>
                        <span className="font-mono text-green-600">{fmt(p.amount)}</span>
                      </div>
                    ))}
                  </DetailSection>
                )}
                <div className="flex flex-col gap-2 pt-2">
                  {/* 確認依頼の状態・回答（あれば） */}
                  {(() => {
                    const cReq = confirmByInvoice.get(selected.id)
                    if (!cReq) return null
                    const r = resolutionOf(cReq.resolution)
                    return (
                      <div className="rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 text-[11.5px]">
                        <div className="font-semibold text-brand-800">確認依頼：{cReq.status === '依頼中' ? '回答待ち（受注/管理）' : `回答あり${r ? `・判定「${r.label}」` : ''}`}</div>
                        {cReq.request_note && <div className="text-gray-500 mt-0.5">内容：{cReq.request_note}</div>}
                        {cReq.result_note && <div className="text-gray-600 mt-0.5">回答：{cReq.result_note}</div>}
                        {cReq.status === '依頼中'
                          ? <button onClick={() => setRespondTarget({ id: cReq.id, case_id: cReq.case_id, requester_id: cReq.requester_id, request_note: cReq.request_note, caseNumber: cReq.caseNumber, dealName: cReq.dealName })} className="mt-1.5 px-2.5 py-1 text-[11px] font-semibold text-white bg-brand-600 rounded hover:bg-brand-700">回答する（受注/管理）</button>
                          : <div className="text-[10.5px] text-gray-400 mt-0.5">「入金消込」または「返金を依頼」で対応してください</div>}
                      </div>
                    )
                  })()}
                  {/* 入金消込 */}
                  <button onClick={() => setPaymentInvoice(selected)} className="w-full px-3 py-2 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition inline-flex items-center justify-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />入金消込
                  </button>
                  {/* 入金内容の確認依頼（まだ依頼していないとき） */}
                  {!confirmByInvoice.get(selected.id) && (
                    <button onClick={() => setRequestTarget({ inv: { id: selected.id, case_id: selected.case_id, amount: selected.amount, review_reason: selected.review_reason, cases: selected.cases, payments: selected.payments }, defaultMode: 'confirm' })}
                      className="w-full px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition inline-flex items-center justify-center gap-1.5">
                      <MessagesSquare className="w-3.5 h-3.5" />入金内容の確認依頼
                    </button>
                  )}
                  {/* 返金依頼 */}
                  <button onClick={() => setRequestTarget({ inv: { id: selected.id, case_id: selected.case_id, amount: selected.amount, review_reason: selected.review_reason, cases: selected.cases, payments: selected.payments }, defaultMode: 'refund' })}
                    className="w-full px-3 py-2 text-xs font-semibold text-rose-600 border border-rose-200 bg-rose-50 rounded-lg hover:bg-rose-100 transition inline-flex items-center justify-center gap-1">
                    <Undo2 className="w-3.5 h-3.5" />返金を依頼
                  </button>
                  {/* 編集・削除 */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <button onClick={() => setEditInvoice(selected)} className="px-2 py-1 text-[12px] text-gray-600 hover:text-gray-800 inline-flex items-center gap-1"><Edit2 className="w-3 h-3" />編集</button>
                    <button onClick={() => setDeleteInvoice(selected)} className="px-2 py-1 text-[12px] text-red-500 hover:text-red-600 inline-flex items-center gap-1">削除</button>
                  </div>
                </div>
              </div>
              </div>
            </>
          )
        })()}
      </div>
      )}

      {/* Create Invoice Modal */}
      <CreateInvoiceModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        cases={cases}
        defaultCaseId={checkedInvoice?.case_id ?? caseFilter ?? undefined}
        existingInvoiceId={checkedInvoice?.status === '未請求' ? checkedInvoice.id : undefined}
        onSaved={async (newId) => {
          setCreateOpen(false)
          setCheckedInvoiceId(null)
          // 発行後は公式Excel（事務所の正式様式）を開く
          if (newId) await openOfficialInvoice(newId)
          router.refresh()
        }}
      />

      {/* Edit Invoice Modal */}
      <EditInvoiceModal
        isOpen={!!editInvoice}
        onClose={() => setEditInvoice(null)}
        invoice={editInvoice}
        onSaved={() => { setEditInvoice(null); router.refresh() }}
      />

      {/* Record Payment Modal */}
      {paymentInvoice && (
        <RecordPaymentModal
          isOpen={!!paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          invoice={paymentInvoice}
          onSaved={() => { setPaymentInvoice(null); router.refresh() }}
        />
      )}

      {/* 銀行CSV突合（経理・システム管理者のみ。案件番号・振込人・金額キー／AI判定・要確認／入金確定通知） */}
      {canReconcile && (
        <BankCsvReconcileModal
          isOpen={csvOpen}
          onClose={() => setCsvOpen(false)}
          onSaved={() => { setCsvOpen(false); router.refresh() }}
        />
      )}

      {/* Delete Confirm */}
      <DeleteConfirmModal
        isOpen={!!deleteInvoice}
        onClose={() => setDeleteInvoice(null)}
        title="請求書削除"
        message={`この請求書を削除しますか？関連する入金記録も削除されます。`}
        onConfirm={handleDeleteInvoice}
      />
      {/* Bulk Delete Confirm */}
      <DeleteConfirmModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="請求書一括削除"
        message={`選択した ${bulkSelected.size} 件の請求書を削除しますか？関連する入金記録も同時に削除されます。\nこの操作は取り消せません。`}
        onConfirm={handleBulkDelete}
      />
    </div>
  )
}

// 備考のインライン編集セル（フォーカス時のみ枠線・blurで保存）
function RemarksCell({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value ?? '')
  // propが変わったらローカルへ同期（render中の状態調整＝Reactの推奨パターン）
  const [lastValue, setLastValue] = useState(value ?? '')
  if ((value ?? '') !== lastValue) { setLastValue(value ?? ''); setV(value ?? '') }
  return (
    <input
      type="text"
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== (value ?? '')) onCommit(v) }}
      placeholder="—"
      className="w-full px-1.5 py-1 text-[12px] border border-transparent hover:border-gray-200 focus:border-brand-400 rounded bg-transparent focus:bg-white outline-none"
    />
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-bold text-gray-400 tracking-wider uppercase mb-2 pb-1.5 border-b border-gray-100">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function DetailRow({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between items-center py-1 text-xs">
      <span className="text-gray-400">{label}</span>
      <span className={`font-medium text-gray-700 ${className}`}>{value}</span>
    </div>
  )
}
