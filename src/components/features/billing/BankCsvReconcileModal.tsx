'use client'

import { useState } from 'react'
import { Loader2, Upload, Sparkles, AlertTriangle, X } from 'lucide-react'
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

// Shift-JIS / UTF-8 を自動判定してテキスト化（銀行CSVはSJISが多い）
async function readCsvText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  // 文字化け（U+FFFD）が多ければ SJIS とみなす
  const bad = (utf8.match(/�/g) ?? []).length
  if (bad > 3) {
    try { return new TextDecoder('shift-jis').decode(buf) } catch { /* 非対応環境はUTF-8 */ }
  }
  return utf8
}

const today = () => new Date().toISOString().slice(0, 10)

export default function BankCsvReconcileModal({ isOpen, onClose, onSaved }: Props) {
  const [results, setResults] = useState<MatchResult[] | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [picked, setPicked] = useState<Record<number, string>>({}) // review行で人が選んだ invoiceId
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fileName, setFileName] = useState('')

  const reset = () => { setResults(null); setChecked(new Set()); setPicked({}); setFileName('') }

  const handleFile = async (file: File) => {
    setLoading(true)
    setFileName(file.name)
    try {
      const text = await readCsvText(file)
      const rows = parseBankCsv(text)
      if (rows.length === 0) { showToast('入金行が見つかりませんでした（CSVの形式をご確認ください）', 'error'); setLoading(false); return }
      const supabase = createClient()
      const { data: invs } = await supabase
        .from('invoices')
        .select('id, case_id, amount, status, cases(case_number, deal_name, clients(name, transfer_name_kana, furigana), case_clients(furigana, priority, sort_order))')
        .neq('status', '入金済')
      const rawInv = (invs ?? []) as unknown as Array<{ id: string; case_id: string; amount: number; status: string; cases: { case_number: string | null; deal_name: string | null; clients: { name: string | null; transfer_name_kana: string | null; furigana: string | null } | null; case_clients: Array<{ furigana: string | null; priority: string | null; sort_order: number | null }> | null } | null }>
      // 受注担当・管理担当（通知先）を案件ごとに取得
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
      const lite: InvoiceLite[] = rawInv.map(i => ({
        id: i.id, case_id: i.case_id, amount: i.amount, status: i.status,
        case_number: i.cases?.case_number ?? '', deal_name: i.cases?.deal_name ?? '',
        client_name: i.cases?.clients?.name ?? '',
        // 振込名義人カナ。未登録なら依頼者ふりがな（clients→依頼者一覧のメイン）で補完。カナ化は突合側で実施。
        payer_kana: i.cases?.clients?.transfer_name_kana
          || i.cases?.clients?.furigana
          || ((i.cases?.case_clients ?? []).find(c => c.priority === 'main') ?? (i.cases?.case_clients ?? [])[0])?.furigana
          || null,
        sales_member_id: salesByCase.get(i.case_id) ?? null,
        manager_member_id: managerByCase.get(i.case_id) ?? null,
      }))
      const res = matchBankRows(rows, lite)
      setResults(res)
      // AI確定行は既定でチェックON
      setChecked(new Set(res.map((r, idx) => (r.kind === 'matched' ? idx : -1)).filter(i => i >= 0)))
      setPicked({})
    } finally {
      setLoading(false)
    }
  }

  const effectiveInvoiceId = (r: MatchResult, idx: number) => picked[idx] ?? r.invoiceId ?? ''
  const liteById = (r: MatchResult, id: string) => r.candidates.find(c => c.id === id)

  const toggle = (idx: number) => setChecked(prev => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n })

  const confirmCount = results ? [...checked].filter(idx => effectiveInvoiceId(results[idx], idx)).length : 0

  const handleConfirm = async () => {
    if (!results) return
    setSaving(true)
    const supabase = createClient()
    let done = 0
    for (const idx of checked) {
      const r = results[idx]
      const invId = effectiveInvoiceId(r, idx)
      if (!invId) continue
      const inv = liteById(r, invId)
      const by = picked[idx] ? 'human' : r.by   // 人が選び直したら human
      const note = `振込人:${r.row.name || '—'} / 摘要:${r.row.memo || '—'} / CSV取込${today()}`
      const { error: pErr } = await supabase.from('payments').insert({
        invoice_id: invId,
        amount: r.row.amount,
        payment_date: today(),
        payment_method: '振込',
        matched_by: by,
        match_note: note,
      })
      if (pErr) { showToast(`入金記録に失敗: ${pErr.message}`, 'error'); continue }
      // 金額一致で突合しているため入金済に（部分入金は要確認側で扱う想定）
      const status = inv && r.row.amount >= inv.amount ? '入金済' : '入金待ち'
      await supabase.from('invoices').update({ status }).eq('id', invId)
      // 入金確定したら、開いている入金状況確認依頼を自動でクローズ
      if (status === '入金済') { await autoClosePaymentChecks(invId); await ensureReceiptTask(invId) }
      // 受注担当・管理担当へ入金確定通知（同一人物なら1件）。クリックで請求タブの該当案件へ。
      if (inv) {
        const recipients = new Set<string>()
        if (inv.sales_member_id) recipients.add(inv.sales_member_id)
        if (inv.manager_member_id) recipients.add(inv.manager_member_id)
        if (recipients.size > 0) {
          await supabase.from('notifications').insert([...recipients].map(mid => ({
            member_id: mid,
            type: 'payment_confirmed',
            case_id: inv.case_id,
            title: '入金確定',
            body: `${inv.case_number} ${inv.deal_name} の入金（¥${r.row.amount.toLocaleString()}）が入金済になりました。請求タブで確認してください。`,
          })))
        }
      }
      done++
    }
    setSaving(false)
    showToast(done > 0 ? `${done}件の入金を確定し、受注担当・管理担当へ通知しました` : '確定対象がありません', done > 0 ? 'success' : 'error')
    if (done > 0) { onSaved(); reset(); onClose() }
  }

  const counts = results ? {
    matched: results.filter(r => r.kind === 'matched').length,
    review: results.filter(r => r.kind === 'review').length,
    unmatched: results.filter(r => r.kind === 'unmatched').length,
  } : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { reset(); onClose() }}
      title="銀行CSVで入金突合"
      maxWidth="max-w-4xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => { reset(); onClose() }} disabled={saving}>閉じる</Button>
          {results && (
            <Button variant="primary" onClick={handleConfirm} loading={saving} disabled={confirmCount === 0}>
              {saving ? '確定中...' : `選択した入金を確定 (${confirmCount})`}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {!results ? (
          <div>
            <p className="text-[13px] text-gray-600 mb-3">
              銀行の入金明細CSVを取り込み、<strong>振込人カナ＋金額</strong>をキーに未入金の請求へ自動突合します（案件番号が摘要にあれば優先。みずほ／きらぼし対応・Shift-JIS対応）。振込人カナが一致しない金額一致は「要確認」として人が確認します。
            </p>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg py-10 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30">
              {loading ? <Loader2 className="w-6 h-6 animate-spin text-brand-500" /> : <Upload className="w-6 h-6 text-gray-400" />}
              <span className="text-[13px] font-semibold text-gray-600">{loading ? '解析中…' : 'CSVファイルを選択 / ドロップ'}</span>
              <input type="file" accept=".csv,text/csv" className="hidden" disabled={loading}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </label>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-gray-500 mr-auto">{fileName}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold"><Sparkles className="w-3 h-3" />AI確定 {counts?.matched}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold"><AlertTriangle className="w-3 h-3" />要確認 {counts?.review}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 font-semibold"><X className="w-3 h-3" />該当なし {counts?.unmatched}</span>
              <button type="button" onClick={reset} className="ml-2 text-brand-600 hover:underline">別のCSV</button>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-[26rem] overflow-y-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead className="sticky top-0">
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                    <th className="px-2 py-2 w-8"></th>
                    <th className="px-2 py-2 text-left font-semibold">取引（振込人・摘要）</th>
                    <th className="px-2 py-2 text-right font-semibold w-28">金額</th>
                    <th className="px-2 py-2 text-left font-semibold w-72">突合先・判定</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => {
                    const eff = effectiveInvoiceId(r, idx)
                    const inv = eff ? liteById(r, eff) : null
                    const badge = r.kind === 'matched'
                      ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><Sparkles className="w-2.5 h-2.5" />AI確定</span>
                      : r.kind === 'review'
                      ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">要確認</span>
                      : <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-50 text-gray-500 border border-gray-200">該当なし</span>
                    return (
                      <tr key={idx} className={`border-b border-gray-100 ${checked.has(idx) ? 'bg-brand-50/30' : ''}`}>
                        <td className="px-2 py-1.5 text-center">
                          <input type="checkbox" checked={checked.has(idx)} disabled={!eff} onChange={() => toggle(idx)} className="accent-brand-600" />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="font-medium text-gray-800">{r.row.name || <span className="text-gray-300">（振込人なし）</span>}</div>
                          <div className="text-gray-400 truncate max-w-[260px]">{r.row.memo || '—'}{r.row.date ? ` ・${r.row.date}` : ''}</div>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono font-semibold text-gray-800">¥{r.row.amount.toLocaleString()}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5 mb-0.5">{badge}<span className="text-[11px] text-gray-500">{r.reason}</span></div>
                          {r.candidates.length > 0 ? (
                            <select value={eff} onChange={e => { setPicked(p => ({ ...p, [idx]: e.target.value })); setChecked(c => { const n = new Set(c); if (e.target.value) n.add(idx); else n.delete(idx); return n }) }}
                              className="w-full px-1.5 py-1 text-[11px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                              <option value="">— 突合先を選択 —</option>
                              {r.candidates.map(c => <option key={c.id} value={c.id}>{c.case_number} {c.deal_name}（¥{c.amount.toLocaleString()}）</option>)}
                            </select>
                          ) : <span className="text-[11px] text-gray-400">{inv ? `${inv.case_number} ${inv.deal_name}` : '—'}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400">AI確定＝自動で一致。要確認＝突合先を選んでチェック。確定すると入金記録＋受注担当・管理担当へ入金確定通知が飛びます（タスク完了は人手）。</p>
          </>
        )}
      </div>
    </Modal>
  )
}
