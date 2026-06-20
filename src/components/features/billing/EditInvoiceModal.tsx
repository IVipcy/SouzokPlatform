'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import type { InvoiceRow, InvoiceStatus } from '@/types'

// 入金済はドロップダウンから設定させない（入金消込／CSV突合で payments を伴って確定する）
const EDITABLE_STATUS_OPTIONS: InvoiceStatus[] = ['作成済', '入金待ち']

type Props = {
  isOpen: boolean
  onClose: () => void
  invoice: InvoiceRow | null
  onSaved: () => void
}

export default function EditInvoiceModal({ isOpen, onClose, invoice, onSaved }: Props) {
  const [form, setForm] = useState({
    invoice_type: '確定請求' as '前受金' | '確定請求',
    fee_amount: '',
    expenses_amount: '',
    status: '作成済' as InvoiceStatus,
    issued_date: '',
    due_date: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // モーダルを開いた／対象請求が変わったらフォームを初期化（render中の状態調整＝Reactの推奨パターン）
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const activeKey = isOpen && invoice ? invoice.id : null
  if (activeKey !== loadedKey) {
    setLoadedKey(activeKey)
    if (activeKey && invoice) {
      setForm({
        invoice_type: invoice.invoice_type,
        fee_amount: String(invoice.fee_amount ?? 0),
        expenses_amount: String(invoice.expenses_amount ?? 0),
        status: invoice.status,
        issued_date: invoice.issued_date ?? '',
        due_date: invoice.due_date ?? '',
        notes: invoice.notes ?? '',
      })
      setError('')
    }
  }

  if (!invoice) return null

  // 金額・種別は「作成済」のうちだけ編集可。入金待ち/入金済になったらロック（直すなら削除→再発行）
  const moneyLocked = invoice.status !== '作成済' && invoice.status !== '未請求'
  const isPaid = invoice.status === '入金済'

  const feeNum = Number(form.fee_amount) || 0
  const expensesNum = Number(form.expenses_amount) || 0
  const totalAmount = feeNum + expensesNum

  const handleSave = async () => {
    if (totalAmount <= 0) { setError('請求総額が0円です'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { error: updErr } = await supabase
      .from('invoices')
      .update({
        invoice_type: form.invoice_type,
        amount: totalAmount,
        fee_amount: feeNum,
        expenses_amount: expensesNum,
        status: form.status,
        issued_date: form.issued_date || null,
        due_date: form.due_date || null,
        notes: form.notes || null,
      })
      .eq('id', invoice.id)
    if (updErr) {
      setError(`更新に失敗しました: ${updErr.message}`)
      setSaving(false)
      return
    }
    showToast('請求書を更新しました', 'success')
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="請求書を編集"
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {saving ? '保存中...' : '保存する'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {/* 請求種別 */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">請求種別</label>
          <div className="flex gap-2">
            {(['前受金', '確定請求'] as const).map(t => (
              <button
                key={t}
                onClick={() => setForm(p => ({ ...p, invoice_type: t }))}
                disabled={saving || moneyLocked}
                className={`flex-1 px-3 py-1.5 text-[13px] font-medium rounded-lg border disabled:opacity-60 disabled:cursor-not-allowed ${
                  form.invoice_type === t ? 'ring-2 ring-brand-400 ring-offset-1 border-brand-200 bg-brand-50 text-brand-700' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* ステータス */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">
            ステータス
            <span className="ml-2 text-[11px] font-normal text-gray-400">入金済は「入金消込」／CSV突合で確定（手動設定は不可）</span>
          </label>
          {isPaid ? (
            <div className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-gray-50 text-gray-500">
              入金済（入金消込で記録済み）
            </div>
          ) : (
            <select
              value={form.status === '入金済' ? '入金待ち' : form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value as InvoiceStatus }))}
              disabled={saving}
              className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:ring-1 focus:ring-brand-400 outline-none bg-white"
            >
              {EDITABLE_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>

        {/* 金額 */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-[12px] font-semibold text-gray-700">
            金額
          </div>
          <div className="divide-y divide-gray-100">
            <div className="px-3 py-2 flex items-center gap-2 bg-white">
              <span className="text-[13px] font-medium text-gray-700 flex-1">報酬</span>
              <div className="relative w-36">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">¥</span>
                <input
                  type="number"
                  min={0}
                  value={form.fee_amount}
                  onChange={e => setForm(p => ({ ...p, fee_amount: e.target.value }))}
                  disabled={saving || moneyLocked}
                  className="w-full pl-6 pr-2 py-1 text-[13px] font-mono text-right border border-gray-300 rounded focus:ring-1 focus:ring-brand-400 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
            </div>
            <div className="px-3 py-2 flex items-center gap-2 bg-white">
              <span className="text-[13px] font-medium text-gray-700 flex-1">立替実費</span>
              <div className="relative w-36">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">¥</span>
                <input
                  type="number"
                  min={0}
                  value={form.expenses_amount}
                  onChange={e => setForm(p => ({ ...p, expenses_amount: e.target.value }))}
                  disabled={saving || moneyLocked}
                  className="w-full pl-6 pr-2 py-1 text-[13px] font-mono text-right border border-gray-300 rounded focus:ring-1 focus:ring-brand-400 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
            </div>
            <div className="px-3 py-2.5 bg-brand-50 flex items-center gap-2">
              <span className="text-[13px] font-bold text-brand-800 flex-1">請求総額</span>
              <span className="text-[16px] font-extrabold font-mono text-brand-700 w-36 text-right">
                ¥{totalAmount.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="px-3 py-2 bg-amber-50 text-[11px] text-amber-700 border-t border-amber-100">
            {moneyLocked
              ? '※ 発行後（入金待ち／入金済）は金額・種別を変更できません。金額を直す場合は削除→再発行してください。'
              : '※ 立替実費の内訳変更は新規発行が必要です（一度作成した請求書の実費内訳は変更できません）。'}
          </div>
        </div>

        {/* 日付 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1">請求日</label>
            <input
              type="date"
              value={form.issued_date}
              onChange={e => setForm(p => ({ ...p, issued_date: e.target.value }))}
              disabled={saving}
              className="w-full px-3 py-1.5 text-[13px] font-mono border border-gray-300 rounded-lg focus:ring-1 focus:ring-brand-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1">支払期限</label>
            <input
              type="date"
              value={form.due_date}
              onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
              disabled={saving}
              className="w-full px-3 py-1.5 text-[13px] font-mono border border-gray-300 rounded-lg focus:ring-1 focus:ring-brand-400 outline-none"
            />
          </div>
        </div>

        {/* 備考 */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">備考</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            disabled={saving}
            rows={2}
            className="w-full px-3 py-1.5 text-[13px] border border-gray-300 rounded-lg focus:ring-1 focus:ring-brand-400 outline-none resize-y"
          />
        </div>
      </div>
    </Modal>
  )
}
