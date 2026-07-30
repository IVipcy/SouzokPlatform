'use client'

// 請求から「確認依頼（経理→受注/管理）」または「返金依頼（受注/管理→受注担当承認→上長承認→経理返金）」を作成する。
import { useState, useEffect, useMemo } from 'react'
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
  const [leaderApproverId, setLeaderApproverId] = useState<string>('')
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([])
  // 種類切替時、確認依頼ならAI想定文を初期表示
  const switchMode = (m: 'confirm' | 'refund') => { setMode(m); if (m === 'confirm' && !note) setNote(invoice.review_reason ?? '') }

  const caseNo = invoice.cases?.case_number ?? ''
  const dealName = invoice.cases?.deal_name ?? ''
  const members = invoice.cases?.case_members ?? []
  // 案件の受注担当（1次承認者・自動セット）
  const salesApproverId = useMemo(() => members.find(m => m.role === 'sales')?.member_id ?? null, [members])

  // 返金モーダルを開いたとき、自分と同じチームのメンバーを取得して 上長選択肢に。
  useEffect(() => {
    if (!isOpen || mode !== 'refund' || !currentMemberId) return
    let alive = true
    ;(async () => {
      const supabase = createClient()
      const { data: me } = await supabase.from('members').select('team_id').eq('id', currentMemberId).maybeSingle()
      const teamId = (me as { team_id?: string | null } | null)?.team_id ?? null
      if (!teamId) { if (alive) setTeamMembers([]); return }
      const { data } = await supabase.from('members').select('id, name').eq('team_id', teamId).eq('is_active', true).neq('id', currentMemberId).order('name')
      if (!alive) return
      // 受注担当（1次承認者）は上長候補から除外（同じ人を2回選ばせない）
      const list = ((data ?? []) as Array<{ id: string; name: string }>).filter(m => m.id !== salesApproverId)
      setTeamMembers(list)
      if (list.length > 0 && !leaderApproverId) setLeaderApproverId(list[0].id)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, currentMemberId, salesApproverId])

  const submit = async () => {
    if (!note.trim()) { showToast(mode === 'confirm' ? '確認してほしい内容を入力してください' : '返金の理由・要望を入力してください', 'error'); return }
    if (mode === 'refund' && (!amount || Number(amount) <= 0)) { showToast('返金額を入力してください', 'error'); return }
    if (mode === 'refund' && !salesApproverId) { showToast('この案件の受注担当が未アサインです。担当者タブで先にアサインしてください', 'error'); return }
    if (mode === 'refund' && !leaderApproverId) { showToast('上長（2次承認者）を選択してください', 'error'); return }
    setSaving(true)
    const supabase = createClient()

    // 通知先：確認依頼＝案件の受注＋管理担当／返金依頼＝1次承認者(受注担当)へ
    let recipients: string[] = []
    if (mode === 'confirm') {
      recipients = [...new Set(members.filter(m => m.role === 'sales' || m.role === 'manager').map(m => m.member_id))]
    } else if (salesApproverId) {
      recipients = [salesApproverId]
    }
    const primaryConfirmer = mode === 'confirm'
      ? (members.find(m => m.role === 'manager')?.member_id ?? members.find(m => m.role === 'sales')?.member_id ?? null)
      : null

    const refundExtras = mode === 'refund' ? {
      reason_category: reason, fee_bearer: feeBearer, refund_amount: Number(amount),
      sales_approver_id: salesApproverId, leader_approver_id: leaderApproverId,
      approval_status: 'pending_sales' as const,
    } : {}

    const { error } = await supabase.from('payment_check_requests').insert({
      invoice_id: invoice.id, case_id: invoice.case_id, requester_id: currentMemberId, confirmer_id: primaryConfirmer,
      kind: mode, status: '依頼中', requested_date: today(), request_note: note.trim(),
      ...refundExtras,
    })
    if (error) { showToast(`依頼に失敗: ${error.message}`, 'error'); setSaving(false); return }

    if (recipients.length > 0) {
      await supabase.from('notifications').insert(recipients.map(mid => ({
        member_id: mid,
        type: mode === 'confirm' ? 'billing_confirm_request' : 'refund_approval_request',
        case_id: invoice.case_id,
        title: mode === 'confirm' ? '入金の確認依頼' : '返金承認の依頼が届きました',
        body: mode === 'confirm'
          ? `${caseNo} ${dealName} の入金について確認依頼が届きました：「${note.trim()}」`
          : `${caseNo} ${dealName}：返金 ${yen(Number(amount))}（${reason}）の1次承認をお願いします`,
      })))
    }
    setSaving(false)
    showToast(mode === 'confirm' ? '確認依頼を送りました（受注・管理担当へ通知）' : '返金承認の依頼を送りました（受注担当へ通知）', 'success')
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
            {/* 承認フロー：①受注担当（自動セット・変更不可）→②上長（同じチームから選択）→経理返金 */}
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-2.5">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">1次承認：受注担当（自動）</label>
                <div className="w-full px-2.5 py-1.5 text-[13px] rounded-md bg-gray-50 border border-gray-200 text-gray-700">
                  {salesApproverId ? '案件の受注担当' : <span className="text-rose-600">受注担当が未アサイン</span>}
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">2次承認：上長（同チームから選択）</label>
                <select value={leaderApproverId} onChange={e => setLeaderApproverId(e.target.value)} className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-brand-400 bg-white">
                  {teamMembers.length === 0 && <option value="">同チームメンバーなし</option>}
                  {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
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
