'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ListChecks, Download, ArrowLeft, CalendarClock } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { buildPaymentDetail, type PaymentDetailRaw, type PaymentSheet, type RefundRow } from '@/lib/paymentDetail'
import { exportPaymentDetail } from '@/lib/paymentDetailExcel'
import { downloadBlob } from '@/lib/salesReportExcel'

type Props = { payments: PaymentDetailRaw[] }

const yen = (n: number) => n.toLocaleString()

export default function PaymentDetailClient({ payments }: Props) {
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of payments) if (p.payment_date) set.add(p.payment_date.slice(0, 7))
    return [...set].sort().reverse()
  }, [payments])

  const [month, setMonth] = useState<string>(() => monthOptions[0] ?? 'all')
  const detail = useMemo(() => buildPaymentDetail(payments, month), [payments, month])
  const monthLabel = month === 'all' ? '' : `${Number(month.slice(5, 7))}月分`

  async function handleExport() {
    const blob = await exportPaymentDetail(detail, monthLabel)
    downloadBlob(blob, `入金明細_${month === 'all' ? '全期間' : month}.xlsx`)
  }

  const hasData = detail.sheets.some(s => s.rows.length) || detail.refunds.length > 0

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

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-gray-500"><CalendarClock className="w-4 h-4" /> 入金月</div>
        <select value={month} onChange={e => setMonth(e.target.value)} className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="all">全期間</option>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={handleExport} className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition">
          <Download className="w-3.5 h-3.5" /> Excel出力
        </button>
      </div>

      {!hasData ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
          入金データがありません{monthLabel && `（${monthLabel}）`}
        </div>
      ) : (
        <div className="space-y-5">
          {detail.sheets.map(sheet => <SheetTable key={sheet.key} sheet={sheet} />)}
          {detail.refunds.length > 0 && <RefundTable refunds={detail.refunds} />}
        </div>
      )}
    </div>
  )
}

const NUM = 'px-2 py-1 text-right tabular-nums whitespace-nowrap'
const TXT = 'px-2 py-1 whitespace-nowrap'

function SheetTable({ sheet }: { sheet: PaymentSheet }) {
  const unassigned = !sheet.bank
  return (
    <div className={`bg-white border rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden ${unassigned ? 'border-amber-300' : 'border-gray-200'}`}>
      <div className={`px-4 py-2.5 border-b flex items-center justify-between ${unassigned ? 'bg-amber-50 border-amber-100' : 'bg-blue-50 border-blue-100'}`}>
        <div className={`text-[13px] font-bold ${unassigned ? 'text-amber-900' : 'text-blue-900'}`}>{sheet.title}</div>
        <div className={`text-xs ${unassigned ? 'text-amber-700' : 'text-blue-700'}`}>{sheet.rows.length}件 ・ 入金計 ¥{yen(sheet.totals.amount)}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[11px] border-collapse min-w-max">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className={TXT}>司/行</th><th className={TXT}>日付</th><th className={TXT}>案件番号</th><th className={TXT}>依頼者</th>
              <th className={NUM}>入金額</th><th className={NUM}>差額</th><th className={NUM}>内訳</th>
              <th className={NUM}>司前受金</th><th className={NUM}>司報酬</th><th className={NUM}>司実費</th>
              <th className={NUM}>行前受金</th><th className={NUM}>行報酬</th><th className={NUM}>行実費</th>
              <th className={TXT}>受注</th><th className={TXT}>管理</th><th className={TXT}>受注ルート</th><th className={TXT}>紹介元</th>
              <th className={TXT}>請求書</th><th className={TXT}>備考</th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
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
                <td className={TXT + ' text-center'}>{r.hasInvoice}</td>
                <td className={TXT + ' max-w-[160px] truncate'} title={r.note}>{r.note}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 bg-amber-50 font-bold text-gray-800">
              <td className={TXT} colSpan={4}>合計</td>
              <td className={NUM}>{yen(sheet.totals.amount)}</td>
              <td className={NUM}>{yen(sheet.totals.diff)}</td>
              <td className={NUM}>{yen(sheet.totals.breakdown)}</td>
              <td className={TXT} colSpan={12}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RefundTable({ refunds }: { refunds: RefundRow[] }) {
  const total = refunds.reduce((s, r) => s + r.amount, 0)
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="px-4 py-2.5 bg-red-50 border-b border-red-100 flex items-center justify-between">
        <div className="text-[13px] font-bold text-red-900">返金</div>
        <div className="text-xs text-red-700">{refunds.length}件 ・ 返金計 ¥{yen(total)}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[11px] border-collapse min-w-max">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className={TXT}>日付</th><th className={TXT}>案件No.</th><th className={TXT}>依頼人</th><th className={NUM}>返金額</th><th className={TXT}>備考</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((r, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
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
