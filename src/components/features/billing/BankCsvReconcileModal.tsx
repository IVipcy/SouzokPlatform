'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { Loader2, Upload, Sparkles, AlertTriangle, Check, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { parseBankCsv, matchBankRows, type InvoiceLite, type MatchResult } from '@/lib/bankReconcile'
import { autoClosePaymentChecks } from '@/lib/paymentCheck'
import { ensureReceiptTask } from '@/lib/receiptTask'

type Props = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

// 表示・突合の両方に使う入金待ち請求（InvoiceLite＋請求種別・期日）
type InvoiceRich = InvoiceLite & { invoice_type: string; due_date: string | null }

// Shift-JIS / UTF-8 を自動判定してテキスト化（銀行CSVはSJISが多い）
async function readCsvText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  const bad = (utf8.match(/�/g) ?? []).length
  if (bad > 3) {
    try { return new TextDecoder('shift-jis').decode(buf) } catch { /* 非対応環境はUTF-8 */ }
  }
  return utf8
}

const today = () => new Date().toISOString().slice(0, 10)
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`
const mdOf = (ymd: string | null) => (ymd && ymd.length >= 10 ? `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}` : '—')
// CSVの取引日を YYYY-MM-DD へ（取れないものは null。dateカラムへ安全に入れる）
const toDbDate = (s: string): string | null => {
  const m = (s || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

export default function BankCsvReconcileModal({ isOpen, onClose, onSaved }: Props) {
  const [invoices, setInvoices] = useState<InvoiceRich[] | null>(null)
  const [results, setResults] = useState<MatchResult[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [payChecked, setPayChecked] = useState<Set<string>>(new Set())        // ①確定で入金済にする invoiceId
  const [reviewText, setReviewText] = useState<Record<string, string>>({})     // ②③の要確認理由（編集可）
  const [leftoverPick, setLeftoverPick] = useState<Record<number, string>>({}) // CSVのみ行→紐付ける invoiceId
  const [leftoverDismiss, setLeftoverDismiss] = useState<Set<number>>(new Set()) // CSVのみ行→対象外

  const todayStr = today()

  // 入金待ちの請求を読み込む（突合の土台。CSV投入前から一覧表示）
  useEffect(() => {
    if (!isOpen) return
    let alive = true
    setLoading(true)
    ;(async () => {
      const supabase = createClient()
      const { data: invs } = await supabase
        .from('invoices')
        .select('id, case_id, invoice_type, amount, status, due_date, cases(case_number, deal_name, clients(name, transfer_name_kana, transfer_name_kana_2, transfer_name_kana_3, furigana), case_clients(furigana, priority, sort_order))')
        .neq('status', '入金済')
      const rawInv = (invs ?? []) as unknown as Array<{ id: string; case_id: string; invoice_type: string; amount: number; status: string; due_date: string | null; cases: { case_number: string | null; deal_name: string | null; clients: { name: string | null; transfer_name_kana: string | null; transfer_name_kana_2: string | null; transfer_name_kana_3: string | null; furigana: string | null } | null; case_clients: Array<{ furigana: string | null; priority: string | null; sort_order: number | null }> | null } | null }>
      const caseIds = [...new Set(rawInv.map(i => i.case_id))]
      const salesByCase = new Map<string, string>()
      const managerByCase = new Map<string, string>()
      if (caseIds.length > 0) {
        const { data: cms } = await supabase.from('case_members').select('case_id, member_id, role').in('role', ['sales', 'manager']).in('case_id', caseIds)
        for (const m of (cms ?? []) as Array<{ case_id: string; member_id: string; role: string }>) {
          const map = m.role === 'manager' ? managerByCase : salesByCase
          if (!map.has(m.case_id)) map.set(m.case_id, m.member_id)
        }
      }
      const rich: InvoiceRich[] = rawInv.map(i => ({
        id: i.id, case_id: i.case_id, amount: i.amount, status: i.status,
        invoice_type: i.invoice_type, due_date: i.due_date,
        case_number: i.cases?.case_number ?? '', deal_name: i.cases?.deal_name ?? '',
        client_name: i.cases?.clients?.name ?? '',
        payer_kana: i.cases?.clients?.transfer_name_kana
          || i.cases?.clients?.furigana
          || ((i.cases?.case_clients ?? []).find(c => c.priority === 'main') ?? (i.cases?.case_clients ?? [])[0])?.furigana
          || null,
        payer_kana_2: i.cases?.clients?.transfer_name_kana_2 ?? null,
        payer_kana_3: i.cases?.clients?.transfer_name_kana_3 ?? null,
        sales_member_id: salesByCase.get(i.case_id) ?? null,
        manager_member_id: managerByCase.get(i.case_id) ?? null,
      }))
      // 期日の早い順（未入金の督促優先）
      rich.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
      if (alive) { setInvoices(rich); setLoading(false) }
    })()
    return () => { alive = false }
  }, [isOpen])

  const resetCsv = () => { setResults(null); setFileName(''); setPayChecked(new Set()); setReviewText({}); setLeftoverPick({}); setLeftoverDismiss(new Set()) }
  const closeAll = () => { resetCsv(); setInvoices(null); onClose() }

  const handleFile = async (file: File) => {
    if (!invoices) return
    setParsing(true)
    setFileName(file.name)
    try {
      const text = await readCsvText(file)
      const rows = parseBankCsv(text)
      if (rows.length === 0) { showToast('入金行が見つかりませんでした（CSVの形式をご確認ください）', 'error'); setParsing(false); return }
      const res = matchBankRows(rows, invoices)
      setResults(res)
      // ①確定は既定でチェックON。②③の理由は編集用に控える。
      const pay = new Set<string>()
      const rev: Record<string, string> = {}
      for (const r of res) {
        if (r.invoiceId && r.kind === 'matched') pay.add(r.invoiceId)
        if (r.invoiceId && r.kind === 'review') rev[r.invoiceId] = r.reason
      }
      setPayChecked(pay); setReviewText(rev); setLeftoverPick({}); setLeftoverDismiss(new Set())
    } finally {
      setParsing(false)
    }
  }

  // 請求ID→突合結果（matched優先）。CSVのみ（invoiceIdなし）は leftover へ。
  const byInvoice = new Map<string, MatchResult>()
  if (results) for (const r of results) {
    if (r.invoiceId && (r.kind === 'matched' || r.kind === 'review')) {
      const prev = byInvoice.get(r.invoiceId)
      if (!prev || (prev.kind === 'review' && r.kind === 'matched')) byInvoice.set(r.invoiceId, r)
    }
  }
  const leftover = results ? results.map((r, idx) => ({ r, idx })).filter(x => !x.r.invoiceId) : []

  const matchedIds = [...byInvoice].filter(([, r]) => r.kind === 'matched').map(([id]) => id)
  const reviewIds = [...byInvoice].filter(([, r]) => r.kind === 'review').map(([id]) => id)
  const confirmCount = matchedIds.filter(id => payChecked.has(id)).length

  const togglePay = (id: string) => setPayChecked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleDismiss = (idx: number) => setLeftoverDismiss(prev => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n })

  const handleApply = async () => {
    if (!invoices || !results) return
    setSaving(true)
    const supabase = createClient()
    const invById = new Map(invoices.map(i => [i.id, i]))
    let paid = 0, reviewed = 0, deposits = 0

    const confirmPay = async (inv: InvoiceRich, row: MatchResult['row'], by: 'ai' | 'human') => {
      const note = `振込人:${row.name || '—'} / 摘要:${row.memo || '—'} / CSV取込${today()}`
      const { error } = await supabase.from('payments').insert({ invoice_id: inv.id, amount: row.amount, payment_date: today(), payment_method: '振込', matched_by: by, match_note: note, bank: row.bank || null })
      if (error) { showToast(`入金記録に失敗: ${error.message}`, 'error'); return }
      const status = row.amount >= inv.amount ? '入金済' : '入金待ち'
      await supabase.from('invoices').update({ status, needs_review: false, review_reason: null }).eq('id', inv.id)
      // 入金元の銀行を案件へ自動記録（売上表のシート分け＝振り分け）
      if (row.bank) await supabase.from('cases').update({ bank: row.bank }).eq('id', inv.case_id)
      if (status === '入金済') {
        await autoClosePaymentChecks(inv.id); await ensureReceiptTask(inv.id)
        const recipients = new Set<string>()
        if (inv.sales_member_id) recipients.add(inv.sales_member_id)
        if (inv.manager_member_id) recipients.add(inv.manager_member_id)
        if (recipients.size > 0) {
          await supabase.from('notifications').insert([...recipients].map(mid => ({
            member_id: mid, type: 'payment_confirmed', case_id: inv.case_id, title: '入金確定',
            body: `${inv.case_number} ${inv.deal_name} の入金（${yen(row.amount)}）が入金済になりました。請求タブで確認してください。`,
          })))
        }
        paid++
      }
    }

    // ①確定（チェック分）→ 入金済 / ②③要確認 → フラグ保存（入金済にしない）
    for (const [id, res] of byInvoice) {
      const inv = invById.get(id); if (!inv) continue
      if (res.kind === 'matched' && payChecked.has(id)) {
        await confirmPay(inv, res.row, 'ai')
      } else if (res.kind === 'review') {
        await supabase.from('invoices').update({ needs_review: true, review_reason: reviewText[id] ?? res.reason }).eq('id', inv.id)
        reviewed++
      }
    }

    // CSVのみ：紐付け＝手動確定／それ以外は unmatched_deposits へ（対象外はdismissed）
    for (const { r, idx } of leftover) {
      const pickId = leftoverPick[idx]
      if (pickId) {
        const inv = invById.get(pickId)
        if (inv) { await confirmPay(inv, r.row, 'human'); continue }
      }
      const dedup = `${r.row.date}|${r.row.amount}|${r.row.name}|${r.row.memo}`
      const { error } = await supabase.from('unmatched_deposits').insert({
        payer_name: r.row.name || null, amount: r.row.amount, deposit_date: toDbDate(r.row.date),
        memo: r.row.memo || null, source_file: fileName || null, dedup_key: dedup,
        status: leftoverDismiss.has(idx) ? 'dismissed' : 'open',
      })
      if (!error) deposits++   // 重複（unique違反）は静かにスキップ
    }

    setSaving(false)
    showToast(`反映しました：入金確定 ${paid}件・要確認 ${reviewed}件・CSVのみ ${deposits}件`, 'success')
    onSaved(); closeAll()
  }

  const chip = (cls: string, label: string, n: number, icon?: ReactNode) =>
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{icon}{label} {n}</span>

  return (
    <Modal isOpen={isOpen} onClose={closeAll} title="入金突合" maxWidth="max-w-5xl"
      footer={
        <>
          <Button variant="secondary" onClick={closeAll} disabled={saving}>閉じる</Button>
          {results && (
            <Button variant="primary" onClick={handleApply} loading={saving}>
              {saving ? '反映中…' : `突合結果を反映（確定${confirmCount}・要確認${reviewIds.length}・CSVのみ${leftover.length}）`}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {/* CSV投入バー */}
        {!results ? (
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg py-6 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30">
            {parsing ? <Loader2 className="w-5 h-5 animate-spin text-brand-500" /> : <Upload className="w-5 h-5 text-gray-400" />}
            <span className="text-[13px] font-semibold text-gray-600">{parsing ? '解析中…' : '入金待ちの一覧に、銀行CSVを投入して突合（ドロップ／選択）'}</span>
            <input type="file" accept=".csv,text/csv" className="hidden" disabled={parsing || !invoices}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </label>
        ) : (
          <div className="flex items-center gap-2 text-[12px] flex-wrap">
            <span className="text-gray-500 mr-auto">{fileName}</span>
            {chip('bg-emerald-50 text-emerald-700 border-emerald-200', '①確定', matchedIds.length, <Sparkles className="w-3 h-3" />)}
            {chip('bg-amber-50 text-amber-700 border-amber-200', '②③要確認', reviewIds.length, <AlertTriangle className="w-3 h-3" />)}
            {chip('bg-brand-50 text-brand-700 border-brand-200', 'CSVのみ', leftover.length)}
            <button type="button" onClick={resetCsv} className="ml-1 text-brand-600 hover:underline">別のCSV</button>
          </div>
        )}

        {/* 入金待ちの請求（突合結果を各行に埋め込み） */}
        {loading || !invoices ? (
          <div className="py-8 text-center text-[13px] text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />入金待ちを読み込み中…</div>
        ) : invoices.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-gray-400">入金待ちの請求はありません。</div>
        ) : (
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1.5">入金待ちの請求（{invoices.length}件）</div>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[24rem] overflow-y-auto">
              {invoices.map(inv => {
                const res = byInvoice.get(inv.id)
                const overdue = !!inv.due_date && inv.due_date < todayStr
                return (
                  <div key={inv.id} className={`px-3 py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center ${res?.kind === 'review' ? 'bg-amber-50/50' : overdue && !res ? 'bg-rose-50/40' : ''}`}>
                    <div className="min-w-0">
                      <div className="text-[13px]"><span className="font-mono text-brand-700">{inv.case_number}</span> <span className="text-gray-800">{inv.deal_name || inv.client_name}</span></div>
                      <div className="text-[11px] text-gray-500">{inv.invoice_type} {yen(inv.amount)} ・ 期日 {mdOf(inv.due_date)}{res ? ` ・ 入金 ${yen(res.row.amount)}` : ''}</div>
                      {res?.kind === 'review' && (
                        <input type="text" value={reviewText[inv.id] ?? res.reason} onChange={e => setReviewText(p => ({ ...p, [inv.id]: e.target.value }))}
                          className="mt-1 w-full max-w-md px-2 py-1 text-[11px] text-amber-800 bg-white border border-amber-200 rounded outline-none focus:border-amber-400" title="要確認の理由（編集できます）" />
                      )}
                    </div>
                    <div className="text-right whitespace-nowrap">
                      {res?.kind === 'matched' ? (
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={payChecked.has(inv.id)} onChange={() => togglePay(inv.id)} className="accent-emerald-600" />
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><Check className="w-3 h-3" strokeWidth={2.5} />① 確定</span>
                        </label>
                      ) : res?.kind === 'review' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-white text-amber-700 border border-amber-300">要確認</span>
                      ) : overdue ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200"><Clock className="w-3 h-3" />未入金（期日超過）</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-50 text-gray-500 border border-gray-200">未入金</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* CSVにあり・システムに該当なし（要調査） */}
        {results && leftover.length > 0 && (
          <div>
            <div className="text-[12px] font-semibold text-gray-500 mb-1.5">CSVにあり・システムに該当なし（{leftover.length}件）</div>
            <div className="border border-brand-200 rounded-lg divide-y divide-brand-100">
              {leftover.map(({ r, idx }) => {
                const cand = r.candidates.length > 0 ? r.candidates : (invoices ?? [])
                const dismissed = leftoverDismiss.has(idx)
                return (
                  <div key={idx} className={`px-3 py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center ${dismissed ? 'opacity-50' : 'bg-brand-50/30'}`}>
                    <div className="min-w-0">
                      <div className="text-[13px] text-brand-800">{r.row.name || '（振込人なし）'} ・ {yen(r.row.amount)}</div>
                      <div className="text-[11px] text-brand-700/70 truncate">{r.row.date || '—'} ・ 摘要: {r.row.memo || '—'}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select value={leftoverPick[idx] ?? ''} disabled={dismissed}
                        onChange={e => setLeftoverPick(p => ({ ...p, [idx]: e.target.value }))}
                        className="px-1.5 py-1 text-[11px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500 disabled:bg-gray-50 max-w-[220px]">
                        <option value="">— 請求に紐付け —</option>
                        {cand.map(c => <option key={c.id} value={c.id}>{c.case_number} {c.deal_name}（{yen(c.amount)}）</option>)}
                      </select>
                      <button type="button" onClick={() => toggleDismiss(idx)}
                        className={`px-2 py-1 text-[11px] rounded border ${dismissed ? 'bg-gray-200 text-gray-600 border-gray-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>対象外</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-400">①確定＝チェック分を入金済に（受注/管理へ通知）。②③要確認＝入金済にせず「要確認」で保存し、後で個別確定。CSVのみ＝紐付け or 対象外、未処理はそのまま残ります。</p>
      </div>
    </Modal>
  )
}
