'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ListChecks, Download, ArrowLeft, CalendarClock, FileText, FolderOpen, ExternalLink } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { buildPaymentDetail, type PaymentDetailRaw, type PaymentSheet, type PaymentRow, type RefundRow } from '@/lib/paymentDetail'
import { exportPaymentDetail } from '@/lib/paymentDetailExcel'
import { downloadBlob } from '@/lib/salesReportExcel'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { openOfficialInvoice, downloadOfficialInvoice } from '@/lib/openInvoiceDoc'

type Props = { payments: PaymentDetailRaw[] }

const yen = (n: number) => n.toLocaleString()

export default function PaymentDetailClient({ payments }: Props) {
  const router = useRouter()
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of payments) if (p.payment_date) set.add(p.payment_date.slice(0, 7))
    return [...set].sort().reverse()
  }, [payments])

  const [month, setMonth] = useState<string>(() => monthOptions[0] ?? 'all')
  // 銀行フィルタタブ：'all'(すべて) / 'みずほ' / 'きらぼし' / '__unassigned__'(未振り分け)
  const [bankFilter, setBankFilter] = useState<'all' | 'みずほ' | 'きらぼし' | '__unassigned__'>('all')
  const detail = useMemo(() => buildPaymentDetail(payments, month), [payments, month])
  const monthLabel = month === 'all' ? '' : `${Number(month.slice(5, 7))}月分`

  async function handleExport() {
    const blob = await exportPaymentDetail(detail, monthLabel)
    downloadBlob(blob, `入金明細_${month === 'all' ? '全期間' : month}.xlsx`)
  }

  // 銀行を手動で指定（payments.bank に保存。'' で未振り分けへ戻す）
  async function saveBank(paymentId: string, bank: string) {
    if (!paymentId) return
    const supabase = createClient()
    const { error } = await supabase.from('payments').update({ bank: bank || null }).eq('id', paymentId)
    if (error) { showToast(`銀行の保存に失敗: ${error.message}`, 'error'); return }
    router.refresh()
  }

  // 備考を保存（invoices.notes・売上表と両方向共有）
  async function saveInvoiceNote(invoiceId: string, note: string) {
    if (!invoiceId) return
    const supabase = createClient()
    const { error } = await supabase.from('invoices').update({ notes: note || null }).eq('id', invoiceId)
    if (error) { showToast(`備考の保存に失敗: ${error.message}`, 'error'); return }
    router.refresh()
  }

  const filteredSheets = detail.sheets.filter(s => {
    if (bankFilter === 'all') return true
    if (bankFilter === '__unassigned__') return !s.bank
    return s.bank === bankFilter
  })
  const hasData = filteredSheets.some(s => s.rows.length) || (bankFilter === 'all' && detail.refunds.length > 0)

  return (
    <div>
      <PageHeader
        eyebrow="Billing"
        title="入金明細"
        icon={ListChecks}
        description="入金月ごとの入金一覧。銀行別シート・司/行の内訳・返金一覧。経理テンプレFMTでExcel出力可"
        right={
          <Link href="/billing" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> 請求・入金へ
          </Link>
        }
      />

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-gray-500"><CalendarClock className="w-4 h-4" /> 入金月</div>
        <select value={month} onChange={e => setMonth(e.target.value)} className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="all">全期間</option>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={handleExport} className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition">
          <Download className="w-3.5 h-3.5" /> Excel出力
        </button>
      </div>

      {/* 銀行フィルタタブ */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-500 w-14">銀行</span>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {([['all','すべて'], ['みずほ','みずほ'], ['きらぼし','きらぼし'], ['__unassigned__','未振り分け']] as const).map(([k,label]) => (
            <button key={k} onClick={() => setBankFilter(k)}
              className={`px-3 py-1.5 text-xs font-semibold transition ${bankFilter === k ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">未振り分け行は各行の「銀行」列で手動指定できます。備考は売上表と両方向共有。</span>
      </div>

      {!hasData ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
          入金データがありません{monthLabel && `（${monthLabel}）`}
        </div>
      ) : (
        <div className="space-y-5">
          {filteredSheets.map(sheet => <SheetTable key={sheet.key} sheet={sheet} onSaveBank={saveBank} onSaveNote={saveInvoiceNote} />)}
          {bankFilter === 'all' && detail.refunds.length > 0 && <RefundTable refunds={detail.refunds} />}
        </div>
      )}
    </div>
  )
}

const NUM = 'border border-gray-200 px-2 py-1 text-right tabular-nums whitespace-nowrap'
const TXT = 'border border-gray-200 px-2 py-1 whitespace-nowrap'
const TH = 'border border-gray-300 bg-gray-100 px-2 py-1 font-semibold text-gray-700 text-center whitespace-nowrap'

type RowHandlers = {
  onSaveBank: (paymentId: string, bank: string) => void
  onSaveNote: (invoiceId: string, note: string) => void
}

function SheetTable({ sheet, onSaveBank, onSaveNote }: { sheet: PaymentSheet } & RowHandlers) {
  const unassigned = !sheet.bank
  return (
    <div className={`bg-white border rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden ${unassigned ? 'border-amber-300' : 'border-gray-300'}`}>
      <div className={`px-4 py-2 border-b flex items-center justify-between ${unassigned ? 'bg-amber-50 border-amber-200' : 'bg-gray-100 border-gray-300'}`}>
        <div className={`text-[13px] font-bold ${unassigned ? 'text-amber-900' : 'text-gray-800'}`}>{sheet.title}</div>
        <div className={`text-xs ${unassigned ? 'text-amber-700' : 'text-gray-500'}`}>{sheet.rows.length}件 ・ 入金計 ¥{yen(sheet.totals.amount)}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[11px] border-collapse min-w-max">
          <thead>
            <tr>
              <th className={TH} rowSpan={2}>司/行</th><th className={TH} rowSpan={2}>日付</th><th className={TH} rowSpan={2}>案件番号</th><th className={TH} rowSpan={2}>依頼者</th>
              <th className={TH} rowSpan={2}>入金額</th><th className={TH} rowSpan={2}>差額</th><th className={TH} rowSpan={2}>内訳</th>
              <th className={TH} colSpan={3}>司法</th>
              <th className={TH} colSpan={3}>行政</th>
              <th className={TH} rowSpan={2}>受注</th><th className={TH} rowSpan={2}>管理</th><th className={TH} rowSpan={2}>受注ルート</th><th className={TH} rowSpan={2}>紹介元</th>
              <th className={TH} rowSpan={2}>銀行</th>
              <th className={TH} rowSpan={2}>請求書</th>
              <th className={TH} rowSpan={2}>格納先フォルダ</th>
              <th className={TH} rowSpan={2}>備考</th>
              <th className={TH} rowSpan={2}>請求書DL</th>
            </tr>
            <tr>
              <th className={TH}>前受金</th><th className={TH}>報酬</th><th className={TH}>実費</th>
              <th className={TH}>前受金</th><th className={TH}>報酬</th><th className={TH}>実費</th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r, i) => <Row key={i} r={r} onSaveBank={onSaveBank} onSaveNote={onSaveNote} />)}
            <tr className="border-t-2 border-gray-300 bg-amber-50 font-bold text-gray-800">
              <td className={TXT} colSpan={4}>合計</td>
              <td className={NUM}>{yen(sheet.totals.amount)}</td>
              <td className={NUM}>{yen(sheet.totals.diff)}</td>
              <td className={NUM}>{yen(sheet.totals.breakdown)}</td>
              <td className={TXT} colSpan={15}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Row({ r, onSaveBank, onSaveNote }: { r: PaymentRow } & RowHandlers) {
  const openInvoice = async () => {
    if (!r.invoiceId) return
    await openOfficialInvoice(r.invoiceId)
  }
  const downloadInvoice = async () => {
    if (!r.invoiceId) return
    await downloadOfficialInvoice(r.invoiceId)
  }
  return (
    <tr className="hover:bg-blue-50/40">
      <td className={TXT + ' text-center'}>{r.firmMark}</td>
      <td className={TXT}>{r.date}</td>
      <td className={TXT + ' font-mono'}>{r.caseNumber}</td>
      <td className={TXT}>{r.client}</td>
      <td className={NUM + ' font-semibold'}>{yen(r.amount)}</td>
      <td className={NUM + (r.diff ? ' text-red-600' : ' text-gray-300')}>{r.diff ? yen(r.diff) : '0'}</td>
      <td className={NUM}>{yen(r.breakdown)}</td>
      <td className={NUM}>{r.shihoAdvance ? yen(r.shihoAdvance) : ''}</td>
      <td className={NUM}>{r.shihoReward ? yen(r.shihoReward) : ''}</td>
      <td className={NUM}>{r.shihoExpense ? yen(r.shihoExpense) : ''}</td>
      <td className={NUM}>{r.gyoseiAdvance ? yen(r.gyoseiAdvance) : ''}</td>
      <td className={NUM}>{r.gyoseiReward ? yen(r.gyoseiReward) : ''}</td>
      <td className={NUM}>{r.gyoseiExpense ? yen(r.gyoseiExpense) : ''}</td>
      <td className={TXT}>{r.sales}</td>
      <td className={TXT}>{r.manager}</td>
      <td className={TXT}>{r.route}</td>
      <td className={TXT}>{r.referral}</td>
      {/* 銀行（手動指定可） */}
      <td className="border border-gray-200 px-1 py-1">
        <select value={r.bank} onChange={e => onSaveBank(r.paymentId, e.target.value)}
          className={`w-full px-1.5 py-0.5 text-[11px] border rounded outline-none focus:border-brand-500 ${r.bank ? 'border-gray-200 bg-white text-gray-700' : 'border-amber-300 bg-amber-50 text-amber-800 font-semibold'}`}>
          <option value="">未振り分け</option>
          <option value="みずほ">みずほ</option>
          <option value="きらぼし">きらぼし</option>
        </select>
      </td>
      {/* 請求書（ファイルがあればリンクで開く。司法など未生成は「—」） */}
      <td className={TXT + ' text-center'}>
        {r.invoiceFilePath ? (
          <button type="button" onClick={openInvoice} className="inline-flex items-center gap-0.5 text-blue-700 hover:underline" title={r.invoiceType || '請求書を開く'}>
            <FileText className="w-3 h-3" strokeWidth={2.25} /><span className="text-[10.5px]">開く</span>
          </button>
        ) : <span className="text-gray-300">—</span>}
      </td>
      {/* 格納先フォルダ（案件フォルダに遷移。司法の請求書PDF等はここに格納） */}
      <td className={TXT + ' text-center'}>
        {r.caseId ? (
          <Link href={`/cases/${r.caseId}?tab=docs`} className="inline-flex items-center gap-0.5 text-blue-700 hover:underline" title="案件フォルダを開く">
            <FolderOpen className="w-3 h-3" strokeWidth={2.25} /><span className="text-[10.5px]">フォルダ</span><ExternalLink className="w-2.5 h-2.5 opacity-60" />
          </Link>
        ) : <span className="text-gray-300">—</span>}
      </td>
      {/* 備考（invoices.notes・売上表と両方向共有。インライン編集） */}
      <td className="border border-gray-200 px-1 py-1">
        <NoteInput value={r.invoiceNote} disabled={!r.invoiceId} onSave={v => r.invoiceId && onSaveNote(r.invoiceId, v)} />
      </td>
      {/* 請求書DL（Excelをダウンロード。未生成の旧データは生成してから落とす。司法など請求書実体が無い＝invoiceId無しは「—」） */}
      <td className={TXT + ' text-center'}>
        {r.invoiceId ? (
          <button type="button" onClick={downloadInvoice} className="inline-flex items-center gap-0.5 text-green-700 hover:underline" title="請求書(Excel)をダウンロード">
            <Download className="w-3 h-3" strokeWidth={2.25} /><span className="text-[10.5px]">DL</span>
          </button>
        ) : <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}

// 備考の即時保存（onBlur・変更時のみ）
function NoteInput({ value, onSave, disabled }: { value: string; onSave: (v: string) => void; disabled?: boolean }) {
  const [v, setV] = useState(value)
  return (
    <textarea
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v) }}
      disabled={disabled}
      rows={1}
      placeholder={disabled ? '' : '備考'}
      className="w-full min-w-[160px] max-w-[280px] px-1.5 py-0.5 text-[11px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500 resize-y disabled:bg-gray-50"
    />
  )
}

function RefundTable({ refunds }: { refunds: RefundRow[] }) {
  const total = refunds.reduce((s, r) => s + r.amount, 0)
  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between">
        <div className="text-[13px] font-bold text-red-900">返金</div>
        <div className="text-xs text-red-700">{refunds.length}件 ・ 返金計 ¥{yen(total)}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[11px] border-collapse min-w-max">
          <thead>
            <tr>
              <th className={TH}>日付</th><th className={TH}>案件No.</th><th className={TH}>依頼人</th><th className={TH}>返金額</th><th className={TH}>備考</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((r, i) => (
              <tr key={i} className="hover:bg-blue-50/40">
                <td className={TXT}>{r.date}</td>
                <td className={TXT + ' font-mono'}>{r.caseNumber}</td>
                <td className={TXT}>{r.client}</td>
                <td className={NUM + ' font-semibold'}>{yen(r.amount)}</td>
                <td className={TXT + ' max-w-[240px] truncate'} title={r.note}>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
