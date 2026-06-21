'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { autoClosePaymentChecks } from '@/lib/paymentCheck'
import { ensureReceiptTask } from '@/lib/receiptTask'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { InvoiceRow, PaymentRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  invoice: InvoiceRow & { payments?: PaymentRow[] }
  onSaved: () => void
}

function fmt(n: number) {
  return '¥' + n.toLocaleString()
}

export default function RecordPaymentModal({ isOpen, onClose, invoice, onSaved }: Props) {
  const paidAmount = invoice.payments?.reduce((s, p) => s + p.amount, 0) ?? 0
  const remaining = invoice.amount - paidAmount

  const [form, setForm] = useState({
    amount: remaining > 0 ? String(remaining) : '',
    payment_date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!form.amount || Number(form.amount) <= 0) { setError('金額を入力してください'); return }
    if (!form.payment_date) { setError('入金日を入力してください'); return }

    setSaving(true)
    setError('')
    const supabase = createClient()

    const paymentAmount = Number(form.amount)

    // Insert payment
    const { error: insertErr } = await supabase.from('payments').insert({
      invoice_id: invoice.id,
      amount: paymentAmount,
      payment_date: form.payment_date,
      payment_method: '銀行振込',  // 入金は基本すべて銀行振込（手動消込の入金方法は固定）
      notes: form.notes || null,
    })

    if (insertErr) {
      setError(`入金記録に失敗しました: ${insertErr.message}`)
      setSaving(false)
      return
    }

    // Update invoice status (migration 045 でステータスは 4 種類に統一)
    const newPaidTotal = paidAmount + paymentAmount
    let newStatus: string
    if (newPaidTotal >= invoice.amount) {
      newStatus = '入金済'
    } else {
      newStatus = '入金待ち'  // 一部入金 / 未入金は「入金待ち」に集約
    }

    await supabase.from('invoices').update({ status: newStatus }).eq('id', invoice.id)

    // 入金確定したら、開いている入金状況確認依頼を自動でクローズ
    if (newStatus === '入金済') { await autoClosePaymentChecks(invoice.id); await ensureReceiptTask(invoice.id) }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="入金消込"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" onClick={handleSubmit} loading={saving}>
            {saving ? '記録中...' : '入金を記録'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {/* Invoice summary */}
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500">請求金額</span>
            <span className="font-mono font-semibold">{fmt(invoice.amount)}</span>
          </div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500">入金済額</span>
            <span className="font-mono text-green-600">{fmt(paidAmount)}</span>
          </div>
          <div className="flex justify-between text-xs border-t border-gray-200 pt-1 mt-1">
            <span className="text-gray-500 font-semibold">残額</span>
            <span className={`font-mono font-semibold ${remaining > 0 ? 'text-red-500' : 'text-gray-400'}`}>{fmt(remaining)}</span>
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">入金額 *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">¥</span>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
        </div>

        {/* Payment date */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">入金日 *</label>
          <input
            type="date"
            value={form.payment_date}
            onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">備考</label>
          <input
            type="text"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="例：〇〇銀行より振込"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>
      </div>
    </Modal>
  )
}
