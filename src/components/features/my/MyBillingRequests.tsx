'use client'

// 受注/管理のマイページ：届いた「確認依頼」に回答＋自分の入金済請求から「返金依頼」を起票。
import { useState } from 'react'
import { HelpCircle, ArrowBigLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import RespondBillingRequestModal, { type ConfirmRequestLite } from '@/components/features/billing/RespondBillingRequestModal'
import BillingRequestModal, { type RequestInvoice } from '@/components/features/billing/BillingRequestModal'

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`

export default function MyBillingRequests({ confirmRequests, refundableInvoices, currentMemberId }: {
  confirmRequests: ConfirmRequestLite[]
  refundableInvoices: RequestInvoice[]
  currentMemberId: string | null
}) {
  const router = useRouter()
  const [respondTo, setRespondTo] = useState<ConfirmRequestLite | null>(null)
  const [refundTarget, setRefundTarget] = useState<RequestInvoice | null>(null)
  const [showRefund, setShowRefund] = useState(false)

  if (confirmRequests.length === 0 && refundableInvoices.length === 0) return null

  return (
    <div className="space-y-3">
      {confirmRequests.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40">
          <div className="px-3.5 py-2 border-b border-amber-100 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-amber-600" />
            <span className="text-[12.5px] font-semibold text-amber-800">経理からの確認依頼（あなた宛）</span>
            <span className="text-[11px] text-amber-600">{confirmRequests.length}件</span>
          </div>
          <div className="divide-y divide-amber-100">
            {confirmRequests.map(req => (
              <div key={req.id} className="px-3.5 py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center">
                <div className="min-w-0">
                  <div className="text-[13px]"><span className="font-mono text-brand-700">{req.caseNumber}</span> {req.dealName}</div>
                  <div className="text-[11px] text-gray-600 truncate">経理より：{req.request_note || '—'}</div>
                </div>
                <button type="button" onClick={() => setRespondTo(req)} className="px-3 py-1 text-[11px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700">回答する</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {refundableInvoices.length > 0 && (
        <div className="rounded-lg border border-gray-200">
          <button type="button" onClick={() => setShowRefund(s => !s)} className="w-full px-3.5 py-2 flex items-center gap-2 text-left">
            <ArrowBigLeft className="w-4 h-4 text-rose-500" />
            <span className="text-[12.5px] font-semibold text-gray-700">返金を依頼する（前受金が想定を上回った・解約 等）</span>
            <span className="ml-auto text-[11px] text-gray-400">{refundableInvoices.length}件の入金済請求</span>
          </button>
          {showRefund && (
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {refundableInvoices.map(inv => (
                <div key={inv.id} className="px-3.5 py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center">
                  <div className="min-w-0 text-[13px]"><span className="font-mono text-brand-700">{inv.cases?.case_number}</span> {inv.cases?.deal_name} ・ {yen(inv.amount)}</div>
                  <button type="button" onClick={() => setRefundTarget(inv)} className="px-3 py-1 text-[11px] font-semibold text-rose-700 border border-rose-200 bg-rose-50 rounded-md hover:bg-rose-100">返金依頼</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {respondTo && <RespondBillingRequestModal isOpen request={respondTo} onClose={() => setRespondTo(null)} onSaved={() => { setRespondTo(null); router.refresh() }} />}
      {refundTarget && <BillingRequestModal isOpen mode="refund" invoice={refundTarget} currentMemberId={currentMemberId} onClose={() => setRefundTarget(null)} onSaved={() => { setRefundTarget(null); router.refresh() }} />}
    </div>
  )
}
