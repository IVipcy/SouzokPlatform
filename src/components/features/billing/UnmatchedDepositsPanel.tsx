'use client'

// 銀行CSV突合④：CSVにあり・システムに該当なしの未処理入金（unmatched_deposits, status=open）。
// 「請求に紐付け」＝選んだ請求へ入金確定（payment＋入金済＋通知）／「対象外」＝dismissed。
import { useState } from 'react'
import { Link2, Ban, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { autoClosePaymentChecks } from '@/lib/paymentCheck'
import { ensureReceiptTask } from '@/lib/receiptTask'
import type { UnmatchedDepositRow } from '@/types'

type PanelInvoice = {
  id: string; amount: number; status: string; case_id: string
  cases?: { case_number?: string | null; deal_name?: string | null; case_members?: Array<{ role: string; member_id: string }> | null } | null
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`
const today = () => new Date().toISOString().slice(0, 10)

export default function UnmatchedDepositsPanel({ deposits, invoices, onChanged }: {
  deposits: UnmatchedDepositRow[]
  invoices: PanelInvoice[]
  onChanged: () => void
}) {
  const [pick, setPick] = useState<Record<string, string>>({})   // depositId → invoiceId
  const [busy, setBusy] = useState<string | null>(null)

  if (deposits.length === 0) return null
  const unpaid = invoices.filter(i => i.status !== '入金済')

  const linkToInvoice = async (dep: UnmatchedDepositRow) => {
    const invId = pick[dep.id]
    const inv = unpaid.find(i => i.id === invId)
    if (!inv) { showToast('紐付け先の請求を選んでください', 'error'); return }
    setBusy(dep.id)
    const supabase = createClient()
    const { error } = await supabase.from('payments').insert({
      invoice_id: inv.id, amount: dep.amount, payment_date: dep.deposit_date ?? today(),
      payment_method: '振込', matched_by: 'human', match_note: `CSVのみ入金を紐付け（振込人:${dep.payer_name || '—'} / ${dep.memo || '—'}）`,
    })
    if (error) { showToast(`入金記録に失敗: ${error.message}`, 'error'); setBusy(null); return }
    const status = dep.amount >= inv.amount ? '入金済' : '入金待ち'
    await supabase.from('invoices').update({ status, needs_review: false, review_reason: null }).eq('id', inv.id)
    if (status === '入金済') {
      await autoClosePaymentChecks(inv.id); await ensureReceiptTask(inv.id)
      const recipients = new Set<string>((inv.cases?.case_members ?? []).filter(m => m.role === 'sales' || m.role === 'manager').map(m => m.member_id))
      if (recipients.size > 0) {
        await supabase.from('notifications').insert([...recipients].map(mid => ({
          member_id: mid, type: 'payment_confirmed', case_id: inv.case_id, title: '入金確定',
          body: `${inv.cases?.case_number ?? ''} ${inv.cases?.deal_name ?? ''} の入金（${yen(dep.amount)}）が入金済になりました。`,
        })))
      }
    }
    await supabase.from('unmatched_deposits').update({ status: 'linked', linked_invoice_id: inv.id, resolved_at: new Date().toISOString() }).eq('id', dep.id)
    setBusy(null)
    showToast('CSVのみ入金を請求へ紐付けました', 'success')
    onChanged()
  }

  const dismiss = async (dep: UnmatchedDepositRow) => {
    setBusy(dep.id)
    const supabase = createClient()
    await supabase.from('unmatched_deposits').update({ status: 'dismissed', resolved_at: new Date().toISOString() }).eq('id', dep.id)
    setBusy(null)
    showToast('対象外にしました', 'success')
    onChanged()
  }

  return (
    <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50/40">
      <div className="px-3.5 py-2 border-b border-brand-100 flex items-center gap-2">
        <span className="text-[12.5px] font-semibold text-brand-800">CSVにあり・システムに該当なし（未処理入金）</span>
        <span className="text-[11px] text-brand-600">{deposits.length}件</span>
        <span className="ml-auto text-[11px] text-gray-400">突合できなかった入金。請求に紐付けるか対象外に。</span>
      </div>
      <div className="divide-y divide-brand-100">
        {deposits.map(dep => (
          <div key={dep.id} className="px-3.5 py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center">
            <div className="min-w-0">
              <div className="text-[13px] text-gray-800">{dep.payer_name || '（振込人なし）'} ・ <span className="font-mono">{yen(dep.amount)}</span></div>
              <div className="text-[11px] text-gray-500 truncate">{dep.deposit_date ?? '—'} ・ 摘要: {dep.memo || '—'}{dep.source_file ? ` ・ ${dep.source_file}` : ''}</div>
            </div>
            <div className="flex items-center gap-1.5">
              <select value={pick[dep.id] ?? ''} onChange={e => setPick(p => ({ ...p, [dep.id]: e.target.value }))} disabled={busy === dep.id}
                className="px-1.5 py-1 text-[11px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500 max-w-[220px]">
                <option value="">— 請求に紐付け —</option>
                {unpaid.map(i => <option key={i.id} value={i.id}>{i.cases?.case_number ?? ''} {i.cases?.deal_name ?? ''}（{yen(i.amount)}）</option>)}
              </select>
              <button type="button" onClick={() => linkToInvoice(dep)} disabled={busy === dep.id || !pick[dep.id]}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-brand-600 rounded hover:bg-brand-700 disabled:opacity-40">
                {busy === dep.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}紐付け
              </button>
              <button type="button" onClick={() => dismiss(dep)} disabled={busy === dep.id}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"><Ban className="w-3 h-3" />対象外</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
