'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Banknote, ClipboardList, Hourglass, CheckCircle2, AlertCircle, Plus, Upload, Receipt, X, type LucideIcon } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import CreateInvoiceModal from './CreateInvoiceModal'
import EditInvoiceModal from './EditInvoiceModal'
import RecordPaymentModal from './RecordPaymentModal'
import CsvImportModal from './CsvImportModal'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import Button from '@/components/ui/Button'
import UserAvatar from '@/components/ui/UserAvatar'
import { Edit2, FileText } from 'lucide-react'
import { useResizableColumns, ResizeHandle } from '@/lib/useResizableColumns'
import { showToast } from '@/components/ui/Toast'
import { INVOICE_STATUS_STYLES, INVOICE_TYPE_LABEL, INVOICE_TYPE_STYLES, getCaseStatusLabel } from '@/lib/constants'
import type { InvoiceRow, InvoiceStatus, CaseRow, ClientRow, MemberRow, CaseMemberRow, PaymentRow } from '@/types'

type InvoiceWithRelations = InvoiceRow & {
  cases: CaseRow & {
    clients: ClientRow | null
    case_members: (CaseMemberRow & { members: MemberRow })[]
  }
  payments: PaymentRow[]
}

type CaseOption = { id: string; case_number: string; deal_name: string }

type Props = {
  invoices: InvoiceWithRelations[]
  cases: CaseOption[]
}

// 4 種類のシンプル化ステータス（DB値 = 表示）
const EDITABLE_STATUSES: InvoiceStatus[] = ['作成済', '入金待ち', '入金済']

function fmt(n: number) {
  if (n === 0) return '—'
  return '¥' + n.toLocaleString()
}

