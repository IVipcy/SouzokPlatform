'use client'

import { useState, useEffect } from 'react'
import { Loader2, Receipt } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { ExpenseRow } from '@/types'

type CaseOption = { id: string; case_number: string; deal_name: string }

type Props = {
  isOpen: boolean
  onClose: () => void
  cases: CaseOption[]
  onSaved: () => void
  /** デフォルトで選択する案件ID（/billing?case=xxx の時など） */
  defaultCaseId?: string
}

type CaseFees = {
  fee_administrative: number | null
  fee_judicial: number | null
  fee_total: number | null
  advance_payment: number | null
}

export default function CreateInvoiceModal({ isOpen, onClose, cases, onSaved, defaultCaseId }: Props) {
  const [form, setForm] = useState({
    case_id: defaultCaseId ?? '',
    invoice_type: '確定請求' as '前受金' | '確定請求',
    fee_amount: '',
    issued_date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: '',
  })
  // 選択した案件の未請求立替実費
  const [unbilledExpenses, setUnbilledExpenses] = useState<ExpenseRow[]>([])
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set())
  const [caseFees, setCaseFees] = useState<CaseFees | null>(null)
  const [loadingCase, setLoadingCase] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // モーダル開時にリセット
  useEffect(() => {
    if (isOpen) {
      setForm({
        case_id: defaultCaseId ?? '',
        invoice_type: '確定請求',
        fee_amount: '',
        issued_date: new Date().toISOString().split('T')[0],
        due_date: '',
        notes: '',
      })
      setError('')
      setUnbilledExpenses([])
      setSelectedExpenseIds(new Set())
      setCaseFees(null)
    }
  }, [isOpen, defaultCaseId])

  // 案件選択時に報酬+未請求実費を取得
  useEffect(() => {
    if (!form.case_id) {
      setCaseFees(null)
      setUnbilledExpenses([])
      setSelectedExpenseIds(new Set())
      return
    }
    let cancelled = false
    const fetch = async () => {
      setLoadingCase(true)
      const supabase = createClient()
      const [{ data: caseRow }, { data: expRows }] = await Promise.all([
        supabase.from('cases').select('fee_administrative,fee_judicial,fee_total,advance_payment').eq('id', form.case_id).single(),
        supabase.from('expenses').select('*').eq('case_id', form.case_id).is('billed_invoice_id', null).order('expense_date', { nullsFirst: false }),
      ])
      if (cancelled) return
      const fees = caseRow as CaseFees | null
      setCaseFees(fees)
      // form.fee_amount が空なら自動セット（編集中の値は尊重）
      setForm(prev => prev.fee_amount === ''
        ? { ...prev, fee_amount: String(fees?.fee_total ?? ((fees?.fee_administrative ?? 0) + (fees?.fee_judicial ?? 0)) ?? 0) }
        : prev
      )
      const exps = (expRows ?? []) as ExpenseRow[]
      setUnbilledExpenses(exps)
      // 全件チェック既定
      setSelectedExpenseIds(new Set(exps.map(e => e.id)))
      setLoadingCase(false)
    }
    fetch()
    return () => { cancelled = true }
  }, [form.case_id])

  const feeAmountNum = Number(form.fee_amount) || 0
  const selectedExpensesTotal = unbilledExpenses
    .filter(e => selectedExpenseIds.has(e.id))
    .reduce((s, e) => s + (e.amount ?? 0), 0)
  const totalAmount = feeAmountNum + selectedExpensesTotal

  const toggleExpense = (id: string) => {
    setSelectedExpenseIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectAll = () => setSelectedExpenseIds(new Set(unbilledExpenses.map(e => e.id)))
  const deselectAll = () => setSelectedExpenseIds(new Set())

  const handleSubmit = async () => {
    if (!form.case_id) { setError('案件を選択してください'); return }
    if (totalAmount <= 0) { setError('請求総額が0円です'); return }

    setSaving(true)
    setError('')
    const supabase = createClient()
    const status = form.invoice_type === '前受金' ? '前受金請求済' : '確定請求済'

    const { data: newInvoice, error: insertErr } = await supabase
      .from('invoices')
      .insert({
        case_id: form.case_id,
        invoice_type: form.invoice_type,
        amount: totalAmount,
        fee_amount: feeAmountNum,
        expenses_amount: selectedExpensesTotal,
        status,
        issued_date: form.issued_date || null,
        due_date: form.due_date || null,
        notes: form.notes || null,
      })
      .select('id')
      .single()

    if (insertErr || !newInvoice) {
      setError(`作成に失敗しました: ${insertErr?.message ?? '不明なエラー'}`)
      setSaving(false)
      return
    }

    // 選択した立替実費に billed_invoice_id をセット（請求済みマーク）
    if (selectedExpenseIds.size > 0) {
      const { error: updErr } = await supabase
        .from('expenses')
        .update({ billed_invoice_id: newInvoice.id })
        .in('id', Array.from(selectedExpenseIds))
      if (updErr) {
        // 請求書は作成済みなので continue + warn
        console.error('expenses 更新失敗:', updErr)
        setError(`請求書は発行しましたが、立替実費の請求済み更新に失敗: ${updErr.message}`)
      }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="請求書発行"
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={handleSubmit} loading={saving} disabled={!form.case_id || totalAmount <= 0}>
            {saving ? '発行中...' : '発行する'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {/* Case */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">
            案件 <span className="text-red-400">*</span>
          </label>
          <select
            value={form.case_id}
            onChange={e => setForm(p => ({ ...p, case_id: e.target.value, fee_amount: '' }))}
            disabled={saving}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:ring-1 focus:ring-brand-400 focus:border-brand-400 outline-none bg-white"
          >
            <option value="">選択してください</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.case_number} {c.deal_name}</option>)}
          </select>
        </div>

        {/* Invoice type */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">請求種別</label>
          <div className="flex gap-2">
            {(['前受金', '確定請求'] as const).map(t => (
              <button
                key={t}
                onClick={() => setForm(p => ({ ...p, invoice_type: t }))}
                disabled={saving}
                className={`flex-1 px-3 py-1.5 text-[13px] font-medium rounded-lg border transition-colors ${
                  form.invoice_type === t ? 'ring-2 ring-brand-400 ring-offset-1 border-brand-200 bg-brand-50 text-brand-700' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* 報酬・立替実費の内訳 */}
        {form.case_id && (
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/40">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-[12px] font-semibold text-gray-700">
              請求内訳
            </div>

            {loadingCase ? (
              <div className="px-3 py-4 text-center text-[12px] text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin inline-block mr-1" />
                読み込み中…
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {/* 報酬 */}
                <div className="px-3 py-2.5 flex items-center gap-2 bg-white">
                  <span className="text-[13px] font-medium text-gray-700 flex-1">報酬</span>
                  <div className="relative w-36">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">¥</span>
                    <input
                      type="number"
                      min={0}
                      value={form.fee_amount}
                      onChange={e => setForm(p => ({ ...p, fee_amount: e.target.value }))}
                      disabled={saving}
                      placeholder="0"
                      className="w-full pl-6 pr-2 py-1 text-[13px] font-mono text-right border border-gray-300 rounded focus:ring-1 focus:ring-brand-400 outline-none"
                    />
                  </div>
                </div>

                {/* 立替実費 */}
                <div className="bg-white">
                  <div className="px-3 py-2 flex items-center gap-2 bg-gray-50/50">
                    <span className="text-[13px] font-medium text-gray-700 flex-1">
                      立替実費（未請求分）
                      <span className="ml-1.5 text-[11px] text-gray-400 font-normal">
                        {unbilledExpenses.length}件
                      </span>
                    </span>
                    {unbilledExpenses.length > 0 && (
                      <div className="flex gap-1 text-[11px]">
                        <button onClick={selectAll} disabled={saving} className="text-brand-600 hover:underline">全選択</button>
                        <span className="text-gray-300">/</span>
                        <button onClick={deselectAll} disabled={saving} className="text-gray-500 hover:underline">解除</button>
                      </div>
                    )}
                    <span className="text-[13px] font-mono font-semibold text-gray-700 w-32 text-right">
                      ¥{selectedExpensesTotal.toLocaleString()}
                    </span>
                  </div>

                  {unbilledExpenses.length === 0 ? (
                    <div className="px-3 py-3 text-center text-[12px] text-gray-400">
                      未請求の立替実費はありません
                    </div>
                  ) : (
                    <ul className="max-h-48 overflow-y-auto">
                      {unbilledExpenses.map(e => {
                        const checked = selectedExpenseIds.has(e.id)
                        return (
                          <li key={e.id} className="px-3 py-1.5 flex items-center gap-2 text-[12px] hover:bg-gray-50/60">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleExpense(e.id)}
                              disabled={saving}
                              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                            />
                            <span className="text-gray-400 font-mono text-[11px] w-20">
                              {e.expense_date ?? '—'}
                            </span>
                            <span className={`flex-1 truncate ${checked ? 'text-gray-700' : 'text-gray-400'}`}>
                              {e.category && <span className="text-gray-400 mr-1">[{e.category}]</span>}
                              {e.item_name}
                              {e.notes && <span className="text-gray-400 ml-1">({e.notes})</span>}
                            </span>
                            <span className={`font-mono font-semibold w-24 text-right ${checked ? 'text-gray-700' : 'text-gray-300'}`}>
                              ¥{e.amount.toLocaleString()}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                {/* 総額 */}
                <div className="px-3 py-3 bg-brand-50 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-brand-600" />
                  <span className="text-[14px] font-bold text-brand-800 flex-1">請求総額</span>
                  <span className="text-[18px] font-extrabold font-mono text-brand-700 w-40 text-right">
                    ¥{totalAmount.toLocaleString()}
                  </span>
                </div>

                {caseFees && (
                  <div className="px-3 py-1.5 bg-gray-50 text-[11px] text-gray-400">
                    参考: 案件の報酬合計 ¥{(caseFees.fee_total ?? ((caseFees.fee_administrative ?? 0) + (caseFees.fee_judicial ?? 0))).toLocaleString()}
                    {caseFees.advance_payment != null && caseFees.advance_payment > 0 && (
                      <> ／ 前受金 ¥{caseFees.advance_payment.toLocaleString()}</>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
