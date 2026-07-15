'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ArrowUpDown, Banknote, ClipboardList, AlertCircle, Hourglass, CheckCircle2, AlertTriangle } from 'lucide-react'
import OpenInvoiceButton from './OpenInvoiceButton'
import OpenReceiptButton from './OpenReceiptButton'
import UserAvatar from '@/components/ui/UserAvatar'
import { BILLING_STATUS_ORDER, type BillingCaseRow } from '@/lib/billingCaseRows'
import { getCaseStatusLabel, billingPatternOf } from '@/lib/constants'

type Props = {
  rows: BillingCaseRow[]
  title?: string
}

const STATUS_COLOR: Record<string, string> = {
  '未請求': 'bg-gray-100 text-gray-700 border-gray-200',
  '作成済': 'bg-gray-50 text-gray-700 border-gray-300',
  '入金待ち': 'bg-amber-50 text-amber-700 border-amber-200',
  '入金済':   'bg-green-50 text-green-700 border-green-200',
}

// 契約形態 → 行/司/連名 の色帯（行=青 / 司=赤 / 連名=紫）
function contractBar(contractType: string | null): { cls: string; label: string } {
  switch (contractType) {
    case '行政書士法人単独': return { cls: 'bg-blue-500', label: '行' }
    case '司法書士法人単独': return { cls: 'bg-red-500', label: '司' }
    case '行・司連名':       return { cls: 'bg-purple-500', label: '連' }
    default:                 return { cls: 'bg-gray-300', label: '—' }
  }
}

function fmtYen(n: number): string { return `¥${n.toLocaleString()}` }
function typeLabel(t: string): string { return t === '確定請求' ? '確定売上' : t }

