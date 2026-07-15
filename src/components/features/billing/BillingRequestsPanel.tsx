'use client'

// 経理の「確認・返金 依頼」パネル。要確認KPIとは別枠で3分類を並べる。
//   要確認(CSV突合)→確認依頼を出す ／ 確認依頼中→回答(判定)を見て入金確定 or 返金確定 ／ 要返金→返金確定
import { useState } from 'react'
import { HelpCircle, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { feeBearerLabel, resolutionOf } from '@/lib/billingRequests'
import BillingRequestModal, { type RequestInvoice } from './BillingRequestModal'

export type BillingRequestRow = {
  id: string
  invoice_id: string
  case_id: string
  kind: 'confirm' | 'refund'
  status: string
  requester_id: string | null
  request_note: string | null
  result_note: string | null
  resolution: string | null
  reason_category: string | null
  fee_bearer: string | null
  refund_amount: number | null
  caseNumber: string
  dealName: string
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`
const today = () => new Date().toISOString().slice(0, 10)

export default function BillingRequestsPanel({ reviewInvoices, requests, currentMemberId, onChanged }: {
  reviewInvoices: RequestInvoice[]
  requests: BillingRequestRow[]
  currentMemberId: string | null
  onChanged: () => void
}) {
  const [confirmTarget, setConfirmTarget] = useState<RequestInvoice | null>(null)  // 確認依頼を出す対象
  const [busy, setBusy] = useState<string | null>(null)

  const confirmReqs = requests.filter(r => r.kind === 'confirm' && r.status !== '完了')
  const refundReqs = requests.filter(r => r.kind === 'refund' && r.status !== '完了')
  if (reviewInvoices.length === 0 && confirmReqs.length === 0 && refundReqs.length === 0) return null

  const notifyRequester = async (req: BillingRequestRow, title: string, body: string) => {
    const supabase = createClient()
    if (req.requester_id) await supabase.from('notifications').insert({ member_id: req.requester_id, type: 'billing_request_resolved', case_id: req.case_id, title, body })
  }

  // 返金確定＝マイナス入金を記録し、依頼を完了に。
  const doRefund = async (req: BillingRequestRow, amount: number, reasonNote: string) => {
    if (!amount || amount <= 0) { showToast('返金額が不正です', 'error'); return }
    setBusy(req.id)
    const supabase = createClient()
    const { error } = await supabase.from('payments').insert({ invoice_id: req.invoice_id, amount: -amount, payment_date: today(), payment_method: '振込', is_refund: true, matched_by: 'human', match_note: reasonNote })
    if (error) { showToast(`返金記録に失敗: ${error.message}`, 'error'); setBusy(null); return }
    await supabase.from('payment_check_requests').update({ status: '完了', confirmer_id: currentMemberId, confirmed_date: today() }).eq('id', req.id)
    await notifyRequester(req, '返金を確定しました', `${req.caseNumber} ${req.dealName}：${yen(amount)} を返金しました。`)
    setBusy(null); showToast('返金を確定しました', 'success'); onChanged()
  }

  const finishConfirm = async (req: BillingRequestRow) => {
    setBusy(req.id)
    const supabase = createClient()
    await supabase.from('payment_check_requests').update({ status: '完了', confirmer_id: currentMemberId, confirmed_date: today() }).eq('id', req.id)
    setBusy(null); showToast('確認依頼を完了にしました', 'success'); onChanged()
  }

  const onRefundConfirmRequest = (req: BillingRequestRow) => {
    const amt = req.refund_amount ?? 0
    if (!confirm(`${req.caseNumber} ${req.dealName} に ${yen(amt)} を返金確定しますか？（マイナス入金を記録します）`)) return
    doRefund(req, amt, `返金（${req.reason_category ?? '—'}・手数料${feeBearerLabel(req.fee_bearer)}）`)
  }
  const onRefundFromConfirm = (req: BillingRequestRow) => {
    const input = window.prompt('返金額を入力してください（円）', '')
    const amt = Number((input ?? '').replace(/[^\d]/g, ''))
    if (!amt) return
    doRefund(req, amt, `過入金の返金（確認依頼より）`)
  }

  const groupHead = (cls: string, label: string, count: number, hint: string) =>
    <div className={`px-3.5 py-2 text-[12px] font-semibold ${cls}`}>{label}・{count}件 <span className="font-normal opacity-80">— {hint}</span></div>

  return (
    <div className="mb-4 rounded-lg border border-gray-200 overflow-hidden">
      {/* 要確認（CSV突合）→ 確認依頼を出す */}
      {reviewInvoices.length > 0 && <>
        {groupHead('bg-amber-50 text-amber-800', '要確認（CSV突合）', reviewInvoices.length, '迷っている入金。ここから確認依頼を出す')}
        {reviewInvoices.map(inv => (
          <div key={inv.id} className="px-3.5 py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center border-b border-gray-100">
            <div className="min-w-0">
              <div className="text-[13px]"><span className="font-mono text-brand-700">{inv.cases?.case_number}</span> {inv.cases?.deal_name} ・ {yen(inv.amount)}</div>
            </div>
            <button type="button" onClick={() => setConfirmTarget(inv)} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border border-gray-300 bg-white hover:bg-gray-50"><HelpCircle className="w-3.5 h-3.5" />確認依頼を出す</button>
          </div>
        ))}
      </>}

      {/* 確認依頼中 → 回答(判定)を見て対応 */}
      {confirmReqs.length > 0 && <>
        {groupHead('bg-brand-50 text-brand-800', '確認依頼中', confirmReqs.length, '受注/管理の回答を待つ・回答後に対応')}
        {confirmReqs.map(req => {
          const res = resolutionOf(req.resolution)
          const answered = req.status === '回答済'
          return (
            <div key={req.id} className="px-3.5 py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center border-b border-gray-100">
              <div className="min-w-0">
                <div className="text-[13px]"><span className="font-mono text-brand-700">{req.caseNumber}</span> {req.dealName}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">依頼: {req.request_note || '—'}</div>
                {answered && (
                  <div className="text-[11px] text-gray-600 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {res && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${res.cls}`}>判定: {res.label}</span>}
                    <span>回答: {req.result_note || '（コメントなし）'}</span>
                  </div>
                )}
              </div>
              <div className="whitespace-nowrap">
                {!answered ? <span className="text-[11px] text-gray-400">回答待ち</span>
                  : req.resolution === 'need_refund'
                    ? <button type="button" disabled={busy === req.id} onClick={() => onRefundFromConfirm(req)} className="px-3 py-1 text-[11px] font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 disabled:opacity-40">返金確定</button>
                    : <button type="button" disabled={busy === req.id} onClick={() => finishConfirm(req)} className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-md hover:bg-emerald-100 disabled:opacity-40"><Check className="w-3 h-3" />完了</button>}
              </div>
            </div>
          )
        })}
      </>}

      {/* 要返金 → 返金確定 */}
      {refundReqs.length > 0 && <>
        {groupHead('bg-rose-50 text-rose-800', '要返金', refundReqs.length, '返金依頼（承認済み）→ 経理が返金確定')}
        {refundReqs.map(req => (
          <div key={req.id} className="px-3.5 py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center border-b border-gray-100 last:border-b-0">
            <div className="min-w-0">
              <div className="text-[13px]"><span className="font-mono text-brand-700">{req.caseNumber}</span> {req.dealName} ・ <span className="font-mono">{yen(req.refund_amount ?? 0)}</span></div>
              <div className="text-[11px] text-rose-700 mt-0.5">{req.reason_category ?? '—'} ・ 手数料{feeBearerLabel(req.fee_bearer)}{req.request_note ? ` ・ ${req.request_note}` : ''}</div>
            </div>
            <button type="button" disabled={busy === req.id} onClick={() => onRefundConfirmRequest(req)} className="px-3 py-1 text-[11px] font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 disabled:opacity-40">返金確定</button>
          </div>
        ))}
      </>}

      {confirmTarget && <BillingRequestModal isOpen mode="confirm" invoice={confirmTarget} currentMemberId={currentMemberId} onClose={() => setConfirmTarget(null)} onSaved={onChanged} />}
    </div>
  )
}
