'use client'

// 受注/管理が「確認依頼（過入金など）」に判定＋コメントで回答する。
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { RESOLUTIONS } from '@/lib/billingRequests'

export type ConfirmRequestLite = {
  id: string
  case_id: string
  requester_id: string | null
  request_note: string | null
  caseNumber: string
  dealName: string
}

const today = () => new Date().toISOString().slice(0, 10)

export default function RespondBillingRequestModal({ isOpen, onClose, request, onSaved }: {
  isOpen: boolean
  onClose: () => void
  request: ConfirmRequestLite
  onSaved: () => void
}) {
  const [resolution, setResolution] = useState<string>('confirm_ok')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('payment_check_requests')
      .update({ status: '回答済', resolution, result_note: note.trim() || null, confirmed_date: today() })
      .eq('id', request.id)
    if (error) { showToast(`回答に失敗: ${error.message}`, 'error'); setSaving(false); return }
    if (request.requester_id) {
      const label = RESOLUTIONS.find(r => r.value === resolution)?.label ?? ''
      await supabase.from('notifications').insert({
        member_id: request.requester_id, type: 'billing_confirm_answered', case_id: request.case_id,
        title: '確認依頼に回答がありました', body: `${request.caseNumber} ${request.dealName}：判定「${label}」／${note.trim() || '（コメントなし）'}`,
      })
    }
    setSaving(false)
    showToast('回答しました（経理へ通知）', 'success')
    onSaved(); onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="確認依頼に回答" maxWidth="max-w-lg"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
        <Button variant="primary" onClick={submit} loading={saving}>回答する</Button>
      </>}>
      <div className="space-y-3">
        <div className="text-[12px] text-gray-500"><span className="font-mono text-brand-700">{request.caseNumber}</span> {request.dealName}</div>
        <div className="text-[12.5px] text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">経理より：{request.request_note || '（内容なし）'}</div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">判定</label>
          <div className="flex gap-1.5 flex-wrap">
            {RESOLUTIONS.map(r => (
              <button key={r.value} type="button" onClick={() => setResolution(r.value)}
                className={`px-3 py-1.5 text-[12.5px] rounded-md border ${resolution === r.value ? `${r.cls} font-semibold ring-2 ring-brand-100` : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'}`}>{r.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">コメント</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="例：立替込みで請求済みなので過入金。返金してください。"
            className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-brand-400 resize-none" />
        </div>
      </div>
    </Modal>
  )
}
