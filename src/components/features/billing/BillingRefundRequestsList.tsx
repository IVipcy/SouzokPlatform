'use client'

// 返金依頼フィルタ専用ビュー。返金依頼(未対応)／返金済 を切替。経理が「OK（返金確定）」でマイナス入金を記録。
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { feeBearerLabel } from '@/lib/billingRequests'
import type { BillingRequestRow } from './BillingRequestsPanel'
import type { RefundEntry } from './RefundListModal'

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`
const today = () => new Date().toISOString().slice(0, 10)

export default function BillingRefundRequestsList({ refundReqs, refundEntries, canReconcile, currentMemberId, onChanged }: {
  refundReqs: BillingRequestRow[]
  refundEntries: RefundEntry[]
  canReconcile: boolean
  currentMemberId: string | null
  onChanged: () => void
}) {
  const [tab, setTab] = useState<'request' | 'done'>('request')
  const [busy, setBusy] = useState<string | null>(null)

  const confirmRefund = async (req: BillingRequestRow) => {
    const amt = req.refund_amount ?? 0
    if (!amt || !confirm(`${req.caseNumber} ${req.dealName} に ${yen(amt)} を返金確定しますか？（マイナス入金を記録します）`)) return
    setBusy(req.id)
    const supabase = createClient()
    const { error } = await supabase.from('payments').insert({ invoice_id: req.invoice_id, amount: -amt, payment_date: today(), payment_method: '振込', is_refund: true, matched_by: 'human', match_note: `返金（${req.reason_category ?? '—'}・手数料${feeBearerLabel(req.fee_bearer)}）` })
    if (error) { showToast(`返金記録に失敗: ${error.message}`, 'error'); setBusy(null); return }
    await supabase.from('payment_check_requests').update({ status: '完了', confirmer_id: currentMemberId, confirmed_date: today() }).eq('id', req.id)
    if (req.requester_id) await supabase.from('notifications').insert({ member_id: req.requester_id, type: 'billing_request_resolved', case_id: req.case_id, title: '返金を確定しました', body: `${req.caseNumber} ${req.dealName}：${yen(amt)} を返金しました。` })
    setBusy(null); showToast('返金を確定しました', 'success'); onChanged()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-gray-900">返金</span>
        <button type="button" onClick={() => setTab('request')} className={`text-[11px] px-3 py-1 rounded-full ${tab === 'request' ? 'bg-rose-600 text-white font-semibold' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>返金依頼 {refundReqs.length}</button>
        <button type="button" onClick={() => setTab('done')} className={`text-[11px] px-3 py-1 rounded-full ${tab === 'done' ? 'bg-gray-700 text-white font-semibold' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>返金済 {refundEntries.length}</button>
      </div>
      <div className="divide-y divide-gray-100">
        {tab === 'request' ? (
          refundReqs.length === 0 ? <div className="px-3 py-8 text-center text-[13px] text-gray-400">返金依頼はありません</div>
          : refundReqs.map(req => (
            <div key={req.id} className="px-4 py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center">
              <div className="min-w-0">
                <div className="text-[13px]"><Link href={`/cases/${req.case_id}`} className="font-mono text-brand-700 hover:underline">{req.caseNumber}</Link> <span className="text-gray-800">{req.dealName}</span> ・ <span className="font-mono">{yen(req.refund_amount ?? 0)}</span></div>
                <div className="text-[11px] text-rose-700 mt-0.5">{req.reason_category ?? '—'} ・ 手数料{feeBearerLabel(req.fee_bearer)}{req.request_note ? ` ・ ${req.request_note}` : ''}</div>
              </div>
              {canReconcile
                ? <button type="button" disabled={busy === req.id} onClick={() => confirmRefund(req)} className="px-3 py-1 text-[11px] font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 disabled:opacity-40">OK（返金確定）</button>
                : <span className="text-[11px] text-gray-400">経理の対応待ち</span>}
            </div>
          ))
        ) : (
          refundEntries.length === 0 ? <div className="px-3 py-8 text-center text-[13px] text-gray-400">返金済はありません</div>
          : refundEntries.map(e => (
            <div key={e.id} className="px-4 py-2.5 grid grid-cols-[auto_1fr_auto] gap-3 items-center">
              <span className="text-[11px] font-mono text-gray-400 w-14">{e.date?.slice(5) || '—'}</span>
              <div className="min-w-0 text-[13px]"><Link href={`/cases/${e.caseId}`} className="font-mono text-brand-700 hover:underline">{e.caseNumber}</Link> <span className="text-gray-800">{e.dealName}</span><div className="text-[11px] text-gray-500 truncate">{e.reason || '—'}</div></div>
              <span className="text-[13px] font-mono font-semibold text-rose-600 whitespace-nowrap">▲{yen(e.amount)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
