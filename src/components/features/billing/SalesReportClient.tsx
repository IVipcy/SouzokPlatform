'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileSpreadsheet, Download, ArrowLeft, CalendarClock, Building2 } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { SALES_DIVISIONS } from '@/lib/constants'
import {
  buildSalesReport, isSaleInvoice,
  type SalesReportRaw, type ExpenseItem, type RewardItem, type TeamMeta, type SalesBook, type SalesSheet, type SalesTotals,
} from '@/lib/salesReport'
import { exportSalesBook, downloadBlob } from '@/lib/salesReportExcel'
import { createClient } from '@/lib/supabase/client'

type Props = {
  invoices: SalesReportRaw[]
  expenses: ExpenseItem[]
  rewards: RewardItem[]
  teams: TeamMeta[]
}

const yen = (n: number) => n.toLocaleString()

export default function SalesReportClient({ invoices, expenses, rewards, teams }: Props) {
  const router = useRouter()

  // 「売上を表す請求書」判定（①=確定請求／②③=前受金）
  const patternOf = (inv: SalesReportRaw) => (inv.cases?.billing_pattern as string | null | undefined)

  // 計上月の選択肢（posted_date の YYYY-MM）
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    for (const inv of invoices) {
      if (isSaleInvoice(inv.invoice_type, patternOf(inv)) && inv.posted_date) set.add(inv.posted_date.slice(0, 7))
    }
    return [...set].sort().reverse()
  }, [invoices])

  const [month, setMonth] = useState<string>(() => monthOptions[0] ?? 'all')
  const [book, setBook] = useState<'gyosei' | 'shiho'>('gyosei')
  const [showDivisionConfig, setShowDivisionConfig] = useState(false)

  const books = useMemo(
    () => buildSalesReport(invoices, expenses, rewards, teams, month),
    [invoices, expenses, rewards, teams, month],
  )
  const currentBook = books.find(b => b.key === book)!

  // 未計上（売上を表す請求書だが posted_date 未設定）
  const unposted = useMemo(
    () => invoices.filter(inv =>
      isSaleInvoice(inv.invoice_type, patternOf(inv)) && !inv.posted_date &&
      ['前受金請求済', '前受金入金済', '確定請求済', '入金済', '一部入金'].includes(inv.status),
    ),
    [invoices],
  )

  const monthLabel = month === 'all' ? '' : `${Number(month.slice(5, 7))}月分`

  // 立替実費差引額（差引請求額から引く分）を確定請求invoiceへ保存
  async function saveDeduct(invoiceId: string, field: 'deduct_expense_nontax' | 'deduct_expense_tax', value: number) {
    const supabase = createClient()
    await supabase.from('invoices').update({ [field]: value }).eq('id', invoiceId)
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
        description="計上月ごとの売上一覧。シート＝営業部（受注担当のチーム）×入金銀行、book＝司法/行政。Excel出力可"
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
          onClick={() => setShowDivisionConfig(v => !v)}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
        >
          <Building2 className="w-3.5 h-3.5" /> 営業部設定（チーム別）
        </button>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition"
        >
          <Download className="w-3.5 h-3.5" /> Excel出力
        </button>
      </div>

      {showDivisionConfig && (
        <DivisionSettingsPanel teams={teams} onClose={() => setShowDivisionConfig(false)} onSaved={() => { setShowDivisionConfig(false); router.refresh() }} />
      )}

      <div className="text-xs text-gray-500 mb-3">
        シートは「営業部（受注担当のチーム）×入金銀行」で分かれます。営業部は「営業部設定」でチームごとに割り当て、入金銀行は<b>入金消込したCSV（みずほ/きらぼし）で自動判定</b>されます。<b>入金済の行のみ表示</b>（未入金は入金確定後に載ります）。
      </div>

      {/* book本体 */}
      <BookView book={currentBook} monthLabel={monthLabel} onSaveDeduct={saveDeduct} />
    </div>
  )
}

