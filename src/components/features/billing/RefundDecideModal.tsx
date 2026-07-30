'use client'

// 返金承認モーダル（1次=受注担当・2次=上長）。承認済にする / 却下する のいずれか。
// 承認: pending_sales→pending_leader（上長へ通知）／pending_leader→approved（起票者+経理へ通知）
// 却下: approval_status='rejected' に確定＋起票者へ通知。返金は不可のまま。

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { feeBearerLabel } from '@/lib/billingRequests'

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`

export type RefundDecideRequest = {
  id: string
  case_id: string
  invoice_id: string
  requester_id: string | null
  request_note: string | null
  reason_category: string | null
  fee_bearer: string | null
  refund_amount: number | null
  requested_date: string
  approval_status: 'pending_sales' | 'pending_leader' | 'approved' | 'rejected' | null
  sales_approver_id: string | null
  leader_approver_id: string | null
  caseNumber?: string
  dealName?: string
  requesterName?: string
}

export default function RefundDecideModal({ isOpen, onClose, request, currentMemberId, onDecided }: {
  isOpen: boolean
  onClose: () => void
  request: RefundDecideRequest | null
  currentMemberId: string | null
  onDecided: () => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)

  if (!request) return null

  const status = request.approval_status
  const isSalesStep = status === 'pending_sales' && request.sales_approver_id === currentMemberId
  const isLeaderStep = status === 'pending_leader' && request.leader_approver_id === currentMemberId
  const canAct = isSalesStep || isLeaderStep
  const stepLabel = isSalesStep ? '1次承認（受注担当）' : isLeaderStep ? '2次承認（上長）' : ''

  const approve = async () => {
    if (!canAct || !currentMemberId) return
    setBusy('approve')
    const supabase = createClient()
    const now = new Date().toISOString()

    if (isSalesStep) {
      // 1次承認：pending_sales → pending_leader。上長へ通知。
      const { error } = await supabase.from('payment_check_requests').update({
        sales_approved_at: now, approval_status: 'pending_leader',
      }).eq('id', request.id)
      if (error) { showToast(`承認に失敗: ${error.message}`, 'error'); setBusy(null); return }
      if (request.leader_approver_id) {
        await supabase.from('notifications').insert({
          member_id: request.leader_approver_id,
          type: 'refund_approval_request',
          case_id: request.case_id,
          title: '返金の最終承認をお願いします',
          body: `${request.caseNumber ?? ''} ${request.dealName ?? ''}：${yen(request.refund_amount ?? 0)}（${request.reason_category ?? '—'}）`,
        })
      }
      showToast('承認しました。上長に通知を送りました', 'success')
    } else if (isLeaderStep) {
      // 2次承認：pending_leader → approved。起票者＋経理へ通知。返金確定可に。
      const { error } = await supabase.from('payment_check_requests').update({
        leader_approved_at: now, approval_status: 'approved',
      }).eq('id', request.id)
      if (error) { showToast(`承認に失敗: ${error.message}`, 'error'); setBusy(null); return }
      const notifs: Array<Record<string, unknown>> = []
      if (request.requester_id) notifs.push({
        member_id: request.requester_id,
        type: 'refund_approved',
        case_id: request.case_id,
        title: '返金が最終承認されました',
        body: `${request.caseNumber ?? ''} ${request.dealName ?? ''}：${yen(request.refund_amount ?? 0)}。経理が返金を実行します`,
      })
      const { data: accountings } = await supabase.from('members').select('id').eq('primary_role', 'accounting').eq('is_active', true)
      for (const m of ((accountings ?? []) as Array<{ id: string }>)) {
        notifs.push({
          member_id: m.id,
          type: 'refund_approved',
          case_id: request.case_id,
          title: '返金の承認が完了しました（返金実行してください）',
          body: `${request.caseNumber ?? ''} ${request.dealName ?? ''}：${yen(request.refund_amount ?? 0)}（${request.reason_category ?? '—'}）`,
        })
      }
      if (notifs.length > 0) await supabase.from('notifications').insert(notifs)
      showToast('最終承認しました。経理に返金依頼が届きました', 'success')
    }
    setBusy(null)
    onDecided(); onClose()
  }

  const reject = async () => {
    if (!canAct || !currentMemberId) return
    if (!note.trim()) { showToast('却下理由を入力してください', 'error'); return }
    setBusy('reject')
    const supabase = createClient()
    const patch: Record<string, unknown> = { approval_status: 'rejected', status: '完了' }
    if (isSalesStep) patch.sales_reject_note = note.trim()
    if (isLeaderStep) patch.leader_reject_note = note.trim()
    const { error } = await supabase.from('payment_check_requests').update(patch).eq('id', request.id)
    if (error) { showToast(`却下に失敗: ${error.message}`, 'error'); setBusy(null); return }
    if (request.requester_id) {
      await supabase.from('notifications').insert({
        member_id: request.requester_id,
        type: 'refund_rejected',
        case_id: request.case_id,
        title: `返金依頼が却下されました（${isSalesStep ? '受注担当' : '上長'}）`,
        body: `${request.caseNumber ?? ''} ${request.dealName ?? ''}：${note.trim()}`,
      })
    }
    setBusy(null)
    showToast('却下しました。起票者に通知を送りました', 'success')
    onDecided(); onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="返金承認"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={!!busy}>閉じる</Button>
          {canAct && (
            <>
              <Button variant="secondary" onClick={reject} loading={busy === 'reject'} leftIcon={<X className="w-3.5 h-3.5" strokeWidth={2.25} />}>却下</Button>
              <Button variant="primary" onClick={approve} loading={busy === 'approve'} leftIcon={<Check className="w-3.5 h-3.5" strokeWidth={2.25} />}>{isLeaderStep ? '最終承認' : '承認'}</Button>
            </>
          )}
        </>
      }>
      <div className="space-y-3">
        <div className="rounded-lg border border-brand-100 bg-brand-50/50 px-3.5 py-2.5">
          <div className="text-[12px] text-brand-800 font-semibold">{stepLabel || 'あなたは承認者ではありません'}</div>
          {status === 'approved' && <div className="text-[11px] text-emerald-700 mt-0.5">承認完了・経理が返金を実行します</div>}
          {status === 'rejected' && <div className="text-[11px] text-rose-700 mt-0.5">却下されました</div>}
        </div>
        <div className="grid grid-cols-[100px_1fr] gap-1.5 text-[13px]">
          <span className="text-gray-500">案件</span><span className="font-mono text-brand-700">{request.caseNumber} <span className="text-gray-800 font-sans">{request.dealName}</span></span>
          <span className="text-gray-500">申請者</span><span>{request.requesterName ?? '—'}</span>
          <span className="text-gray-500">申請日</span><span className="font-mono">{request.requested_date}</span>
          <span className="text-gray-500">返金金額</span><span className="font-mono font-semibold text-rose-700">{yen(request.refund_amount ?? 0)}</span>
          <span className="text-gray-500">理由</span><span>{request.reason_category ?? '—'} ／ 手数料{feeBearerLabel(request.fee_bearer)}</span>
          <span className="text-gray-500">補足</span><span className="whitespace-pre-wrap">{request.request_note ?? '—'}</span>
        </div>
        {canAct && (
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">却下する場合の理由（承認時は不要）</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="例：金額が誤っている・返金理由が不明確 など" className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-brand-400 resize-none" />
          </div>
        )}
      </div>
    </Modal>
  )
}
