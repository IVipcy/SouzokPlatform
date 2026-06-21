'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { InvoiceRow, PaymentRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  invoice: InvoiceRow & { payments?: PaymentRow[] }
  onSaved: () => void
}

const REFUND_METHODS = ['振込', '現金書留', '手渡し', '現金'] as const

function fmt(n: number) {
  return '¥' + n.toLocaleString()
}

/**
 * 返金を「マイナスの入金」として記録するモーダル。
 * 金額は最終返金額を手入力（自動計算なし）。内訳・理由はメモに残す。1請求に複数回の返金も可。
 * 元の請求額・入金実績は書き換えず、ステータスも入金済のまま（返金は列＋バッジで表現）。
 */
export default function RefundModal({ isOpen, onClose, invoice, onSaved }: Props) {
  const payments = invoice.payments ?? []
  const grossPaid = payments.filter(p => !p.is_refund).reduce((s, p) => s + p.amount, 0)
  const refunded = payments.filter(p => p.is_refund).reduce((s, p) => s - p.amount, 0)  // 既返金（正の額）
  const netHeld = grossPaid - refunded  // 返金可能な手元残

  const [form, setForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    method: '振込' as string,
    reason: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    const amt = Number(form.amount)
    if (!form.amount || amt <= 0) { setError('返金額を入力してください'); return }
    if (!form.payment_date) { setError('返金日を入力してください'); return }
    if (!form.reason.trim()) { setError('返金理由を入力してください'); return }

    setSaving(true)
    setError('')
    const supabase = createClient()

    // 返金＝マイナスの入金。理由は match_note に残す。請求のステータスは変更しない（入金済のまま）。
    const { error: insertErr } = await supabase.from('payments').insert({
      invoice_id: invoice.id,
      amount: -amt,
      payment_date: form.payment_date,
      payment_method: form.method,
      is_refund: true,
      matched_by: 'human',
      match_note: form.reason.trim(),
      notes: form.reason.trim(),
    })

    if (insertErr) {
      setError(`返金記録に失敗しました: ${insertErr.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="返金を記録"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" onClick={handleSubmit} loading={saving}>
            {saving ? '記録中...' : '返金を記録'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {/* 請求サマリー */}
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500">請求金額</span>
            <span className="font-mono font-semibold">{fmt(invoice.amount)}</span>
          </div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500">入金額</span>
            <span className="font-mono text-green-600">{fmt(grossPaid)}</span>
          </div>
          {refunded > 0 && (
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">既返金</span>
              <span className="font-mono text-rose-600">−{fmt(refunded)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs border-t border-gray-200 pt-1 mt-1">
            <span className="text-gray-500 font-semibold">手元残（返金可能）</span>
            <span className="font-mono font-semibold text-gray-700">{fmt(netHeld)}</span>
          </div>
        </div>

        {/* 返金額 */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">返金額 *（手数料控除後の実額）</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">¥</span>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              placeholder="例: 69070"
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* 返金日 */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-500 mb-1">返金日 *</label>
            <input
              type="date"
              value={form.payment_date}
              onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
          {/* 返金方法 */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-500 mb-1">返金方法</label>
            <select
              value={form.method}
              onChange={e => setForm(p => ({ ...p, method: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            >
              {REFUND_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* 理由（内訳） */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">返金理由・内訳 *</label>
          <textarea
            value={form.reason}
            onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
            rows={3}
            placeholder="例：解約のため、前受金870,000円から報酬702,900円・実費98,030円を差引し、振込手数料を引いた69,070円を返金"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-y"
          />
        </div>

        <p className="text-[11px] text-gray-400">
          返金はマイナスの入金として記録されます（請求額・入金実績は保持）。複数回に分けて返す場合は、その都度この操作で記録してください。
        </p>
      </div>
    </Modal>
  )
}