function getPaidAmount(payments: PaymentRow[] | null | undefined): number {
  if (!payments || payments.length === 0) return 0
  return payments.reduce((sum, p) => sum + p.amount, 0)
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

export default function BillingClient({ invoices, cases }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const caseFromUrl = searchParams.get('case')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [caseFilter, setCaseFilter] = useState<string | null>(caseFromUrl)
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
    caseNo: 140, case: 180, type: 90, caseStatus: 100, sales: 110, manager: 110, status: 120, amount: 110, paid: 100, diff: 90, invoiceDate: 100, pdf: 90,
  })
  const HEADERS: Array<{ key: keyof typeof colWidths; label: string; align?: 'left' | 'right' }> = [
    { key: 'caseNo', label: '案件番号' },
    { key: 'case', label: '案件名' },
    { key: 'type', label: '請求分類' },
    { key: 'caseStatus', label: '案件ステータス' },
    { key: 'sales', label: '受注担当' },
    { key: 'manager', label: '管理担当' },
    { key: 'status', label: '入金ステータス' },
    { key: 'amount', label: '請求金額', align: 'right' },
    { key: 'paid', label: '入金済額', align: 'right' },
    { key: 'diff', label: '差額', align: 'right' },
    { key: 'invoiceDate', label: '請求日' },
    { key: 'pdf', label: '請求書PDF' },
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
      if (statusFilter === 'waiting') {
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
  }, [invoices, caseFilter, statusFilter, search])

  const kpis = useMemo(() => {
    const src = monthFilteredInvoices
    // 「請求合計」は実発行された請求書のみ（未請求プレースホルダーは除外）
    const issuedInvoices = src.filter(inv => inv.status !== '未請求')
    const total = issuedInvoices.reduce((s, inv) => s + inv.amount, 0)
    const unpaid = src.filter(inv => inv.status === '未請求').length
    const created = src.filter(inv => inv.status === '作成済').length
    const waiting = src.filter(inv => inv.status === '入金待ち').length
    const waitingAmt = src
      .filter(inv => inv.status === '入金待ち')
      .reduce((s, inv) => s + inv.amount - getPaidAmount(inv.payments), 0)
    const paid = src.filter(inv => inv.status === '入金済').length
    return [
      { key: 'all',     label: '請求合計', Icon: Banknote as LucideIcon,      value: fmt(total),         sub: `${issuedInvoices.length}件発行済` },
      { key: '未請求',   label: '未請求',   Icon: ClipboardList as LucideIcon, value: String(unpaid),     sub: '請求書未発行', color: 'text-gray-500' },
      { key: '作成済',   label: '作成済',   Icon: AlertCircle as LucideIcon,   value: String(created),    sub: '請求書作成済', color: 'text-gray-700' },
      { key: '入金待ち', label: '入金待ち', Icon: Hourglass as LucideIcon,     value: String(waiting),    sub: fmt(waitingAmt), color: 'text-amber-600' },
      { key: '入金済',   label: '入金済',   Icon: CheckCircle2 as LucideIcon,  value: String(paid),       sub: '入金確定', color: 'text-green-600' },
    ]
  }, [monthFilteredInvoices])

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

  // 個別: ステータス変更
  const handleStatusChange = async (invoiceId: string, nextStatus: InvoiceStatus) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('invoices').update({ status: nextStatus }).eq('id', invoiceId)
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

  return (
    <div>
      <PageHeader
        eyebrow="Billing"
        title="請求・入金管理"
        icon={Receipt}
        description="請求書発行・入金消込・銀行CSV突合"
        right={
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
              title="KPI集計期間"
            >
              {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Button variant="secondary" size="sm" leftIcon={<Upload className="w-3.5 h-3.5" strokeWidth={2} />} onClick={() => setCsvOpen(true)}>
              銀行CSV取込
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" strokeWidth={2.25} />}
              onClick={() => setCreateOpen(true)}
            >
              {checkedInvoice
                ? `選択した案件で請求書発行（${checkedInvoice.cases?.case_number ?? ''}）`
                : '請求書発行'}
            </Button>
          </>
        }
      />

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

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {kpis.map(kpi => (
          <button
            key={kpi.key}
            onClick={() => setStatusFilter(kpi.key === statusFilter ? 'all' : kpi.key)}
            className={`bg-white border rounded-xl p-3.5 text-left transition shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md ${
              statusFilter === kpi.key ? 'border-brand-300 bg-brand-50 border-t-[3px] border-t-brand-500' : 'border-gray-200 border-t-[3px] border-t-transparent'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-semibold text-gray-500">{kpi.label}</span>
              <kpi.Icon className="w-5 h-5 text-gray-400" strokeWidth={1.75} />
            </div>
            <div className={`text-[22px] font-extrabold tracking-tight leading-none ${kpi.color || ''}`}>{kpi.value}</div>
            <div className="text-[12px] text-gray-400 mt-1">{kpi.sub}</div>
          </button>
        ))}
      </div>

      {/* 行/司 別の集計（発行法人ごと） */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {([
          { key: 'gyosei', label: '行政書士法人', sum: firmSummary.gyosei, ring: 'border-blue-200', head: 'bg-blue-50 text-blue-800', accent: 'text-blue-700' },
          { key: 'shiho',  label: '司法書士法人', sum: firmSummary.shiho,  ring: 'border-red-200', head: 'bg-red-50 text-red-800', accent: 'text-red-700' },
        ] as const).map(f => (
          <div key={f.key} className={`bg-white border rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${f.ring}`}>
            <div className={`px-4 py-2 flex items-center justify-between ${f.head}`}>
              <span className="text-[13px] font-bold">{f.label}</span>
              <span className="text-[11px] font-mono opacity-70">{f.sum.count}件発行済</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <div className="text-[11px] text-gray-400">請求合計</div>
                <div className={`text-[18px] font-extrabold font-mono leading-none ${f.accent}`}>{fmt(f.sum.total)}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">入金済</div>
                <div className="text-[18px] font-extrabold font-mono leading-none text-green-600">{fmt(f.sum.paid)}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">前受金</div>
                <div className="text-[14px] font-bold font-mono text-gray-700">{fmt(f.sum.advance)}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">確定売上</div>
                <div className="text-[14px] font-bold font-mono text-gray-700">{fmt(f.sum.confirmed)}</div>
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

      <div className="flex gap-4">
        {/* Table */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
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
                <th className="bg-gray-50 border-b border-gray-200 px-2 py-2">
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
                    className={`relative bg-gray-50 border-b border-gray-200 px-3.5 py-2 text-[12px] font-bold text-gray-400 tracking-wider uppercase ${h.align === 'right' ? 'text-right' : 'text-left'}`}
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
                  <td colSpan={13} className="px-4 py-12 text-center text-sm text-gray-400">
                    該当する請求データがありません
                  </td>
                </tr>
              ) : (
                filtered.map(inv => {
                  const st = INVOICE_STATUS_STYLES[inv.status] ?? INVOICE_STATUS_STYLES['作成済']
                  const paidAmount = getPaidAmount(inv.payments)
                  const diff = inv.amount - paidAmount
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
                      className={`border-b border-gray-100 last:border-b-0 cursor-pointer transition ${
                        isBulkSelected ? 'bg-brand-50/60' :
                        isChecked ? 'bg-brand-50/80' :
                        selectedId === inv.id ? 'bg-brand-50/40' :
                        'hover:bg-gray-50/50'
                      }`}
                      onClick={() => setSelectedId(inv.id === selectedId ? null : inv.id)}
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
                      {/* 案件番号（左に契約形態色） */}
                      <td className="px-3.5 py-2.5 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold text-white flex-shrink-0 ${cdot.cls}`} title={inv.cases?.contract_type ?? '契約形態未設定'}>{cdot.label}</span>
                          <span className="font-mono text-[12px] text-gray-700 truncate">{caseNumber || '—'}</span>
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
                      {/* 請求分類（前受金 / 確定売上）＋ 発行法人 */}
                      <td className="px-3.5 py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}>{typeLabel}</span>
                          {inv.firm_type === 'gyosei' && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border bg-blue-50 text-blue-700 border-blue-200">行政書士</span>}
                          {inv.firm_type === 'shiho' && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border bg-red-50 text-red-700 border-red-200">司法書士</span>}
                        </div>
                      </td>
                      {/* 案件ステータス */}
                      <td className="px-3.5 py-2.5">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-bold bg-gray-50 text-gray-700 border-gray-200">{caseStatusLabel || '—'}</span>
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
                        {isUnissued ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold border ${st.bg} ${st.text} ${st.border}`}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{inv.status}
                          </span>
                        ) : (
                          <select value={inv.status} onChange={e => handleStatusChange(inv.id, e.target.value as InvoiceStatus)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold border cursor-pointer outline-none focus:ring-2 focus:ring-brand-300 ${st.bg} ${st.text} ${st.border}`} title="クリックでステータス変更">
                            {EDITABLE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-xs font-mono font-medium text-gray-900">
                        <div>{fmt(inv.amount)}</div>
                        {inv.expenses_amount > 0 && (
                          <div className="text-[10px] text-gray-400 font-normal mt-0.5" title="報酬 + 立替実費">報酬 ¥{inv.fee_amount.toLocaleString()} + 実費 ¥{inv.expenses_amount.toLocaleString()}</div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-xs font-mono text-green-600">{fmt(paidAmount)}</td>
                      <td className="px-3.5 py-2.5 text-right text-xs font-mono">
                        {inv.amount > 0 ? <span className={diff > 0 ? 'text-red-500' : 'text-gray-400'}>{diff > 0 ? fmt(diff) : '—'}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3.5 py-2.5 text-xs text-gray-500 font-mono">{inv.issued_date || '—'}</td>
                      {/* 請求書PDF */}
                      <td className="px-3.5 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        {!isUnissued ? (
                          <Link href={`/invoices/${inv.id}/preview`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-50 rounded">
                            <FileText className="w-3 h-3" strokeWidth={2.25} />プレビュー
                          </Link>
                        ) : <span className="text-gray-300 text-[12px]">未発行</span>}
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
          const selDiff = selected.amount - selPaidAmount
          const selAssignee = getAssignees(selected.cases).sales
          return (
            <div className="w-80 bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden flex-shrink-0">
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
                  <DetailRow label="差額" value={selected.amount > 0 ? fmt(selDiff) : '—'} className={selDiff > 0 ? 'text-red-500' : ''} />
                  <DetailRow label="請求日" value={selected.issued_date || '—'} />
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
                  <Link
                    href={`/invoices/${selected.id}/preview`}
                    className="px-3 py-2 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition text-center inline-flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    請求書を表示 / DL
                  </Link>
                  <Link
                    href={`/invoices/${selected.id}/preview?doc=receipt`}
                    className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-center inline-flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    領収書を表示 / DL
                  </Link>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditInvoice(selected)}
                      className="flex-1 px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition inline-flex items-center justify-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      編集
                    </button>
                    <button
                      onClick={() => setPaymentInvoice(selected)}
                      className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition"
                    >
                      💰 入金消込
                    </button>
                  </div>
                  <button
                    onClick={() => setDeleteInvoice(selected)}
                    className="w-full px-3 py-1.5 text-[11px] font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 rounded transition"
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Create Invoice Modal */}
      <CreateInvoiceModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        cases={cases}
        defaultCaseId={checkedInvoice?.case_id ?? caseFilter ?? undefined}
        existingInvoiceId={checkedInvoice?.status === '未請求' ? checkedInvoice.id : undefined}
        onSaved={(newId) => {
          setCreateOpen(false)
          setCheckedInvoiceId(null)
          if (newId) {
            router.push(`/invoices/${newId}/preview?firstView=1`)
          } else {
            router.refresh()
          }
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

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={csvOpen}
        onClose={() => setCsvOpen(false)}
        invoices={invoices}
        onSaved={() => { setCsvOpen(false); router.refresh() }}
      />

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
