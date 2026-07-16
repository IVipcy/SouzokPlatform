'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileSpreadsheet, Download, Settings2, ArrowLeft, CalendarClock } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
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

export default function SalesReportClient({ invoices, expenses, teams: initialTeams }: Props) {
  const router = useRouter()
  const [teams, setTeams] = useState<TeamMeta[]>(initialTeams)
  const [showTeamConfig, setShowTeamConfig] = useState(false)
  const [savingTeams, setSavingTeams] = useState(false)

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

  async function saveTeams() {
    setSavingTeams(true)
    const supabase = createClient()
    for (const t of teams) {
      const orig = initialTeams.find(o => o.id === t.id)
      if (orig && orig.division === t.division && orig.bank === t.bank) continue
      await supabase.from('teams').update({ division: t.division || null, bank: t.bank || null }).eq('id', t.id)
    }
    setSavingTeams(false)
    setShowTeamConfig(false)
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
        description="計上月ごとの売上一覧。営業部×銀行でシート分け、司法/行政でbook分け。Excel出力可"
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

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowTeamConfig(v => !v)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <Settings2 className="w-3.5 h-3.5" /> チーム設定（営業部・銀行）
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition"
          >
            <Download className="w-3.5 h-3.5" /> Excel出力
          </button>
        </div>
      </div>

      {/* チーム設定 */}
      {showTeamConfig && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 mb-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="text-[13px] font-semibold text-blue-900 mb-2">チームの営業部・入金銀行を設定</div>
          <div className="text-xs text-gray-500 mb-3">売上表のシートは「営業部（銀行入金）」で分かれます。各チームがどの営業部・どの銀行かを設定してください。</div>
          <div className="space-y-2">
            {teams.map(t => (
              <div key={t.id} className="grid grid-cols-[120px_1fr_1fr] gap-2 items-center">
                <div className="text-sm font-medium text-gray-700">{t.name}</div>
                <input
                  value={t.division ?? ''}
                  onChange={e => setTeams(ts => ts.map(x => x.id === t.id ? { ...x, division: e.target.value } : x))}
                  placeholder="営業部（例：第一営業部）"
                  className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg"
                />
                <input
                  value={t.bank ?? ''}
                  onChange={e => setTeams(ts => ts.map(x => x.id === t.id ? { ...x, bank: e.target.value } : x))}
                  placeholder="入金銀行（例：みずほ）"
                  list="bank-list"
                  className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg"
                />
              </div>
            ))}
            <datalist id="bank-list">
              <option value="みずほ" />
              <option value="きらぼし" />
            </datalist>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => { setTeams(initialTeams); setShowTeamConfig(false) }} className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
            <button onClick={saveTeams} disabled={savingTeams} className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{savingTeams ? '保存中…' : '保存'}</button>
          </div>
        </div>
      )}

      {/* book本体 */}
      <BookView book={currentBook} monthLabel={monthLabel} />
    </div>
  )
}

function BookView({ book, monthLabel }: { book: SalesBook; monthLabel: string }) {
  if (book.sheets.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
        {book.label}の計上データがありません{monthLabel && `（${monthLabel}）`}
      </div>
    )
  }
  return (
    <div className="space-y-5">
      {book.sheets.map(sheet => <SheetTable key={sheet.key} sheet={sheet} />)}
    </div>
  )
}

const NUM = 'px-2 py-1 text-right tabular-nums whitespace-nowrap'
const TXT = 'px-2 py-1 whitespace-nowrap'

function SheetTable({ sheet }: { sheet: SalesSheet }) {
  const t = sheet.totals
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
        <div className="text-[13px] font-bold text-blue-900">{sheet.title}</div>
        <div className="text-xs text-blue-700">{sheet.rows.length}件 ・ 差引請求 ¥{yen(t.billed)}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[11px] border-collapse min-w-max">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
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
      <td className={TXT} colSpan={5}>合　計</td>
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
