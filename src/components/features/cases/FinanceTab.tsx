'use client'

import { useState, useRef, useEffect } from 'react'
import type { CaseRow, ExpenseRow } from '@/types'
import { createClient } from '@/lib/supabase/client'

type Props = {
  caseData: CaseRow
  expenses: ExpenseRow[]
  onRefresh: () => void
}

const yen = (v: number | null | undefined) =>
  v != null ? `¥${v.toLocaleString()}` : '未設定'

const paymentStatusColor: Record<string, string> = {
  '未入金': 'bg-red-100 text-red-700',
  '一部入金': 'bg-yellow-100 text-yellow-700',
  '入金済': 'bg-green-100 text-green-700',
  '前受金入金済': 'bg-blue-100 text-blue-700',
}

export default function FinanceTab({ caseData, expenses, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    item_name: '',
    amount: '',
    expense_date: '',
    related_task: '',
    notes: '',
  })

  const supabase = createClient()

  const saveCaseField = async (field: string, value: string) => {
    const supabase = createClient()
    await supabase.from('cases').update({ [field]: value || null }).eq('id', caseData.id)
    onRefresh()
  }

  const saveCaseNumberField = async (field: string, value: string) => {
    const supabase = createClient()
    const numValue = value === '' ? null : Number(value)
    await supabase.from('cases').update({ [field]: numValue }).eq('id', caseData.id)
    onRefresh()
  }

  const handleAddExpense = async () => {
    if (!form.item_name || !form.amount) return
    setSaving(true)
    await supabase.from('expenses').insert({
      case_id: caseData.id,
      item_name: form.item_name,
      amount: Number(form.amount),
      expense_date: form.expense_date || null,
      related_task: form.related_task || null,
      notes: form.notes || null,
    })
    setForm({ item_name: '', amount: '', expense_date: '', related_task: '', notes: '' })
    setShowForm(false)
    setSaving(false)
    onRefresh()
  }

  const handleDeleteExpense = async (id: string) => {
    await supabase.from('expenses').delete().eq('id', id)
    onRefresh()
  }

  const expenseTotal = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0)

  const revenueRows = [
    { label: '行政書士報酬', value: caseData.fee_administrative },
    { label: '司法書士報酬', value: caseData.fee_judicial },
    { label: '不動産手数料見込', value: caseData.fee_real_estate },
    { label: '税理士紹介手数料', value: caseData.fee_tax_referral },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      {/* Left column */}
      <div className="space-y-3.5">
        {/* 契約・報酬 */}
        <Section title="契約・報酬" icon="💴">
          <div className="grid grid-cols-2 gap-x-6 gap-y-0">
            <InlineEdit label="契約種別" value={caseData.contract_type} onSave={v => saveCaseField('contract_type', v)} />
            <InlineEdit label="契約日" value={caseData.contract_date} onSave={v => saveCaseField('contract_date', v)} mono />
            <InlineEdit label="行政書士報酬" value={caseData.fee_administrative != null ? String(caseData.fee_administrative) : null} onSave={v => saveCaseNumberField('fee_administrative', v)} type="number" displayFormat={yen(caseData.fee_administrative)} />
            <InlineEdit label="司法書士報酬" value={caseData.fee_judicial != null ? String(caseData.fee_judicial) : null} onSave={v => saveCaseNumberField('fee_judicial', v)} type="number" displayFormat={yen(caseData.fee_judicial)} />
            <div className="col-span-2 flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
              <span className="text-gray-500 font-medium text-sm">報酬合計</span>
              <span className="text-blue-600 font-bold text-base">{yen(caseData.fee_total)}</span>
            </div>
            <div className="col-span-2">
              <InlineEdit label="入金状況" value={caseData.payment_status} onSave={v => saveCaseField('payment_status', v)} />
            </div>
            <div className="col-span-2">
              <InlineEdit label="入金日" value={caseData.payment_date} onSave={v => saveCaseField('payment_date', v)} mono />
            </div>
          </div>
        </Section>

        {/* 付帯収益 */}
        <Section title="付帯収益" icon="📈">
          <div className="grid grid-cols-2 gap-x-6 gap-y-0">
            <InlineEdit label="不動産手数料見込" value={caseData.fee_real_estate != null ? String(caseData.fee_real_estate) : null} onSave={v => saveCaseNumberField('fee_real_estate', v)} type="number" displayFormat={yen(caseData.fee_real_estate)} />
            <InlineEdit label="税理士紹介手数料" value={caseData.fee_tax_referral != null ? String(caseData.fee_tax_referral) : null} onSave={v => saveCaseNumberField('fee_tax_referral', v)} type="number" displayFormat={yen(caseData.fee_tax_referral)} />
            <div className="col-span-2 flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
              <span className="text-gray-500 font-medium text-sm">収益見込み合計</span>
              <span className="text-blue-600 font-bold text-base">{yen(caseData.total_revenue_estimate)}</span>
            </div>
          </div>
        </Section>
      </div>

      {/* Right column */}
      <div className="space-y-3.5">
        {/* Revenue card */}
        <div className="rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #1E40AF, #2563EB)' }}>
          <div className="text-[10px] font-semibold opacity-70 tracking-wider uppercase mb-1.5">案件収益見込み</div>
          <div className="text-[26px] font-extrabold tracking-tight mb-2.5">
            {caseData.total_revenue_estimate != null
              ? `¥${caseData.total_revenue_estimate.toLocaleString()}`
              : '—'}
          </div>
          <div className="space-y-1.5">
            {revenueRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-[11px]">
                <span className="opacity-80">{r.label}</span>
                <span className="font-semibold">
                  {r.value != null ? `¥${r.value.toLocaleString()}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* パートナー報酬 */}
        <Section title="パートナー報酬" icon="🤝">
          <div className="text-sm space-y-0">
            <InlineEdit label="パートナーID" value={caseData.partner_id} onSave={v => saveCaseField('partner_id', v)} />
            <InlineEdit label="紹介手数料" value={caseData.referral_fee != null ? String(caseData.referral_fee) : null} onSave={v => saveCaseNumberField('referral_fee', v)} type="number" displayFormat={yen(caseData.referral_fee)} />
          </div>
        </Section>

        {/* 立替実費明細 */}
        <Section title="立替実費明細" icon="🧾">
          <div className="text-sm">
            {expenses.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[11px] text-gray-400 border-b border-gray-100">
                    <th className="pb-1.5 font-medium">費目</th>
                    <th className="pb-1.5 font-medium text-right">金額</th>
                    <th className="pb-1.5 font-medium">発生日</th>
                    <th className="pb-1.5 font-medium">関連タスク</th>
                    <th className="pb-1.5 font-medium">備考</th>
                    <th className="pb-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-1.5">{e.item_name}</td>
                      <td className="py-1.5 text-right">¥{e.amount.toLocaleString()}</td>
                      <td className="py-1.5 text-gray-500">{e.expense_date ?? '—'}</td>
                      <td className="py-1.5 text-gray-500">{e.related_task ?? '—'}</td>
                      <td className="py-1.5 text-gray-500 truncate max-w-[80px]">{e.notes ?? '—'}</td>
                      <td className="py-1.5">
                        <button
                          onClick={() => handleDeleteExpense(e.id)}
                          className="text-red-400 hover:text-red-600 text-xs"
                          title="削除"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200">
                    <td className="pt-2 font-medium text-gray-700">合計</td>
                    <td className="pt-2 text-right font-bold text-gray-900">¥{expenseTotal.toLocaleString()}</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p className="text-gray-400 text-center py-3">立替実費はありません</p>
            )}

            {/* Add form */}
            {showForm ? (
              <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="費目 *"
                    value={form.item_name}
                    onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <input
                    placeholder="金額 *"
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <input
                    placeholder="発生日"
                    type="date"
                    value={form.expense_date}
                    onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <input
                    placeholder="関連タスク"
                    value={form.related_task}
                    onChange={(e) => setForm({ ...form, related_task: e.target.value })}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <input
                  placeholder="備考"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleAddExpense}
                    disabled={saving || !form.item_name || !form.amount}
                    className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? '保存中...' : '追加'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 w-full text-xs text-blue-600 hover:text-blue-700 border border-dashed border-blue-300 rounded-lg py-2 hover:bg-blue-50/50 transition"
              >
                ＋ 立替実費を追加
              </button>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}

// ─── InlineEdit component ───
function InlineEdit({ label, value, onSave, mono, type = 'text', displayFormat }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  mono?: boolean
  type?: 'text' | 'number'
  displayFormat?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleStartEdit = () => {
    setDraft(value ?? '')
    setEditing(true)
  }

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (trimmed === (value ?? '')) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const handleCancel = () => {
    setDraft(value ?? '')
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const displayValue = displayFormat ?? value

  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className={`w-full px-1.5 py-0.5 -ml-1.5 text-[13px] border border-blue-400 rounded outline-none bg-blue-50/30 ${mono ? 'font-mono' : ''} ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div
          onClick={handleStartEdit}
          className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]"
        >
          <span className={`text-[13px] ${mono ? 'font-mono' : ''} ${displayValue && displayValue !== '未設定' ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {displayValue ?? '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✏️</span>
        </div>
      )}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}