// チーム→営業部（第一/第二）の割り当て。売上表のシートは「営業部×銀行」で分かれる。
function DivisionSettingsPanel({ teams, onClose, onSaved }: { teams: TeamMeta[]; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(teams.map(t => [t.id, t.division ?? ''])))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const supabase = createClient()
    for (const t of teams) {
      const v = draft[t.id] ?? ''
      if ((t.division ?? '') === v) continue
      await supabase.from('teams').update({ division: v || null }).eq('id', t.id)
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-4 mb-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="text-[13px] font-semibold text-blue-900 mb-1">チームごとの営業部を設定</div>
      <div className="text-xs text-gray-500 mb-3">受注担当のチームの営業部で、売上表のシートが決まります（例：高橋チーム＝第一営業部）。</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {teams.map(t => (
          <div key={t.id} className="flex items-center gap-2">
            <div className="flex-1 text-sm text-gray-700 truncate">{t.name}</div>
            <select
              value={draft[t.id] ?? ''}
              onChange={e => setDraft(d => ({ ...d, [t.id]: e.target.value }))}
              className="w-[150px] px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
            >
              <option value="">未設定</option>
              {SALES_DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
        <button onClick={save} disabled={saving} className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? '保存中…' : '保存'}</button>
      </div>
    </div>
  )
}

type SheetHandlers = {
  onSaveDeduct: (invoiceId: string, field: 'deduct_expense_nontax' | 'deduct_expense_tax', value: number) => void
}

function BookView({ book, monthLabel, onSaveDeduct }: { book: SalesBook; monthLabel: string } & SheetHandlers) {
  if (book.sheets.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
        {book.label}の計上データがありません{monthLabel && `（${monthLabel}）`}
      </div>
    )
  }
  return (
    <div className="space-y-5">
      {book.sheets.map(sheet => <SheetTable key={sheet.key} sheet={sheet} onSaveDeduct={onSaveDeduct} />)}
    </div>
  )
}

const NUM = 'border border-gray-200 px-2 py-1 text-right tabular-nums whitespace-nowrap'
const TXT = 'border border-gray-200 px-2 py-1 whitespace-nowrap'
const TH = 'border border-gray-300 bg-gray-100 px-2 py-1 font-semibold text-gray-700 text-center whitespace-nowrap'

function SheetTable({ sheet, onSaveDeduct }: { sheet: SalesSheet } & SheetHandlers) {
  const t = sheet.totals
  const unassigned = !sheet.division || !sheet.bank
  return (
    <div className={`bg-white border rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden ${unassigned ? 'border-amber-300' : 'border-gray-300'}`}>
      <div className={`px-4 py-2 border-b flex items-center justify-between ${unassigned ? 'bg-amber-50 border-amber-200' : 'bg-gray-100 border-gray-300'}`}>
        <div className={`text-[13px] font-bold ${unassigned ? 'text-amber-900' : 'text-gray-800'}`}>{sheet.title}</div>
        <div className={`text-xs ${unassigned ? 'text-amber-700' : 'text-gray-500'}`}>{sheet.rows.length}件 ・ 差引請求 ¥{yen(t.billed)}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[11px] border-collapse min-w-max">
          <thead>
            <tr>
              <th className={TH} rowSpan={2}>計上日</th><th className={TH} rowSpan={2}>No</th><th className={TH} rowSpan={2}>発行日</th>
              <th className={TH} rowSpan={2}>案件番号</th><th className={TH} rowSpan={2}>クライアント</th>
              <th className={TH} colSpan={2}>報酬額</th>
              <th className={TH} colSpan={4}>立替実費</th>
              <th className={TH} colSpan={2}>立替実費差引額</th>
              <th className={TH} rowSpan={2}>合計</th><th className={TH} rowSpan={2}>前受金</th><th className={TH} rowSpan={2}>差引請求</th>
              <th className={TH} rowSpan={2}>入金日</th><th className={TH} rowSpan={2}>備考</th>
              <th className={TH} rowSpan={2}>チーム</th><th className={TH} rowSpan={2}>受注</th><th className={TH} rowSpan={2}>管理</th>
            </tr>
            <tr>
              <th className={TH}>税込</th><th className={TH}>(内税)</th>
              <th className={TH}>非課税</th><th className={TH}>課税</th><th className={TH}>(内税)</th><th className={TH}>立替計</th>
              <th className={TH} title="立替のうち今回請求から差し引く分（非課税）">非課税</th>
              <th className={TH} title="立替のうち今回請求から差し引く分（課税税込）">課税</th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r, i) => (
              <tr key={r.invoiceId} className="hover:bg-blue-50/40">
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
                <td className="border border-gray-200 px-1 py-1 text-right">
                  <DeductInput value={r.dedNonTax} onSave={v => onSaveDeduct(r.invoiceId, 'deduct_expense_nontax', v)} />
                </td>
                <td className="border border-gray-200 px-1 py-1 text-right">
                  <DeductInput value={r.dedTaxIncl} onSave={v => onSaveDeduct(r.invoiceId, 'deduct_expense_tax', v)} />
                </td>
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
      <td className={NUM}>{t.dedNonTax ? yen(t.dedNonTax) : ''}</td>
      <td className={NUM}>{t.dedTaxIncl ? yen(t.dedTaxIncl) : ''}</td>
      <td className={NUM}>{yen(t.total)}</td>
      <td className={NUM}>{yen(t.advance)}</td>
      <td className={NUM}>{yen(t.billed)}</td>
      <td className={TXT} colSpan={5}></td>
    </tr>
  )
}

// 差引実費の入力（空=0。変更時のみ保存）
function DeductInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(value ? String(value) : '')
  return (
    <input
      inputMode="numeric"
      value={v}
      onChange={e => setV(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={() => { const n = Number(v || 0); if (n !== (value ?? 0)) onSave(n) }}
      placeholder="0"
      className={`w-16 px-1 py-0.5 text-[11px] text-right border rounded ${v ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}
    />
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
        <div className="text-[13px] font-semibold text-amber-900">未計上の売上（請求書）が {invoices.length} 件あります</div>
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
              <span className="ml-auto tabular-nums">¥{yen(inv.invoice_type === '前受金' ? (inv.amount ?? 0) : ((inv.fee_amount ?? 0) + (inv.expenses_amount ?? 0)))}</span>
              <span className="text-amber-600">{inv.firm_type === 'shiho' ? '司法' : '行政'}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
