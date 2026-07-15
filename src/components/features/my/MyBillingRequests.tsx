'use client'

// 受注/管理のマイページ：経理から届いた「確認依頼」に回答する（返金依頼の起点はここには置かない）。
import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import RespondBillingRequestModal, { type ConfirmRequestLite } from '@/components/features/billing/RespondBillingRequestModal'

export default function MyBillingRequests({ confirmRequests }: {
  confirmRequests: ConfirmRequestLite[]
}) {
  const router = useRouter()
  const [respondTo, setRespondTo] = useState<ConfirmRequestLite | null>(null)

  if (confirmRequests.length === 0) return null

  return (
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

      {respondTo && <RespondBillingRequestModal isOpen request={respondTo} onClose={() => setRespondTo(null)} onSaved={() => { setRespondTo(null); router.refresh() }} />}
    </div>
  )
}
