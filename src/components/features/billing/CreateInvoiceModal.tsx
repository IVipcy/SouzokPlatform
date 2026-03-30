'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'

type CaseOption = { id: string; case_number: string; deal_name: string }

type Props = {
  isOpen: boolean
  onClose: () => void
  cases: CaseOption[]
  onSaved: () => void
}

export default function CreateInvoiceModal({ isOpen, onClose, cases, onSaved }: Props) {
  const [form, setForm] = useState({
    case_id: '',
    invoice_type: '前受金' as '前受金' | '確定請求',
    amount: '',
    issued_date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!form.case_id) { setError('案件を選択してください'); return }
    if (!form.amount || Number(form.amount) <= 0) { setError('金額を入力してください'); return }

    setSaving(true)
    setError('')
    const supabase = createClient()

    const status = form.invoice_type === '前受金' ? '前受金請求済' : '確定請求済'

    const { error: insertErr } = await supabase.from('invoices').insert({
      case_id: form.case_id,
      invoice_type: form.invoice_type,
      amount: Number(form.amount),
      status,
      issued_date: form.issued_date || null,
      due_date: form.due_date || null,
      notes: form.notes || null,
    })

    if (insertErr) {
      setError(`作成に失敗しました: ${insertErr.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    setForm({ case_id: '', invoice_type: '前受金', amount: '', issued_date: new Date().toISOString().split('T')[0], due_date: '', notes: '' })
    onSaved()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="＋ 請求書発行"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? '作成中...' : '発行する'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {/* Case */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">案件 *</label>
          <select
            value={form.case_id}
            onChange={e => setForm(p => ({ ...p, case_id: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">選択してください</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.case_number} {c.deal_name}</option>)}
          </select>
        </div>

        {/* Invoice type */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">請求種別</label>
          <div className="flex gap-2">
            {(['前受金', '確定請求'] as const).map(t => (
              <button
                key={t}
                onClick={() => setForm(p => ({ ...p, invoice_type: t }))}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  form.invoice_type === t ? 'ring-2 ring-blue-400 ring-offset-1 border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">金額（税込） *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">¥</span>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              placeholder="0"
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Issued date */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">請求日</label>
            <input
              type="date"
              value={form.issued_date}
              onChange={e => setForm(p => ({ ...p, issued_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          {/* Due date */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">支払期限</label>
            <input
              type="date"
              value={form.due_date}
              onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">備考</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
          />
        </div>
      </div>
    </Modal>
  )
}
