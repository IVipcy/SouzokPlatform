'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Section, FieldGrid, Field,
  InlineSelect, InlineCurrency, InlineDate, InlineTextarea, FormField,
} from '@/components/ui/InlineFields'
import { CONTRACT_TYPES, INVOICE_STATUSES, PAYMENT_STATUSES, EXPENSE_CATEGORIES } from '@/lib/constants'
import type { CaseRow, ExpenseRow, TaskRow, PartnerRow } from '@/types'

type Props = {
  caseData: CaseRow
  expenses: ExpenseRow[]
  tasks: TaskRow[]
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

const yen = (v: number | null | undefined) =>
  v != null ? `¥${v.toLocaleString()}` : '未設定'

export default function ContractTab({ caseData, expenses, tasks, onRefresh, patchCase }: Props) {
  const [partner, setPartner] = useState<PartnerRow | null>(null)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [savingExpense, setSavingExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    category: '', amount: '', expense_date: '', related_task_id: '', notes: '',
  })

  // パートナー取得
  useEffect(() => {
    if (!caseData.partner_id) { setPartner(null); return }
    const fetchPartner = async () => {
      const supabase = createClient()
      const { data } = await supabase.from('partners').select('*').eq('id', caseData.partner_id!).single()
      setPartner(data as PartnerRow | null)
    }
    fetchPartner()
  }, [caseData.partner_id])

  const save = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  // 計算値
  const feeSubtotal = (caseData.fee_administrative ?? 0) + (caseData.fee_judicial ?? 0)
  const confirmedAmount = feeSubtotal - (caseData.advance_payment ?? 0)
  const partnerCompensation = partner
    ? (caseData.fee_administrative ?? 0) * (partner.kickback_rate ?? 0) / 100
    : null
  const expenseTotal = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0)
  const feeRealEstate = caseData.fee_real_estate ?? 0
  const feeTaxReferral = caseData.fee_tax_referral ?? 0
  const totalRevenue = feeSubtotal + feeRealEstate + feeTaxReferral

  // 立替実費
  const handleAddExpense = async () => {
    if (!expenseForm.category || !expenseForm.amount) return
    setSavingExpense(true)
    const supabase = createClient()
    await supabase.from('expenses').insert({
      case_id: caseData.id,
      category: expenseForm.category,
      item_name: expenseForm.category,
      amount: Number(expenseForm.amount),
      expense_date: expenseForm.expense_date || null,
      related_task_id: expenseForm.related_task_id || null,
      related_task: expenseForm.related_task_id
        ? tasks.find(t => t.id === expenseForm.related_task_id)?.title ?? null
        : null,
      notes: expenseForm.notes || null,
    })
    setExpenseForm({ category: '', amount: '', expense_date: '', related_task_id: '', notes: '' })
    setShowExpenseForm(false)
    setSavingExpense(false)
    onRefresh()
  }

  const handleDeleteExpense = async (id: string) => {
    const supabase = createClient()
    await supabase.from('expenses').delete().eq('id', id)
    onRefresh()
  }

  const getRelatedTaskName = (expense: ExpenseRow) => {
    if (expense.related_task_id) {
      const task = tasks.find(t => t.id === expense.related_task_id)
      if (task) return task.title
    }
    return expense.related_task ?? '—'
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

        {/* ─── Left column ─── */}
        <div className="space-y-3.5">

          {/* 1. 契約情報 */}
          <Section title="契約情報" icon="📄">
            <FieldGrid>
              <InlineSelect
                label="契約形態"
                value={caseData.contract_type}
                options={[...CONTRACT_TYPES]}
                onSave={v => save('contract_type', v)}
                required
              />
              <InlineDate
                label="契約日"
                value={caseData.contract_date}
                onSave={v => save('contract_date', v)}
              />
            </FieldGrid>
            <FieldGrid cols={1}>
              <InlineTextarea
                label="特記事項"
                value={caseData.notes}
                onSave={v => save('notes', v)}
                fullWidth
              />
            </FieldGrid>
          </Section>

          {/* 2. 報酬・請求 */}
          <Section title="報酬・請求" icon="💳">
            <FieldGrid cols={1}>
              <InlineSelect
                label="請求書ステータス"
                value={caseData.invoice_status}
                options={[...INVOICE_STATUSES]}
                onSave={v => save('invoice_status', v)}
              />
              <InlineCurrency
                label="報酬金額（行政）"
                value={caseData.fee_administrative}
                onSave={v => save('fee_administrative', v)}
              />
              <InlineCurrency
                label="報酬金額（司法）"
                value={caseData.fee_judicial}
                onSave={v => save('fee_judicial', v)}
              />
              <Field label="報酬小計" value={yen(feeSubtotal)} mono />
              <InlineCurrency
                label="前受金"
                value={caseData.advance_payment}
                onSave={v => save('advance_payment', v)}
              />
              <Field label="請求金額（確定）" value={yen(confirmedAmount)} mono />
              <InlineDate
                label="請求日"
                value={caseData.invoice_date}
                onSave={v => save('invoice_date', v)}
              />
              <InlineSelect
                label="入金ステータス"
                value={caseData.payment_status}
                options={[...PAYMENT_STATUSES]}
                onSave={v => save('payment_status', v)}
              />
              <InlineDate
                label="入金期限"
                value={caseData.payment_due_date}
                onSave={v => save('payment_due_date', v)}
              />
              <InlineDate
                label="入金確認日"
                value={caseData.payment_confirmed_date}
                onSave={v => save('payment_confirmed_date', v)}
              />
              <InlineCurrency
                label="入金額"
                value={caseData.payment_amount}
                onSave={v => save('payment_amount', v)}
              />
              <InlineTextarea
                label="メモ"
                value={caseData.invoice_memo}
                onSave={v => save('invoice_memo', v)}
              />
            </FieldGrid>
          </Section>

          {/* 3. 付帯収益 */}
          <Section title="付帯収益" icon="💹">
            <FieldGrid>
              <InlineCurrency
                label="不動産売却手数料見込"
                value={caseData.fee_real_estate}
                onSave={v => save('fee_real_estate', v)}
              />
              <InlineCurrency
                label="税理士紹介手数料"
                value={caseData.fee_tax_referral}
                onSave={v => save('fee_tax_referral', v)}
              />
            </FieldGrid>
            <div className="flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
              <span className="text-gray-500 font-medium text-sm">案件トータル収益見込</span>
              <span className="text-blue-600 font-bold text-base">{yen(totalRevenue || null)}</span>
            </div>
          </Section>

          {/* 4. パートナー報酬 */}
          <Section title="パートナー報酬" icon="🤝">
            <FieldGrid cols={1}>
              <Field label="紹介元パートナー" value={partner ? partner.name : '未設定'} />
              <Field label="パートナー報酬割合" value={partner ? `${partner.kickback_rate}%` : '—'} mono />
              <Field
                label="パートナー報酬金額"
                value={partner && partnerCompensation != null ? yen(Math.round(partnerCompensation)) : '—'}
                mono
              />
            </FieldGrid>
            <div className="text-[10px] text-gray-400 mt-2">
              ※ 紹介元パートナーは「基本情報 → 受注ルート・紹介 → 紹介パートナー」で選択します。
              報酬金額は「確定金額（行政）× 還元率」で自動計算されます。
            </div>
          </Section>
        </div>

        {/* ─── Right column ─── */}
        <div className="space-y-3.5">

          {/* 収益サマリーカード */}
          <div className="rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #1E40AF, #2563EB)' }}>
            <div className="text-[10px] font-semibold opacity-70 tracking-wider uppercase mb-1.5">案件トータル収益見込</div>
            <div className="text-[26px] font-extrabold tracking-tight mb-2.5">
              {totalRevenue > 0 ? `¥${totalRevenue.toLocaleString()}` : '—'}
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="opacity-70">確定金額合計（行政＋司法）</span>
                <span className="font-mono">{feeSubtotal > 0 ? `¥${feeSubtotal.toLocaleString()}` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">不動産手数料見込</span>
                <span className="font-mono">{feeRealEstate > 0 ? `¥${feeRealEstate.toLocaleString()}` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">税理士紹介手数料</span>
                <span className="font-mono">{feeTaxReferral > 0 ? `¥${feeTaxReferral.toLocaleString()}` : '—'}</span>
              </div>
            </div>
          </div>

          {/* 立替実費明細 */}
          <Section title="立替実費明細" icon="🧾" actionLabel="追加" onAction={() => setShowExpenseForm(true)}>
            <div className="text-sm">
              {expenses.length > 0 ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[11px] text-gray-400 border-b border-gray-100">
                      <th className="pb-1.5 font-medium">費目</th>
                      <th className="pb-1.5 font-medium text-right">金額</th>
                      <th className="pb-1.5 font-medium">発生日</th>
                      <th className="pb-1.5 font-medium">備考</th>
                      <th className="pb-1.5 w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map(e => (
                      <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-1.5 text-xs">{e.category || e.item_name}</td>
                        <td className="py-1.5 text-right font-mono text-xs">¥{e.amount.toLocaleString()}</td>
                        <td className="py-1.5 text-gray-500 text-xs">{e.expense_date ?? '—'}</td>
                        <td className="py-1.5 text-gray-500 text-xs truncate max-w-[80px]">
                          {getRelatedTaskName(e) !== '—' ? getRelatedTaskName(e) : (e.notes ?? '—')}
                        </td>
                        <td className="py-1.5">
                          <button
                            onClick={() => handleDeleteExpense(e.id)}
                            className="text-red-400 hover:text-red-600 text-xs"
                            title="削除"
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td className="pt-2 font-medium text-gray-700 text-xs">合計</td>
                      <td className="pt-2 text-right font-bold text-gray-900 font-mono text-xs">¥{expenseTotal.toLocaleString()}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="text-gray-400 text-center py-3 text-xs">立替実費はありません</p>
              )}

              {/* 追加フォーム */}
              {showExpenseForm && (
                <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="費目" required>
                      <select
                        value={expenseForm.category}
                        onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="">選択してください</option>
                        {EXPENSE_CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="金額" required>
                      <input
                        type="number"
                        placeholder="金額"
                        value={expenseForm.amount}
                        onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </FormField>
                    <FormField label="発生日">
                      <input
                        type="date"
                        value={expenseForm.expense_date}
                        onChange={e => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </FormField>
                    <FormField label="関連タスク">
                      <select
                        value={expenseForm.related_task_id}
                        onChange={e => setExpenseForm({ ...expenseForm, related_task_id: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="">（なし）</option>
                        {tasks.map(t => (
                          <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                  <FormField label="備考">
                    <input
                      type="text"
                      placeholder="備考"
                      value={expenseForm.notes}
                      onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </FormField>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setShowExpenseForm(false)}
                      className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleAddExpense}
                      disabled={savingExpense || !expenseForm.category || !expenseForm.amount}
                      className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingExpense ? '保存中...' : '追加'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>

      {/* ─── 請求サマリー（下部） ─── */}
      <div className="rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #1E40AF, #2563EB)' }}>
        <div className="text-[10px] font-semibold opacity-70 tracking-wider uppercase mb-2.5">請求サマリー</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-[11px] opacity-80 mb-0.5">報酬小計</div>
            <div className="text-lg font-bold tracking-tight">{yen(feeSubtotal)}</div>
          </div>
          <div>
            <div className="text-[11px] opacity-80 mb-0.5">立替実費合計</div>
            <div className="text-lg font-bold tracking-tight">{yen(expenseTotal)}</div>
          </div>
          <div>
            <div className="text-[11px] opacity-80 mb-0.5">請求金額（確定）</div>
            <div className="text-lg font-bold tracking-tight">{yen(confirmedAmount)}</div>
          </div>
          <div>
            <div className="text-[11px] opacity-80 mb-0.5">パートナー報酬額</div>
            <div className="text-lg font-bold tracking-tight">
              {partnerCompensation != null ? yen(Math.round(partnerCompensation)) : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
