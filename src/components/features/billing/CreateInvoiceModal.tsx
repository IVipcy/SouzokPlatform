'use client'

import { useState, useEffect } from 'react'
import { Loader2, Receipt, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import type { ExpenseRow } from '@/types'

type CaseOption = { id: string; case_number: string; deal_name: string }

type Props = {
  isOpen: boolean
  onClose: () => void
  cases: CaseOption[]
  /** 作成完了時に呼ばれる。新規発行された invoice id を引数で受け取れる。 */
  onSaved: (newInvoiceId?: string) => void
  /** デフォルトで選択する案件ID（/billing?case=xxx の時など） */
  defaultCaseId?: string
  /** 既存の '未請求' プレースホルダー invoice を上書きする時の id */
  existingInvoiceId?: string
}

type CaseFees = {
  fee_administrative: number | null
  fee_judicial: number | null
  fee_total: number | null
  advance_payment: number | null
}

export default function CreateInvoiceModal({ isOpen, onClose, cases, onSaved, defaultCaseId, existingInvoiceId }: Props) {
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

  // モーダル内での新規立替実費追加用
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [addingExpense, setAddingExpense] = useState(false)
  const [newExpense, setNewExpense] = useState({
    category: '',
    item_name: '',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    notes: '',
  })

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
      setShowExpenseForm(false)
      setNewExpense({ category: '', item_name: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), notes: '' })
    }
  }, [isOpen, defaultCaseId])

  // モーダル開時または案件変更時に、報酬と未請求実費を取得
  // （isOpen を deps に含めることで再オープン時も同じ case_id でも fetch する）
  useEffect(() => {
    if (!isOpen) return
    if (!form.case_id) {
      setCaseFees(null)
      setUnbilledExpenses([])
      setSelectedExpenseIds(new Set())
      return
    }
    let cancelled = false
    const run = async () => {
      setLoadingCase(true)
      const supabase = createClient()
      const [{ data: caseRow }, { data: expRows }] = await Promise.all([
        supabase.from('cases').select('fee_administrative,fee_judicial,fee_total,advance_payment').eq('id', form.case_id).single(),
        supabase.from('expenses').select('*').eq('case_id', form.case_id).is('billed_invoice_id', null).order('expense_date', { nullsFirst: false }),
      ])
      if (cancelled) return
      const fees = caseRow as CaseFees | null
      setCaseFees(fees)
      // 案件の報酬を fee_amount に自動セット（fee_total 優先、無ければ 行政+司法）
      const defaultFee = fees?.fee_total ?? ((fees?.fee_administrative ?? 0) + (fees?.fee_judicial ?? 0))
      // 既存値が空 or '0' なら上書き、それ以外（ユーザーが手入力した値）は尊重
      setForm(prev => (prev.fee_amount === '' || prev.fee_amount === '0')
        ? { ...prev, fee_amount: String(defaultFee) }
        : prev
      )
      const exps = (expRows ?? []) as ExpenseRow[]
      setUnbilledExpenses(exps)
      setSelectedExpenseIds(new Set(exps.map(e => e.id)))
      setLoadingCase(false)
    }
    run()
    return () => { cancelled = true }
  }, [isOpen, form.case_id])

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

  // モーダル内で新規立替実費を追加（即座に未請求リストへ反映）
  const handleAddExpense = async () => {
    if (!form.case_id) return
    const itemName = newExpense.item_name.trim() || newExpense.category
    const amountNum = Number(newExpense.amount)
    if (!itemName) { showToast('費目を選択するか項目名を入力してください', 'error'); return }
    if (!amountNum || amountNum <= 0) { showToast('金額を入力してください', 'error'); return }

    setAddingExpense(true)
    try {
      const supabase = createClient()
      const { data: inserted, error: insErr } = await supabase
        .from('expenses')
        .insert({
          case_id: form.case_id,
          category: newExpense.category || null,
          item_name: itemName,
          amount: amountNum,
          expense_date: newExpense.expense_date || null,
          notes: newExpense.notes.trim() || null,
        })
        .select('*')
        .single()
      if (insErr || !inserted) throw insErr ?? new Error('insert returned empty')
      const row = inserted as ExpenseRow
      // リストに追加してチェックON
      setUnbilledExpenses(prev => [row, ...prev])
      setSelectedExpenseIds(prev => {
        const next = new Set(prev)
        next.add(row.id)
        return next
      })
      // フォームリセット
      setNewExpense({ category: '', item_name: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), notes: '' })
      setShowExpenseForm(false)
      showToast('立替実費を追加しました', 'success')
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : '追加に失敗しました'
      showToast(msg, 'error')
    } finally {
      setAddingExpense(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.case_id) { setError('案件を選択してください'); return }
    if (totalAmount <= 0) { setError('請求総額が0円です'); return }

    setSaving(true)
    setError('')
    const supabase = createClient()
    // 作成時点ではまだ送付前。送付後にユーザーが手動で 前受金請求済 / 確定請求済 に変更
    const status = '作成済'

    let newInvoiceId: string
    if (existingInvoiceId) {
      // 既存の「未請求」プレースホルダーを上書き
      const { data: updated, error: updateErr } = await supabase
        .from('invoices')
        .update({
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
        .eq('id', existingInvoiceId)
        .select('id')
        .single()
      if (updateErr || !updated) {
        setError(`作成に失敗しました: ${updateErr?.message ?? '不明なエラー'}`)
        setSaving(false)
        return
      }
      newInvoiceId = updated.id
    } else {
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
      newInvoiceId = newInvoice.id
    }
    // 互換のため変数名を残す
    const newInvoice = { id: newInvoiceId }

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
    onSaved(newInvoice.id)
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

                  {unbilledExpenses.length === 0 && !showExpenseForm ? (
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

                  {/* + 立替実費を追加 */}
                  {showExpenseForm ? (
                    <div className="px-3 py-3 bg-brand-50/40 border-t border-brand-100">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[12px] font-semibold text-brand-700">新規立替実費を追加</span>
                        <button
                          onClick={() => setShowExpenseForm(false)}
                          disabled={addingExpense}
                          className="ml-auto p-0.5 text-gray-400 hover:text-gray-600 rounded"
                          title="閉じる"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-3">
                          <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">費目</label>
                          <select
                            value={newExpense.category}
                            onChange={e => setNewExpense(p => ({ ...p, category: e.target.value, item_name: p.item_name || e.target.value }))}
                            disabled={addingExpense}
                            className="w-full px-1.5 py-1 text-[12px] border border-gray-300 rounded focus:ring-1 focus:ring-brand-400 outline-none bg-white"
                          >
                            <option value="">選択</option>
                            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="col-span-4">
                          <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">項目名</label>
                          <input
                            type="text"
                            placeholder="例: 戸籍謄本 ×3通"
                            value={newExpense.item_name}
                            onChange={e => setNewExpense(p => ({ ...p, item_name: e.target.value }))}
                            disabled={addingExpense}
                            className="w-full px-1.5 py-1 text-[12px] border border-gray-300 rounded focus:ring-1 focus:ring-brand-400 outline-none"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">金額</label>
                          <div className="relative">
                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">¥</span>
                            <input
                              type="number"
                              min={0}
                              placeholder="0"
                              value={newExpense.amount}
                              onChange={e => setNewExpense(p => ({ ...p, amount: e.target.value }))}
                              disabled={addingExpense}
                              className="w-full pl-4 pr-1.5 py-1 text-[12px] font-mono text-right border border-gray-300 rounded focus:ring-1 focus:ring-brand-400 outline-none"
                            />
                          </div>
                        </div>
                        <div className="col-span-3">
                          <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">発生日</label>
                          <input
                            type="date"
                            value={newExpense.expense_date}
                            onChange={e => setNewExpense(p => ({ ...p, expense_date: e.target.value }))}
                            disabled={addingExpense}
                            className="w-full px-1.5 py-1 text-[11px] font-mono border border-gray-300 rounded focus:ring-1 focus:ring-brand-400 outline-none"
                          />
                        </div>
                        <div className="col-span-12">
                          <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">備考（任意）</label>
                          <input
                            type="text"
                            placeholder="補足"
                            value={newExpense.notes}
                            onChange={e => setNewExpense(p => ({ ...p, notes: e.target.value }))}
                            disabled={addingExpense}
                            className="w-full px-1.5 py-1 text-[12px] border border-gray-300 rounded focus:ring-1 focus:ring-brand-400 outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end mt-2">
                        <button
                          onClick={() => setShowExpenseForm(false)}
                          disabled={addingExpense}
                          className="px-3 py-1 text-[12px] text-gray-500 hover:text-gray-700 rounded hover:bg-white"
                        >
                          キャンセル
                        </button>
                        <button
                          onClick={handleAddExpense}
                          disabled={addingExpense}
                          className="inline-flex items-center gap-1 px-3 py-1 text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 rounded"
                        >
                          {addingExpense ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          追加
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowExpenseForm(true)}
                      disabled={saving}
                      className="w-full px-3 py-2 text-[12px] font-semibold text-brand-700 hover:bg-brand-50 border-t border-gray-100 transition flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      立替実費を追加（戸籍代・郵送料など）
                    </button>
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
