'use client'

// 返金依頼フィルタ専用ビュー。返金依頼(未対応)／返金済 を切替。
// 承認フロー(migration 198)：pending_sales→pending_leader→approved→（経理が返金確定）。
// approval_status='approved' でないと経理は返金確定できない。承認担当者本人は「承認」ボタンからモーダルを開ける。
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { feeBearerLabel } from '@/lib/billingRequests'
import RefundDecideModal, { type RefundDecideRequest } from './RefundDecideModal'
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
  const [decideTarget, setDecideTarget] = useState<RefundDecideRequest | null>(null)

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
      <div className="divide-y divide-gray-200">
        {tab === 'request' ? (
          refundReqs.length === 0 ? <div className="px-3 py-8 text-center text-[13px] text-gray-400">返金依頼はありません</div>
          : refundReqs.map(req => {
            const st = req.approval_status
            const isMySalesStep = st === 'pending_sales' && req.sales_approver_id === currentMemberId
            const isMyLeaderStep = st === 'pending_leader' && req.leader_approver_id === currentMemberId
            const canApprove = isMySalesStep || isMyLeaderStep
            const openDecide = () => setDecideTarget({
              id: req.id, case_id: req.case_id, invoice_id: req.invoice_id,
              requester_id: req.requester_id, request_note: req.request_note,
              reason_category: req.reason_category, fee_bearer: req.fee_bearer,
              refund_amount: req.refund_amount, requested_date: req.requested_date,
              approval_status: st ?? null,
              sales_approver_id: req.sales_approver_id ?? null,
              leader_approver_id: req.leader_approver_id ?? null,
              caseNumber: req.caseNumber, dealName: req.dealName,
              requesterName: req.requesterName ?? undefined,
            })
            const stageChip = st === 'pending_sales' ? <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">受注承認待ち</span>
              : st === 'pending_leader' ? <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">上長承認待ち</span>
              : st === 'approved' ? <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">承認済・返金待ち</span>
              : st === 'rejected' ? <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">却下</span>
              : <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-200">旧仕様（承認なし）</span>
            return (
              <div key={req.id} className="px-4 py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {stageChip}
                    <div className="text-[13px]"><Link href={`/cases/${req.case_id}`} className="font-mono text-brand-700 hover:underline">{req.caseNumber}</Link> <span className="text-gray-800">{req.dealName}</span> ・ <span className="font-mono">{yen(req.refund_amount ?? 0)}</span></div>
                  </div>
                  <div className="text-[11px] text-rose-700 mt-0.5">{req.reason_category ?? '—'} ・ 手数料{feeBearerLabel(req.fee_bearer)}{req.request_note ? ` ・ ${req.request_note}` : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  {canApprove && (
                    <button type="button" onClick={openDecide} className="px-3 py-1 text-[11px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700">承認</button>
                  )}
                  {st === 'approved' && canReconcile && (
                    <button type="button" disabled={busy === req.id} onClick={() => confirmRefund(req)} className="px-3 py-1 text-[11px] font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 disabled:opacity-40">OK（返金確定）</button>
                  )}
                  {st === 'approved' && !canReconcile && <span className="text-[11px] text-gray-400">経理の返金待ち</span>}
                  {(st === 'pending_sales' || st === 'pending_leader') && !canApprove && <span className="text-[11px] text-gray-400">承認待ち</span>}
                  {/* 旧仕様（approval_status なし）は従来どおり経理が返金 */}
                  {!st && canReconcile && (
                    <button type="button" disabled={busy === req.id} onClick={() => confirmRefund(req)} className="px-3 py-1 text-[11px] font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 disabled:opacity-40">OK（返金確定）</button>
                  )}
                </div>
              </div>
            )
          })
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

      {/* 返金承認モーダル（1次/2次承認者用） */}
      <RefundDecideModal isOpen={!!decideTarget} onClose={() => setDecideTarget(null)} request={decideTarget} currentMemberId={currentMemberId} onDecided={onChanged} />
    </div>
  )
}
