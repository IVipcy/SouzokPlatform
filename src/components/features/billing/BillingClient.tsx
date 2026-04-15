'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import CreateInvoiceModal from './CreateInvoiceModal'
import RecordPaymentModal from './RecordPaymentModal'
import CsvImportModal from './CsvImportModal'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import { useResizableColumns, ResizeHandle } from '@/lib/useResizableColumns'
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

const STATUS_STYLES: Record<InvoiceStatus, { bg: string; text: string; border: string }> = {
  '未請求': { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300' },
  '前受金請求済': { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  '前受金入金済': { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200' },
  '確定請求済': { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' },
  '入金済': { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
  '一部入金': { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
}

function fmt(n: number) {
  if (n === 0) return '—'
  return '¥' + n.toLocaleString()
}

function getPaidAmount(payments: PaymentRow[] | null | undefined): number {
  if (!payments || payments.length === 0) return 0
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

function getSalesAssignee(caseData: InvoiceWithRelations['cases'] | null): { name: string; color: string } | null {
  if (!caseData?.case_members) return null
  const sales = caseData.case_members.find(cm => cm.role === 'sales')
  if (!sales?.members) return null
  return { name: sales.members.name, color: sales.members.avatar_color }
}

export default function BillingClient({ invoices, cases }: Props) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { widths: colWidths, reset: resetColWidths, startResize: startColResize } = useResizableColumns('billingListColWidths', {
    case: 260, status: 110, amount: 110, paid: 110, diff: 100, assignee: 140, invoiceDate: 110,
  })
  const HEADERS: Array<{ key: keyof typeof colWidths; label: string; align?: 'left' | 'right' }> = [
    { key: 'case', label: '案件' },
    { key: 'status', label: 'ステータス' },
    { key: 'amount', label: '請求金額', align: 'right' },
    { key: 'paid', label: '入金済額', align: 'right' },
    { key: 'diff', label: '差額', align: 'right' },
    { key: 'assignee', label: '担当' },
    { key: 'invoiceDate', label: '請求日' },
  ]

  // Modal states
  const [createOpen, setCreateOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceWithRelations | null>(null)
  const [deleteInvoice, setDeleteInvoice] = useState<InvoiceWithRelations | null>(null)

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter === 'waiting') {
        if (!['前受金請求済', '確定請求済'].includes(inv.status)) return false
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
  }, [invoices, statusFilter, search])

  const kpis = useMemo(() => {
    const total = invoices.reduce((s, inv) => s + inv.amount, 0)
    const unpaid = invoices.filter(inv => inv.status === '未請求').length
    const waiting = invoices.filter(inv => ['前受金請求済', '確定請求済'].includes(inv.status)).length
    const waitingAmt = invoices
      .filter(inv => ['前受金請求済', '確定請求済'].includes(inv.status))
      .reduce((s, inv) => s + inv.amount - getPaidAmount(inv.payments), 0)
    const paid = invoices.filter(inv => inv.status === '入金済').length
    const partial = invoices.filter(inv => inv.status === '一部入金').length
    return [
      { key: 'all', label: '請求合計', icon: '💴', value: fmt(total), sub: `${invoices.length}件` },
      { key: '未請求', label: '未請求', icon: '📋', value: String(unpaid), sub: '請求書未発行', color: 'text-gray-500' },
      { key: 'waiting', label: '入金待ち', icon: '⏳', value: String(waiting), sub: fmt(waitingAmt), color: 'text-amber-600' },
      { key: '入金済', label: '入金済', icon: '✅', value: String(paid), sub: '今月確定', color: 'text-green-600' },
      { key: '一部入金', label: '一部入金', icon: '⚠️', value: String(partial), sub: '差額確認要', color: 'text-red-600' },
    ]
  }, [invoices])

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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">請求・入金管理</h1>
          <p className="text-xs text-gray-400">請求書発行・入金消込・銀行CSV突合</p>
        </div>
        <div className="flex items-center gap-2">
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
          <button
            onClick={() => setCsvOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            🏦 銀行CSV取込
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            ＋ 請求書発行
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {kpis.map(kpi => (
          <button
            key={kpi.key}
            onClick={() => setStatusFilter(kpi.key === statusFilter ? 'all' : kpi.key)}
            className={`bg-white border rounded-xl p-3.5 text-left transition shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md ${
              statusFilter === kpi.key ? 'border-blue-300 bg-blue-50 border-t-[3px] border-t-blue-500' : 'border-gray-200 border-t-[3px] border-t-transparent'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-500">{kpi.label}</span>
              <span className="text-lg">{kpi.icon}</span>
            </div>
            <div className={`text-[22px] font-extrabold tracking-tight leading-none ${kpi.color || ''}`}>{kpi.value}</div>
            <div className="text-[10px] text-gray-400 mt-1">{kpi.sub}</div>
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Table */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2.5">
            <h2 className="text-[13px] font-semibold text-gray-900">請求・入金一覧</h2>
            <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded">{filtered.length}件</span>
            <button
              onClick={resetColWidths}
              className="ml-auto text-[10px] text-gray-400 hover:text-gray-600 transition"
              title="列幅をリセット"
            >
              列幅リセット
            </button>
          </div>
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              {HEADERS.map(h => (
                <col key={h.key as string} style={{ width: colWidths[h.key] }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {HEADERS.map(h => (
                  <th
                    key={h.key as string}
                    className={`relative bg-gray-50 border-b border-gray-200 px-3.5 py-2 text-[10px] font-bold text-gray-400 tracking-wider uppercase ${h.align === 'right' ? 'text-right' : 'text-left'}`}
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
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    該当する請求データがありません
                  </td>
                </tr>
              ) : (
                filtered.map(inv => {
                  const st = STATUS_STYLES[inv.status]
                  const paidAmount = getPaidAmount(inv.payments)
                  const diff = inv.amount - paidAmount
                  const assignee = getSalesAssignee(inv.cases)
                  const caseName = inv.cases?.deal_name || '—'
                  const caseNumber = inv.cases?.case_number || ''
                  const deceasedName = inv.cases?.deceased_name || ''
                  return (
                    <tr
                      key={inv.id}
                      className={`border-b border-gray-100 last:border-b-0 cursor-pointer transition ${selectedId === inv.id ? 'bg-blue-50/60' : 'hover:bg-gray-50/50'}`}
                      onClick={() => setSelectedId(inv.id === selectedId ? null : inv.id)}
                    >
                      <td className="px-3.5 py-2.5 overflow-hidden">
                        <div className="text-xs font-semibold text-gray-900 truncate">{caseName}</div>
                        <div className="text-[10px] text-gray-400 truncate">{caseNumber}{deceasedName ? ` · 被相続人: ${deceasedName}` : ''}</div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${st.bg} ${st.text} ${st.border}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-xs font-mono font-medium text-gray-900">{fmt(inv.amount)}</td>
                      <td className="px-3.5 py-2.5 text-right text-xs font-mono text-green-600">{fmt(paidAmount)}</td>
                      <td className="px-3.5 py-2.5 text-right text-xs font-mono">
                        {inv.amount > 0 ? (
                          <span className={diff > 0 ? 'text-red-500' : 'text-gray-400'}>{diff > 0 ? fmt(diff) : '—'}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {assignee ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: assignee.color }}>
                              {assignee.name[0]}
                            </div>
                            <span className="text-xs text-gray-600">{assignee.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-xs text-gray-500 font-mono">{inv.issued_date || '—'}</td>
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
          const selAssignee = getSalesAssignee(selected.cases)
          return (
            <div className="w-80 bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden flex-shrink-0">
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400">{selected.cases?.case_number || ''}</span>
                  <button onClick={() => setSelectedId(null)} className="w-6 h-6 rounded flex items-center justify-center text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition">✕</button>
                </div>
                <div className="text-sm font-bold text-gray-900">{selected.cases?.deal_name || '—'}</div>
                <div className="text-[11px] text-gray-400">被相続人: {selected.cases?.deceased_name || '—'}</div>
                {/* Payment flow */}
                <div className="flex items-center gap-0 mt-3">
                  {['未請求', '前受金', '入金待ち', '入金済'].map((step, i) => {
                    const stepIndex = selected.status === '未請求' ? 0 : selected.status === '前受金請求済' ? 1 : selected.status === '前受金入金済' ? 2 : selected.status === '確定請求済' ? 2 : selected.status === '入金済' ? 3 : 1
                    const passed = i < stepIndex
                    const active = i === stepIndex
                    return (
                      <div key={step} className="flex-1 flex flex-col items-center gap-1 relative">
                        <div className={`w-2.5 h-2.5 rounded-full z-10 ${active ? 'bg-green-500 ring-2 ring-green-200 w-3 h-3' : passed ? 'bg-green-500 opacity-50' : 'bg-gray-300'}`} />
                        <span className={`text-[9px] ${active ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>{step}</span>
                        {i < 3 && <div className={`absolute top-1.5 left-1/2 right-[-50%] h-px z-0 ${passed ? 'bg-green-400 opacity-40' : 'bg-gray-200'}`} />}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="px-4 py-3 space-y-4">
                <DetailSection title="請求情報">
                  <DetailRow label="請求金額" value={fmt(selected.amount)} />
                  <DetailRow label="入金済額" value={fmt(selPaidAmount)} className="text-green-600" />
                  <DetailRow label="差額" value={selected.amount > 0 ? fmt(selDiff) : '—'} className={selDiff > 0 ? 'text-red-500' : ''} />
                  <DetailRow label="請求日" value={selected.issued_date || '—'} />
                </DetailSection>
                <DetailSection title="案件情報">
                  <DetailRow label="受注担当" value={selAssignee?.name || '—'} />
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
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setPaymentInvoice(selected)}
                    className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                  >
                    💰 入金消込
                  </button>
                  <button
                    onClick={() => setDeleteInvoice(selected)}
                    className="flex-1 px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
                  >
                    🗑 削除
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
        onSaved={() => { setCreateOpen(false); router.refresh() }}
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
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mb-2 pb-1.5 border-b border-gray-100">{title}</div>
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
