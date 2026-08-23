'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileSpreadsheet, Download, ArrowLeft, CalendarClock } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { billingPatternOf } from '@/lib/constants'
import HelpHint from '@/components/ui/HelpHint'
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

  // 計上月の選択肢（計上日 = posted_date ?? issued_date の YYYY-MM）
  //   会計上、請求書発行=売掛計上=売上計上として扱うため、posted_date 未設定でも issued_date で拾う。
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    for (const inv of invoices) {
      if (!isSaleInvoice(inv.invoice_type, patternOf(inv))) continue
      const posted = inv.posted_date ?? inv.issued_date
      if (posted) set.add(posted.slice(0, 7))
    }
    return [...set].sort().reverse()
  }, [invoices])

  const [month, setMonth] = useState<string>(() => monthOptions[0] ?? 'all')
  const [book, setBook] = useState<'gyosei' | 'shiho'>('gyosei')
  // 銀行フィルタタブ：'all'(すべて) / 'みずほ' / 'きらぼし' / '__unassigned__'(未振り分け)
  const [bankFilter, setBankFilter] = useState<'all' | 'みずほ' | 'きらぼし' | '__unassigned__'>('all')
  // 事業部フィルタタブ：'all'(すべて) / '第一事業部' / '第二事業部' / '__unassigned__'(未設定)
  const [divisionFilter, setDivisionFilter] = useState<'all' | '第一事業部' | '第二事業部' | '__unassigned__'>('all')

  const books = useMemo(
    () => buildSalesReport(invoices, expenses, rewards, teams, month),
    [invoices, expenses, rewards, teams, month],
  )
  const currentBook = books.find(b => b.key === book)!

  // 未計上（売上を表す請求書だが posted_date も issued_date も未設定）
  //   会計上、請求書発行時点で計上する。発行済(issued_date あり)なら発行日で自動計上されるため未計上ではない。
  const unposted = useMemo(
    () => invoices.filter(inv =>
      isSaleInvoice(inv.invoice_type, patternOf(inv)) && !inv.posted_date && !inv.issued_date &&
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

  // 銀行を手動で上書き（invoice.bank_override）。'' = 自動判定に戻す（null保存）。
  async function saveBankOverride(invoiceId: string, bank: string) {
    const supabase = createClient()
    await supabase.from('invoices').update({ bank_override: bank || null }).eq('id', invoiceId)
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
        afterTitle={<SalesReportHelp />}
        description="請求書を発行した月＝売上を立てた月として並べた一覧です。行政書士法人／司法書士法人を切り替え、事業部と入金銀行ごとの表をExcelに出せます。"
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

      {/* フィルタ：事業部＋銀行 */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14">事業部</span>
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            {([['all','すべて'], ['第一事業部','第一事業部'], ['第二事業部','第二事業部'], ['__unassigned__','未設定']] as const).map(([k,label]) => (
              <button key={k} onClick={() => setDivisionFilter(k)}
                className={`px-3 py-1.5 text-xs font-semibold transition ${divisionFilter === k ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14">銀行</span>
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            {([['all','すべて'], ['みずほ','みずほ'], ['きらぼし','きらぼし'], ['__unassigned__','未振り分け']] as const).map(([k,label]) => (
              <button key={k} onClick={() => setBankFilter(k)}
                className={`px-3 py-1.5 text-xs font-semibold transition ${bankFilter === k ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500">未振り分け行は右端「銀行」列で手動指定できます。</span>
        </div>
      </div>

      {/* book本体 */}
      <BookView book={currentBook} monthLabel={monthLabel} onSaveDeduct={saveDeduct} onSaveBankOverride={saveBankOverride} bankFilter={bankFilter} divisionFilter={divisionFilter} />
    </div>
  )
}

type SheetHandlers = {
  onSaveDeduct: (invoiceId: string, field: 'deduct_expense_nontax' | 'deduct_expense_tax', value: number) => void
  onSaveBankOverride: (invoiceId: string, bank: string) => void
}

function BookView({ book, monthLabel, onSaveDeduct, onSaveBankOverride, bankFilter, divisionFilter }: { book: SalesBook; monthLabel: string; bankFilter: 'all' | 'みずほ' | 'きらぼし' | '__unassigned__'; divisionFilter: 'all' | '第一事業部' | '第二事業部' | '__unassigned__' } & SheetHandlers) {
  // 銀行×事業部の複合フィルタ。'all' は全部、'__unassigned__' は それぞれ未設定シートのみ。
  const filteredSheets = book.sheets.filter(s => {
    const bankOK = bankFilter === 'all' ? true : bankFilter === '__unassigned__' ? !s.bank : s.bank === bankFilter
    const divOK = divisionFilter === 'all' ? true : divisionFilter === '__unassigned__' ? !s.division : s.division === divisionFilter
    return bankOK && divOK
  })
  if (filteredSheets.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
        {book.label}の計上データがありません{monthLabel && `（${monthLabel}）`}
      </div>
    )
  }
  return (
    <div className="space-y-5">
      {filteredSheets.map(sheet => <SheetTable key={sheet.key} sheet={sheet} onSaveDeduct={onSaveDeduct} onSaveBankOverride={onSaveBankOverride} />)}
    </div>
  )
}

const NUM = 'border border-gray-200 px-2 py-1 text-right tabular-nums whitespace-nowrap'
const TXT = 'border border-gray-200 px-2 py-1 whitespace-nowrap'
const TH = 'border border-gray-300 bg-gray-100 px-2 py-1 font-semibold text-gray-700 text-center whitespace-nowrap'

function SheetTable({ sheet, onSaveDeduct, onSaveBankOverride }: { sheet: SalesSheet } & SheetHandlers) {
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
              <th className={TH} rowSpan={2}>案件番号</th><th className={TH} rowSpan={2} title="案件の請求パターン。①は確定請求で計上し前受金を差し引く／②③は前受金で計上する">請求<br />パターン</th><th className={TH} rowSpan={2}>クライアント</th>
              <th className={TH} colSpan={2}>報酬額</th>
              <th className={TH} colSpan={4}>立替実費</th>
              <th className={TH} colSpan={2}>立替実費差引額</th>
              <th className={TH} rowSpan={2}>合計</th><th className={TH} rowSpan={2}>前受金</th><th className={TH} rowSpan={2}>差引請求</th>
              <th className={TH} rowSpan={2}>入金日</th><th className={TH} rowSpan={2}>備考</th>
              <th className={TH} rowSpan={2}>チーム</th><th className={TH} rowSpan={2}>受注</th><th className={TH} rowSpan={2}>管理</th>
              <th className={TH} rowSpan={2} title="銀行の手動指定（未振り分け行を手動で振り分けたい時にどうぞ）">銀行</th>
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
                <td className={TXT + ' text-center text-gray-500'} title={billingPatternOf(r.billingPattern).label}>{billingPatternOf(r.billingPattern).no}</td>
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
                <td className="border border-gray-200 px-1 py-1">
                  <BankPicker current={r.bankOverride ?? ''} auto={!r.bankOverride} onSave={v => onSaveBankOverride(r.invoiceId, v)} />
                </td>
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
      <td className={NUM}>{t.dedNonTax ? yen(t.dedNonTax) : ''}</td>
      <td className={NUM}>{t.dedTaxIncl ? yen(t.dedTaxIncl) : ''}</td>
      <td className={NUM}>{yen(t.total)}</td>
      <td className={NUM}>{yen(t.advance)}</td>
      <td className={NUM}>{yen(t.billed)}</td>
      <td className={TXT} colSpan={6}></td>
    </tr>
  )
}

// 銀行の手動指定：null=自動判定（payments.bank に従う）／みずほ／きらぼし
function BankPicker({ current, auto, onSave }: { current: string; auto: boolean; onSave: (v: string) => void }) {
  return (
    <select
      value={current}
      onChange={e => onSave(e.target.value)}
      className={`w-full px-1.5 py-0.5 text-[11px] border rounded outline-none focus:border-brand-500 ${auto ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-brand-300 bg-brand-50 text-brand-700 font-semibold'}`}
      title={auto ? '自動判定（この請求の入金銀行に従う）' : '手動指定中'}
    >
      <option value="">自動</option>
      <option value="みずほ">みずほ</option>
      <option value="きらぼし">きらぼし</option>
    </select>
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

// タイトル横の「?」。確定売上表と入金明細の違い・載る条件・①の前受金の扱いを置く。
// 3つの表（請求・入金一覧／確定売上表／入金明細）の役割は毎回聞かれるので、ここで一度に答える。
function SalesReportHelp() {
  return (
    <HelpHint title="この表は何か" width={420}>
      <span className="block mb-2">
        <b className="text-gray-900">確定売上表</b>は「いつ売上を立てたか」の帳票です。1行＝請求書1枚。
        <b className="text-gray-900">請求書に発行日が入った時点</b>で載り、入金の有無は関係ありません
        （未入金の行は入金日が「未入金」になります）。
      </span>
      <span className="block mb-2">
        <b className="text-gray-900">入金明細</b>は「いつ・どの銀行に・いくら入ったか」の帳票です。1行＝入金1本。
        銀行CSVの突合や手動の入金記録でお金が動いたときに載ります。返金は別シートです。
      </span>
      <span className="block mb-2 pt-2 border-t border-gray-100">
        <b className="text-gray-900">請求パターンによる載り方の違い</b>
      </span>
      <span className="block mb-1.5">
        <b className="text-gray-900">①段階請求</b>… <b className="text-gray-900">確定請求を発行した月</b>に1行載ります。
        報酬の全額（前受金でもらったぶんを含む）を「合計」に立て、受け取り済みの前受金は
        「前受金」列で差し引いて「差引請求」を出します。前受金は単体では行になりません。
        二重に計上しないためで、前受金をもらっただけの月には売上は立ちません。
      </span>
      <span className="block mb-2">
        <b className="text-gray-900">②一括＋実費・③一括のみ</b>… 前受金＝確定なので、
        <b className="text-gray-900">前受金を発行した月</b>に載ります。
      </span>
      <span className="block text-gray-500">
        報酬額は案件の報酬内訳、立替実費は立替実費の登録から拾います。
        銀行は入金のあった銀行で決まり、未入金のうちは右端の欄で手動指定できます。
      </span>
    </HelpHint>
  )
}
