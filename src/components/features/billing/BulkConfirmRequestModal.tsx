'use client'

// 要確認フィルタで選んだ請求に、まとめて「確認依頼（経理→受注/管理）」を出す。
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { RequestInvoice } from './BillingRequestModal'

const today = () => new Date().toISOString().slice(0, 10)

export default function BulkConfirmRequestModal({ isOpen, onClose, invoices, currentMemberId, onSaved }: {
  isOpen: boolean
  onClose: () => void
  invoices: RequestInvoice[]
  currentMemberId: string | null
  onSaved: () => void
}) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!note.trim()) { showToast('確認してほしい内容を入力してください', 'error'); return }
    if (invoices.length === 0) { showToast('対象の請求がありません', 'error'); return }
    setSaving(true)
    const supabase = createClient()
    for (const inv of invoices) {
      const members = inv.cases?.case_members ?? []
      const primaryConfirmer = members.find(m => m.role === 'manager')?.member_id ?? members.find(m => m.role === 'sales')?.member_id ?? null
      await supabase.from('payment_check_requests').insert({
        invoice_id: inv.id, case_id: inv.case_id, requester_id: currentMemberId, confirmer_id: primaryConfirmer,
        kind: 'confirm', status: '依頼中', requested_date: today(), request_note: note.trim(),
      })
      const recipients = [...new Set(members.filter(m => m.role === 'sales' || m.role === 'manager').map(m => m.member_id))]
      if (recipients.length > 0) {
        await supabase.from('notifications').insert(recipients.map(mid => ({
          member_id: mid, type: 'billing_confirm_request', case_id: inv.case_id, title: '入金の確認依頼',
          body: `${inv.cases?.case_number ?? ''} ${inv.cases?.deal_name ?? ''} の入金について確認依頼が届きました：「${note.trim()}」`,
        })))
      }
    }
    setSaving(false)
    showToast(`${invoices.length}件に確認依頼を送りました（受注・管理担当へ通知）`, 'success')
    onSaved(); onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`確認依頼（${invoices.length}件）`} maxWidth="max-w-lg"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
        <Button variant="primary" onClick={submit} loading={saving}>確認依頼を送る</Button>
      </>}>
      <div className="space-y-3">
        <div className="text-[12px] text-gray-500">選択した {invoices.length} 件の請求について、案件の受注・管理担当へ確認を依頼します。</div>
        <div className="max-h-32 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
          {invoices.map(inv => (
            <div key={inv.id} className="px-3 py-1.5 text-[12px]"><span className="font-mono text-brand-700">{inv.cases?.case_number}</span> {inv.cases?.deal_name} ・ ¥{Math.round(inv.amount).toLocaleString()}</div>
          ))}
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">確認してほしい内容</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="例：入金が¥5,000多い。立替込みで請求済みか確認してください。"
            className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-brand-400 resize-none" />
        </div>
      </div>
    </Modal>
  )
}
