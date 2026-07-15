'use client'

// 請求から「確認依頼（経理→受注/管理）」または「返金依頼（受注/管理→経理）」を作成する。
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { REFUND_REASONS, FEE_BEARERS } from '@/lib/billingRequests'

export type RequestInvoice = {
  id: string
  case_id: string
  amount: number
  review_reason?: string | null   // 確認依頼の初期文（AI想定）
  cases?: { case_number?: string | null; deal_name?: string | null; case_members?: Array<{ role: string; member_id: string }> | null } | null
  payments?: Array<{ amount: number; is_refund: boolean }> | null
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`
const today = () => new Date().toISOString().slice(0, 10)

export default function BillingRequestModal({ isOpen, onClose, defaultMode, invoice, currentMemberId, onSaved }: {
  isOpen: boolean
  onClose: () => void
  defaultMode: 'confirm' | 'refund'
  invoice: RequestInvoice
  currentMemberId: string | null
  onSaved: () => void
}) {
  const netHeld = (invoice.payments ?? []).reduce((s, p) => s + p.amount, 0)  // 手元残（返金可能額の目安）
  const [mode, setMode] = useState<'confirm' | 'refund'>(defaultMode)
  const [note, setNote] = useState(defaultMode === 'confirm' ? (invoice.review_reason ?? '') : '')
  const [reason, setReason] = useState<string>(REFUND_REASONS[1])
  const [feeBearer, setFeeBearer] = useState<string>('customer')
  const [amount, setAmount] = useState<string>(defaultMode === 'refund' && netHeld > 0 ? String(netHeld) : '')
  const [saving, setSaving] = useState(false)
  // 種類切替時、確認依頼ならAI想定文を初期表示
  const switchMode = (m: 'confirm' | 'refund') => { setMode(m); if (m === 'confirm' && !note) setNote(invoice.review_reason ?? '') }

  const caseNo = invoice.cases?.case_number ?? ''
  const dealName = invoice.cases?.deal_name ?? ''
  const members = invoice.cases?.case_members ?? []

  const submit = async () => {
    if (!note.trim()) { showToast(mode === 'confirm' ? '確認してほしい内容を入力してください' : '返金の理由・要望を入力してください', 'error'); return }
    if (mode === 'refund' && (!amount || Number(amount) <= 0)) { showToast('返金額を入力してください', 'error'); return }
    setSaving(true)
    const supabase = createClient()

    // 通知先：確認依頼＝案件の受注＋管理担当／返金依頼＝経理（accounting）全員
    let recipients: string[] = []
    if (mode === 'confirm') {
      recipients = [...new Set(members.filter(m => m.role === 'sales' || m.role === 'manager').map(m => m.member_id))]
    } else {
      const { data } = await supabase.from('members').select('id').eq('primary_role', 'accounting')
      recipients = ((data ?? []) as Array<{ id: string }>).map(m => m.id)
    }
    const primaryConfirmer = mode === 'confirm'
      ? (members.find(m => m.role === 'manager')?.member_id ?? members.find(m => m.role === 'sales')?.member_id ?? null)
      : null

    const { error } = await supabase.from('payment_check_requests').insert({
      invoice_id: invoice.id, case_id: invoice.case_id, requester_id: currentMemberId, confirmer_id: primaryConfirmer,
      kind: mode, status: '依頼中', requested_date: today(), request_note: note.trim(),
      ...(mode === 'refund' ? { reason_category: reason, fee_bearer: feeBearer, refund_amount: Number(amount) } : {}),
    })
    if (error) { showToast(`依頼に失敗: ${error.message}`, 'error'); setSaving(false); return }

    if (recipients.length > 0) {
      await supabase.from('notifications').insert(recipients.map(mid => ({
        member_id: mid,
        type: mode === 'confirm' ? 'billing_confirm_request' : 'billing_refund_request',
        case_id: invoice.case_id,
        title: mode === 'confirm' ? '入金の確認依頼' : '返金依頼',
        body: mode === 'confirm'
          ? `${caseNo} ${dealName} の入金について確認依頼が届きました：「${note.trim()}」`
          : `${caseNo} ${dealName} の返金依頼（${yen(Number(amount))}・${reason}）が届きました。`,
      })))
    }
    setSaving(false)
    showToast(mode === 'confirm' ? '確認依頼を送りました（受注・管理担当へ通知）' : '返金依頼を送りました（経理へ通知）', 'success')
    onSaved(); onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="依頼" maxWidth="max-w-lg"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
        <Button variant="primary" onClick={submit} loading={saving}>{mode === 'confirm' ? '確認依頼を送る' : '経理へ返金依頼'}</Button>
      </>}>
      <div className="space-y-3">
        {/* 種類を選択（確認依頼＝経理→受注/管理 ／ 返金依頼＝受注/管理→経理） */}
        <div className="inline-flex border border-gray-300 rounded-md overflow-hidden">
          <button type="button" onClick={() => switchMode('confirm')} className={`px-4 py-1.5 text-[12.5px] font-semibold ${mode === 'confirm' ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50'}`}>確認依頼</button>
          <button type="button" onClick={() => switchMode('refund')} className={`px-4 py-1.5 text-[12.5px] font-semibold border-l border-gray-200 ${mode === 'refund' ? 'bg-rose-50 text-rose-700' : 'text-gray-500 hover:bg-gray-50'}`}>返金依頼</button>
        </div>
        <div className="text-[12px] text-gray-500"><span className="font-mono text-brand-700">{caseNo}</span> {dealName}・請求 {yen(invoice.amount)}{netHeld > 0 ? `・入金 ${yen(netHeld)}` : ''}</div>

        {mode === 'refund' && (
          <>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">返金理由</label>
              <select value={reason} onChange={e => setReason(e.target.value)} className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-brand-400 bg-white">
                {REFUND_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">手数料負担</label>
                <div className="inline-flex border border-gray-300 rounded-md overflow-hidden">
                  {FEE_BEARERS.map((f, i) => (
                    <button key={f.value} type="button" onClick={() => setFeeBearer(f.value)}
                      className={`px-3.5 py-1.5 text-[12.5px] ${i > 0 ? 'border-l border-gray-200' : ''} ${feeBearer === f.value ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-500'}`}>{f.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">返金額</label>
                <input type="text" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] text-right font-mono outline-none focus:border-brand-400" />
              </div>
            </div>
          </>
        )}

        <div>
          <label className="block text-[11px] text-gray-500 mb-1">{mode === 'confirm' ? '確認してほしい内容' : '補足（理由・要望）'}</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder={mode === 'confirm' ? '例：入金が¥5,000多い。立替込みで請求済みか確認してください。' : '例：確定報酬が前受金を下回ったため差額を返金希望。'}
            className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-brand-400 resize-none" />
        </div>
      </div>
    </Modal>
  )
}