export default function BillingCaseTable({ rows, title = '請求対象案件' }: Props) {
  const [sortAsc, setSortAsc] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')  // KPIカードで絞り込み
  const [showFirm, setShowFirm] = useState(false)                  // 行/司サマリは請求合計クリックで開く

  const sorted = useMemo(() => {
    const f = rows.filter(r => statusFilter === 'all' ? true : statusFilter === 'review' ? r.needsReview : r.invoiceStatus === statusFilter)
    return f.sort((a, b) => {
      const ao = BILLING_STATUS_ORDER[a.invoiceStatus] ?? 99
      const bo = BILLING_STATUS_ORDER[b.invoiceStatus] ?? 99
      if (ao !== bo) return sortAsc ? ao - bo : bo - ao
      return a.caseNumber.localeCompare(b.caseNumber)
    })
  }, [rows, sortAsc, statusFilter])
  const toggleFilter = (key: string) => setStatusFilter(s => s === key ? 'all' : key)

  // サマリ（請求・入金タブと同内容）
  const summary = useMemo(() => {
    const issued = rows.filter(r => r.invoiceStatus !== '未請求')
    const total = issued.reduce((s, r) => s + r.amount, 0)
    const collected = issued.reduce((s, r) => s + Math.min(r.amount, r.paidAmount), 0)
    const calcFirm = (firm: 'gyosei' | 'shiho') => {
      const fr = issued.filter(r => r.firmType === firm)
      return { total: fr.reduce((s, r) => s + r.amount, 0), paid: fr.reduce((s, r) => s + r.paidAmount, 0), count: fr.length }
    }
    return {
      total,
      collected,
      outstanding: Math.max(0, total - collected),
      issuedCount: issued.length,
      unbilled: rows.filter(r => r.invoiceStatus === '未請求').length,
      created: rows.filter(r => r.invoiceStatus === '作成済').length,
      waiting: rows.filter(r => r.invoiceStatus === '入金待ち').length,
      review: rows.filter(r => r.needsReview).length,
      paid: rows.filter(r => r.invoiceStatus === '入金済').length,
      gyosei: calcFirm('gyosei'),
      shiho: calcFirm('shiho'),
    }
  }, [rows])

  return (
    <section className="space-y-5">
      {/* サマリ KPI（請求合計は入金済/未入金の内訳付き＝請求・入金タブと同内容） */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <button type="button" onClick={() => setShowFirm(s => !s)} className={`col-span-2 text-left bg-white border rounded-xl px-3 py-2.5 transition hover:shadow-sm ${showFirm ? 'border-brand-300 bg-brand-50 ring-2 ring-brand-200' : 'border-brand-200 bg-brand-50/40'}`}>
          <div className="flex items-center gap-1.5 mb-1"><Banknote className="w-4 h-4 text-brand-600" strokeWidth={2.25} /><span className="text-[12px] font-semibold text-gray-600">請求合計</span></div>
          <div className="text-[20px] font-extrabold tracking-tight leading-none text-brand-700">{fmtYen(summary.total)}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{summary.issuedCount}件発行済・クリックで行/司内訳</div>
          <div className="mt-1.5 h-[6px] rounded-full bg-rose-100 overflow-hidden flex">
            <div className="bg-green-500 h-full" style={{ width: `${summary.total > 0 ? Math.round((summary.collected / summary.total) * 100) : 0}%` }} />
          </div>
          <div className="flex items-center justify-between mt-1 text-[11px]">
            <span className="text-green-700">● 入金済 <span className="font-mono font-semibold">{fmtYen(summary.collected)}</span></span>
            <span className="text-rose-600">● 未入金 <span className="font-mono font-semibold">{fmtYen(summary.outstanding)}</span></span>
          </div>
        </button>
        <SummaryBox icon={<ClipboardList className="w-4 h-4 text-gray-500" />} label="未請求" value={String(summary.unbilled)} sub="請求書未発行" tone="neutral" onClick={() => toggleFilter('未請求')} active={statusFilter === '未請求'} />
        <SummaryBox icon={<AlertCircle className="w-4 h-4 text-gray-700" />} label="作成済" value={String(summary.created)} sub="請求書作成済" tone="neutral" onClick={() => toggleFilter('作成済')} active={statusFilter === '作成済'} />
        <SummaryBox icon={<Hourglass className="w-4 h-4 text-amber-600" />} label="入金待ち" value={String(summary.waiting)} sub="請求済・未入金" tone="amber" onClick={() => toggleFilter('入金待ち')} active={statusFilter === '入金待ち'} />
        <SummaryBox icon={<AlertTriangle className="w-4 h-4 text-amber-700" />} label="要確認" value={String(summary.review)} sub="CSV突合②③" tone="amber" onClick={() => toggleFilter('review')} active={statusFilter === 'review'} />
        <SummaryBox icon={<CheckCircle2 className="w-4 h-4 text-green-600" />} label="入金済" value={String(summary.paid)} sub="入金確定" tone="green" onClick={() => toggleFilter('入金済')} active={statusFilter === '入金済'} />
      </div>
      {/* 行/司 別（請求合計クリックで開閉） */}
      {showFirm && (
        <div className="grid grid-cols-2 gap-3">
          <FirmBox label="行政書士法人" total={summary.gyosei.total} paid={summary.gyosei.paid} count={summary.gyosei.count} ring="border-blue-200" head="bg-blue-50 text-blue-800" accent="text-blue-700" />
          <FirmBox label="司法書士法人" total={summary.shiho.total} paid={summary.shiho.paid} count={summary.shiho.count} ring="border-red-200" head="bg-red-50 text-red-800" accent="text-red-700" />
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          {title}
          <span className="ml-2 text-[12px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{sorted.length}件</span>
          {statusFilter !== 'all' && <button type="button" onClick={() => setStatusFilter('all')} className="ml-2 text-[11px] text-brand-600 hover:underline">絞り込み解除</button>}
        </h3>
        {sorted.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            {statusFilter === 'all' ? '請求対象の案件はありません（当月の受託 / 当月完了予定の対応中 / 当月業務完了）' : '該当する請求はありません'}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="text-[13px] border-collapse w-max min-w-full">
              <thead>
                <tr className="bg-brand-50/60 border-b border-brand-100 text-brand-700 whitespace-nowrap">
                  <th className="px-1 py-2 text-center font-semibold" title="契約形態（行/司/連名）"></th>
                  <th className="px-2.5 py-2 text-left font-semibold">案件管理番号</th>
                  <th className="px-2.5 py-2 text-left font-semibold">案件名</th>
                  <th className="px-2.5 py-2 text-left font-semibold">請求パターン</th>
                  <th className="px-2.5 py-2 text-left font-semibold">受注ルート</th>
                  <th className="px-2.5 py-2 text-left font-semibold">紹介元</th>
                  <th className="px-2.5 py-2 text-left font-semibold">請求分類</th>
                  <th className="px-2.5 py-2 text-left font-semibold">案件ステータス</th>
                  <th className="px-2.5 py-2 text-left font-semibold">受注担当</th>
                  <th className="px-2.5 py-2 text-left font-semibold">管理担当</th>
                  <th className="px-2.5 py-2 text-center font-semibold">
                    <button onClick={() => setSortAsc(s => !s)} className="inline-flex items-center gap-1 hover:text-brand-600">
                      入金ステータス <ArrowUpDown className="w-3 h-3" strokeWidth={2} />
                    </button>
                  </th>
                  <th className="px-2.5 py-2 text-right font-semibold">請求金額</th>
                  <th className="px-2.5 py-2 text-right font-semibold">前受金</th>
                  <th className="px-2.5 py-2 text-right font-semibold">実費</th>
                  <th className="px-2.5 py-2 text-right font-semibold">入金済額</th>
                  <th className="px-2.5 py-2 text-right font-semibold">差額</th>
                  <th className="px-2.5 py-2 text-left font-semibold">請求日</th>
                  <th className="px-2.5 py-2 text-center font-semibold">請求書</th>
                  <th className="px-2.5 py-2 text-center font-semibold">領収書</th>
                  <th className="px-2.5 py-2 text-left font-semibold">備考</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                  const bar = contractBar(r.contractType)
                  const procedures = (r.procedureType ?? []).filter(Boolean)
                  const diff = r.amount - r.paidAmount
                  return (
                    <tr key={r.caseId} className={`border-b border-gray-100 hover:bg-brand-50/30 whitespace-nowrap ${rowBg}`}>
                      <td className="px-1 py-2 text-center">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white ${bar.cls}`} title={r.contractType ?? '契約形態未設定'}>{bar.label}</span>
                      </td>
                      <td className="px-2.5 py-2 font-mono">
                        <Link href={`/cases/${r.caseId}`} className="text-brand-700 hover:underline font-semibold">{r.caseNumber}</Link>
                      </td>
                      <td className="px-2.5 py-2 text-gray-900">
                        <Link href={`/cases/${r.caseId}`} className="hover:text-brand-700 hover:underline">{r.dealName}</Link>
                        {procedures.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {procedures.map(p => <span key={p} className="inline-block text-[10px] px-1 py-0 rounded bg-gray-100 text-gray-600 border border-gray-200">{p}</span>)}
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-2">
                        {(() => {
                          const p = billingPatternOf(r.billingPattern)
                          const short = p.value === 'staged' ? '段階請求' : p.value === 'lump_expense' ? '一括＋実費' : '一括のみ'
                          const cls = p.value === 'staged' ? 'bg-gray-50 text-gray-600 border-gray-200' : 'bg-brand-50 text-brand-700 border-brand-100'
                          return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`} title={p.desc}><span className="font-semibold">{p.no}</span>{short}</span>
                        })()}
                      </td>
                      <td className="px-2.5 py-2 text-gray-600">{r.orderRoute || <span className="text-gray-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-gray-600">{r.orderRouteDetail || <span className="text-gray-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-gray-700">{typeLabel(r.invoiceType)}</td>
                      <td className="px-2.5 py-2">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-bold bg-gray-50 text-gray-700 border-gray-200">{getCaseStatusLabel(r.bucket === '受託' ? '受注' : r.bucket)}</span>
                      </td>
                      <td className="px-2.5 py-2">
                        {r.salesName && r.salesId ? (
                          <Link href={`/profile/${r.salesId}`} className="flex items-center gap-1.5 hover:text-brand-700 hover:underline">
                            <UserAvatar name={r.salesName} role="sales" url={r.salesAvatarUrl} size="sm" /><span className="truncate">{r.salesName}</span>
                          </Link>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-2.5 py-2">
                        {r.managerName && r.managerId ? (
                          <Link href={`/profile/${r.managerId}`} className="flex items-center gap-1.5 hover:text-brand-700 hover:underline">
                            <UserAvatar name={r.managerName} role="manager" url={r.managerAvatarUrl} size="sm" /><span className="truncate">{r.managerName}</span>
                          </Link>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-2.5 py-2 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[12px] font-semibold ${STATUS_COLOR[r.invoiceStatus] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>{r.invoiceStatus}</span>
                        {r.needsReview && <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">要確認</span>}
                      </td>
                      <td className="px-2.5 py-2 font-mono text-right text-gray-900">{fmtYen(r.amount)}</td>
                      <td className="px-2.5 py-2 font-mono text-right text-gray-700">{r.advance > 0 ? fmtYen(r.advance) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-2.5 py-2 font-mono text-right text-gray-700">{r.expenses > 0 ? fmtYen(r.expenses) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-2.5 py-2 font-mono text-right text-green-700">{r.paidAmount > 0 ? fmtYen(r.paidAmount) : <span className="text-gray-300">—</span>}</td>
                      <td className={`px-2.5 py-2 font-mono text-right ${diff > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{fmtYen(diff)}</td>
                      <td className="px-2.5 py-2 font-mono text-gray-700">{r.issuedDate ?? <span className="text-gray-400">未発行</span>}</td>
                      <td className="px-2.5 py-2 text-center">
                        {r.invoiceId && r.invoiceStatus !== '未請求' ? (
                          <OpenInvoiceButton invoiceId={r.invoiceId} />
                        ) : <span className="text-gray-300 text-[12px]">未発行</span>}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        {r.invoiceId && r.invoiceStatus !== '未請求' ? (
                          <OpenReceiptButton invoiceId={r.invoiceId} issuedDate={r.receiptIssuedDate} />
                        ) : <span className="text-gray-300 text-[12px]">—</span>}
                      </td>
                      <td className="px-2.5 py-2 text-gray-600 max-w-[160px] truncate" title={r.notes ?? undefined}>{r.notes || <span className="text-gray-400">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function SummaryBox({ icon, label, value, sub, tone, onClick, active }: { icon: React.ReactNode; label: string; value: string; sub: string; tone: 'brand' | 'green' | 'amber' | 'neutral'; onClick?: () => void; active?: boolean }) {
  const toneCls = tone === 'brand' ? 'border-brand-200 bg-brand-50/40' : tone === 'green' ? 'border-emerald-200 bg-emerald-50/40' : tone === 'amber' ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-white'
  const valueCls = tone === 'brand' ? 'text-brand-700' : tone === 'green' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-900'
  return (
    <button type="button" onClick={onClick} className={`text-left w-full bg-white border rounded-xl px-3 py-2.5 transition hover:shadow-sm ${toneCls} ${active ? 'ring-2 ring-brand-300' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[12px] font-semibold text-gray-600">{label}</span></div>
      <div className={`text-[20px] font-extrabold tracking-tight leading-none mb-1 ${valueCls}`}>{value}</div>
      <div className="text-[11px] text-gray-400">{sub}</div>
    </button>
  )
}

function FirmBox({ label, total, paid, count, ring, head, accent }: { label: string; total: number; paid: number; count: number; ring: string; head: string; accent: string }) {
  return (
    <div className={`bg-white border rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${ring}`}>
      <div className={`px-4 py-2 flex items-center justify-between ${head}`}>
        <span className="text-[13px] font-bold">{label}</span>
        <span className="text-[11px] font-mono opacity-70">{count}件発行済</span>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-x-4">
        <div><div className="text-[11px] text-gray-400">請求合計</div><div className={`text-[18px] font-extrabold font-mono leading-none ${accent}`}>{fmtYen(total)}</div></div>
        <div><div className="text-[11px] text-gray-400">入金済</div><div className="text-[18px] font-extrabold font-mono leading-none text-green-600">{fmtYen(paid)}</div></div>
      </div>
    </div>
  )
}
