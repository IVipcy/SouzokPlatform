'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileSpreadsheet, Download, ArrowLeft, CalendarClock } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { DEPOSIT_BANKS } from '@/lib/constants'
import {
  buildSalesReport,
  type SalesReportRaw, type ExpenseItem, type TeamMeta, type SalesBook, type SalesSheet, type SalesTotals,
} from '@/lib/salesReport'
import { exportSalesBook, downloadBlob } from '@/lib/salesReportExcel'
import { createClient } from '@/lib/supabase/client'

type Props = {
  invoices: SalesReportRaw[]
  expenses: ExpenseItem[]
  teams: TeamMeta[]
}

const yen = (n: number) => n.toLocaleString()

export default function SalesReportClient({ invoices, expenses, teams }: Props) {
  const router = useRouter()

  // 計上月の選択肢（posted_date の YYYY-MM）
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    for (const inv of invoices) {
      if (inv.invoice_type === '確定請求' && inv.posted_date) set.add(inv.posted_date.slice(0, 7))
    }
    return [...set].sort().reverse()
  }, [invoices])

  const [month, setMonth] = useState<string>(() => monthOptions[0] ?? 'all')
  const [book, setBook] = useState<'gyosei' | 'shiho'>('gyosei')

  const books = useMemo(
    () => buildSalesReport(invoices, expenses, teams, month),
    [invoices, expenses, teams, month],
  )
  const currentBook = books.find(b => b.key === book)!

  // 未計上（確定請求済だが posted_date 未設定）
  const unposted = useMemo(
    () => invoices.filter(inv =>
      inv.invoice_type === '確定請求' && !inv.posted_date &&
      ['確定請求済', '入金済', '一部入金'].includes(inv.status),
    ),
    [invoices],
  )

  const monthLabel = month === 'all' ? '' : `${Number(month.slice(5, 7))}月分`

  // 案件の入金銀行を振り分け（お客さんの振込先）→ シートが変わる
  async function assignBank(caseId: string, bank: string) {
    const supabase = createClient()
    await supabase.from('cases').update({ bank: bank || null }).eq('id', caseId)
    router.refresh()
  }

  async function handleExport() {
    const blob = await exportSalesBook(currentBook, monthLabel)
    const mLabel = month === 'all' ? '全期間' : month
    downloadBlob(blob, `確定売上表_${currentBook.key === 'shiho' ? '司法' : '行政'}_${mLabel}.xlsx`)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Billing"
        title="確定売上表"
        icon={FileSpreadsheet}
        description="計上月ごとの売上一覧。入金銀行（第一=みずほ／第二=きらぼし）でシート分け、司法/行政でbook分け。Excel出力可"
        right={
          <Link href="/billing" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> 請求・入金へ
          </Link>
        }
      />

      {/* 未計上アラート */}
      {unposted.length > 0 && (
        <UnpostedPanel invoices={unposted} onDone={() => router.refresh()} />
      )}

      {/* ツールバー */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <CalendarClock className="w-4 h-4" /> 計上月
        </div>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
        >
          <option value="all">全期間</option>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* book切替 */}
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden ml-1">
          {(['gyosei', 'shiho'] as const).map(k => (
            <button
              key={k}
              onClick={() => setBook(k)}
              className={`px-3 py-1.5 text-xs font-semibold transition ${book === k ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {k === 'gyosei' ? '行政書士法人' : '司法書士法人'}
            </button>
          ))}
        </div>

        <button
          onClick={handleExport}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition"
        >
          <Download className="w-3.5 h-3.5" /> Excel出力
        </button>
      </div>

      <div className="text-xs text-gray-500 mb-3">
        入金銀行は各行の「銀行」列で振り分けます（お客さんの振込先次第。CSV突合で自動記録・未入金は手動選択）。
      </div>

      {/* book本体 */}
      <BookView book={currentBook} monthLabel={monthLabel} onAssignBank={assignBank} />
    </div>
  )
}

function BookView({ book, monthLabel, onAssignBank }: { book: SalesBook; monthLabel: string; onAssignBank: (caseId: string, bank: string) => void }) {
  if (book.sheets.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
        {book.label}の計上データがありません{monthLabel && `（${monthLabel}）`}
      </div>
    )
  }
  return (
    <div className="space-y-5">
      {book.sheets.map(sheet => <SheetTable key={sheet.key} sheet={sheet} onAssignBank={onAssignBank} />)}
    </div>
  )
}

const NUM = 'px-2 py-1 text-right tabular-nums whitespace-nowrap'
const TXT = 'px-2 py-1 whitespace-nowrap'

function SheetTable({ sheet, onAssignBank }: { sheet: SalesSheet; onAssignBank: (caseId: string, bank: string) => void }) {
  const t = sheet.totals
  const unassigned = !sheet.bank
  return (
    <div className={`bg-white border rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden ${unassigned ? 'border-amber-300' : 'border-gray-200'}`}>
      <div className={`px-4 py-2.5 border-b flex items-center justify-between ${unassigned ? 'bg-amber-50 border-amber-100' : 'bg-blue-50 border-blue-100'}`}>
        <div className={`text-[13px] font-bold ${unassigned ? 'text-amber-900' : 'text-blue-900'}`}>{sheet.title}</div>
        <div className={`text-xs ${unassigned ? 'text-amber-700' : 'text-blue-700'}`}>{sheet.rows.length}件 ・ 差引請求 ¥{yen(t.billed)}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[11px] border-collapse min-w-max">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className={TXT}>銀行</th>
              <th className={TXT}>計上日</th><th className={TXT}>No</th><th className={TXT}>発行日</th>
              <th className={TXT}>案件番号</th><th className={TXT}>クライアント</th>
              <th className={NUM}>報酬(税込)</th><th className={NUM}>(内税)</th>
              <th className={NUM}>立替非課税</th><th className={NUM}>立替課税</th><th className={NUM}>(内税)</th><th className={NUM}>立替計</th>
              <th className={NUM}>合計</th><th className={NUM}>前受金</th><th className={NUM}>差引請求</th>
              <th className={TXT}>入金日</th><th className={TXT}>備考</th>
              <th className={TXT}>チーム</th><th className={TXT}>受注</th><th className={TXT}>管理</th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r, i) => (
              <tr key={r.invoiceId} className="border-t border-gray-100 hover:bg-gray-50">
                <td className={TXT}>
                  <select
                    value={r.bank ?? ''}
                    onChange={e => onAssignBank(r.caseId, e.target.value)}
                    className={`px-1.5 py-0.5 text-[11px] border rounded ${r.bank ? 'border-gray-200 bg-white' : 'border-amber-300 bg-amber-50 text-amber-800'}`}
                  >
                    <option value="">未設定</option>
                    {DEPOSIT_BANKS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                  </select>
                </td>
                <td className={TXT}>{r.postedDate ?? ''}</td>
                <td className={TXT}>{i + 1}</td>
                <td className={TXT}>{r.issuedDate ?? ''}</td>
                <td className={TXT + ' font-mono'}>{r.caseNumber}</td>
                <td className={TXT}>{r.clientName}</td>
                <td className={NUM}>{yen(r.rewardInclTax)}</td>
                <td className={NUM + ' text-gray-400'}>{yen(r.rewardTax)}</td>
                <td className={NUM}>{r.expNonTax ? yen(r.expNonTax) : ''}</td>
                <td className={NUM}>{r.expTaxInclTax ? yen(r.expTaxInclTax) : ''}</td>
                <td className={NUM + ' text-gray-400'}>{r.expTax ? yen(r.expTax) : ''}</td>
                <td className={NUM}>{r.expTotal ? yen(r.expTotal) : ''}</td>
                <td className={NUM + ' font-semibold'}>{yen(r.total)}</td>
                <td className={NUM}>{r.advance ? yen(r.advance) : ''}</td>
                <td className={NUM + ' font-semibold'}>{yen(r.billed)}</td>
                <td className={TXT}>{r.paidDate ?? <span className="text-red-500">未入金</span>}</td>
                <td className={TXT + ' max-w-[160px] truncate'} title={r.note}>{r.note}</td>
                <td className={TXT}>{r.teamName}</td>
                <td className={TXT}>{r.salesName}</td>
                <td className={TXT}>{r.managerName}</td>
              </tr>
            ))}
            <TotalRow t={t} />
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TotalRow({ t }: { t: SalesTotals }) {
  return (
    <tr className="border-t-2 border-gray-300 bg-amber-50 font-bold text-gray-800">
      <td className={TXT} colSpan={6}>合　計</td>
      <td className={NUM}>{yen(t.rewardInclTax)}</td>
      <td className={NUM}>{yen(t.rewardTax)}</td>
      <td className={NUM}>{yen(t.expNonTax)}</td>
      <td className={NUM}>{yen(t.expTaxInclTax)}</td>
      <td className={NUM}>{yen(t.expTax)}</td>
      <td className={NUM}>{yen(t.expTotal)}</td>
      <td className={NUM}>{yen(t.total)}</td>
      <td className={NUM}>{yen(t.advance)}</td>
      <td className={NUM}>{yen(t.billed)}</td>
      <td className={TXT} colSpan={5}></td>
    </tr>
  )
}

// 未計上の確定請求を一括計上する
function UnpostedPanel({ invoices, onDone }: { invoices: SalesReportRaw[]; onDone: () => void }) {
  const [postDate, setPostDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [checked, setChecked] = useState<Set<string>>(() => new Set(invoices.map(i => i.id)))
  const [saving, setSaving] = useState(false)

  const toggle = (id: string) => setChecked(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  async function post() {
    if (checked.size === 0) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('invoices').update({ posted_date: postDate }).in('id', [...checked])
    setSaving(false)
    onDone()
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[13px] font-semibold text-amber-900">未計上の確定請求が {invoices.length} 件あります</div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-amber-800">計上日</label>
          <input type="date" value={postDate} onChange={e => setPostDate(e.target.value)} className="px-2 py-1 text-xs border border-amber-300 rounded-lg bg-white" />
          <button onClick={post} disabled={saving || checked.size === 0} className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50">
            {saving ? '計上中…' : `選択した${checked.size}件を計上`}
          </button>
        </div>
      </div>
      <div className="max-h-40 overflow-y-auto divide-y divide-amber-100">
        {invoices.map(inv => {
          const c = inv.cases
          const cn = c?.case_number ?? ''
          const name = (Array.isArray(c?.clients) ? c?.clients[0]?.name : c?.clients?.name) ?? c?.deceased_name ?? ''
          return (
            <label key={inv.id} className="flex items-center gap-2 py-1 text-xs text-amber-900 cursor-pointer">
              <input type="checkbox" checked={checked.has(inv.id)} onChange={() => toggle(inv.id)} />
              <span className="font-mono">{cn}</span>
              <span>{name}</span>
              <span className="ml-auto tabular-nums">¥{yen((inv.fee_amount ?? 0) + (inv.expenses_amount ?? 0))}</span>
              <span className="text-amber-600">{inv.firm_type === 'shiho' ? '司法' : '行政'}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
