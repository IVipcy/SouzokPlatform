'use client'

// 立替実費（請求タブ）。司法/行政それぞれ、課税/非課税に分けて入力する。
// 名目は定型リスト（課税/非課税）から選択 or 自由入力。金額＝数量×単価（空欄なら直接）。

import { useEffect, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { MoneyInput } from './FinancialAssetsTable'
import { EXPENSE_NONTAX_ITEMS, EXPENSE_TAX_ITEMS } from '@/lib/constants'
import type { BillingExpenseItemRow } from '@/types'

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()
const SHIGYO = ['司法', '行政'] as const

export default function BillingExpensesSection({ caseId }: { caseId: string }) {
  const supabase = createClient()
  const [rows, setRows] = useState<BillingExpenseItemRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('billing_expense_items').select('*').eq('case_id', caseId).order('sort_order')
      if (alive) { setRows((data ?? []) as BillingExpenseItemRow[]); setLoading(false) }
    })()
    return () => { alive = false }
  }, [caseId, supabase])

  const setLocal = (id: string, patch: Partial<BillingExpenseItemRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } as BillingExpenseItemRow : r))
  const commit = async (id: string, patch: Partial<BillingExpenseItemRow>) => {
    const { error } = await supabase.from('billing_expense_items').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error')
  }
  // 数量×単価で金額を更新（両方あるとき）。片方でも変わったら再計算。
  const recalcAmount = (r: BillingExpenseItemRow, q: number | null, u: number | null): number => {
    if (q != null && u != null) return Math.round(q * u)
    return r.amount ?? 0
  }
  const addRow = async (shigyo: string, taxable: boolean) => {
    const { data, error } = await supabase.from('billing_expense_items')
      .insert({ case_id: caseId, shigyo, taxable, amount: 0, sort_order: rows.length }).select('*').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as BillingExpenseItemRow])
  }
  const delRow = async (id: string) => {
    const { error } = await supabase.from('billing_expense_items').delete().eq('id', id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  if (loading) return <div className="text-[12px] text-gray-400 py-3">読み込み中…</div>

  const renderBlock = (shigyo: string, taxable: boolean) => {
    const items = rows.filter(r => r.shigyo === shigyo && r.taxable === taxable)
    const subtotal = items.reduce((n, r) => n + (r.amount ?? 0), 0)
    return (
      <div className="mt-2">
        <div className="text-[11px] text-gray-500 mb-1">{taxable ? '課税（税込）' : '非課税'}</div>
        <table className="w-full text-[11.5px] border-collapse" style={{ minWidth: 560 }}>
          <thead><tr className="text-[10.5px] text-gray-500 border-b border-gray-100">
            <th className="px-1.5 py-1 text-left font-medium w-[38%]">名目</th><th className="px-1.5 py-1 text-right font-medium">数量</th><th className="px-1.5 py-1 text-right font-medium">単価</th><th className="px-1.5 py-1 text-right font-medium">金額</th><th className="px-1.5 py-1 text-left font-medium">備考</th><th className="px-1.5 py-1 w-6" />
          </tr></thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                <td className="px-1.5 py-1">
                  <input list={`exp-${taxable ? 'tax' : 'non'}`} defaultValue={r.label ?? ''} onBlur={e => commit(r.id, { label: e.target.value })} placeholder="選択 or 入力" className="w-full px-1.5 py-1.5 text-[11.5px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" />
                </td>
                <td className="px-1.5 py-1"><MoneyInput value={r.quantity} onCommit={v => { const q = v === '' ? null : Number(v); setLocal(r.id, { quantity: q }); commit(r.id, { quantity: q, amount: recalcAmount(r, q, r.unit_price) }) }} /></td>
                <td className="px-1.5 py-1"><MoneyInput value={r.unit_price} onCommit={v => { const u = v === '' ? null : Number(v); setLocal(r.id, { unit_price: u }); commit(r.id, { unit_price: u, amount: recalcAmount(r, r.quantity, u) }) }} /></td>
                <td className="px-1.5 py-1"><MoneyInput value={r.amount} onCommit={v => commit(r.id, { amount: v === '' ? 0 : Number(v) })} /></td>
                <td className="px-1.5 py-1"><input type="text" defaultValue={r.note ?? ''} onBlur={e => commit(r.id, { note: e.target.value })} placeholder="備考" className="w-full px-1.5 py-1.5 text-[11.5px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" /></td>
                <td className="px-1.5 py-1 text-center"><button type="button" onClick={() => delRow(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-semibold bg-gray-50/60"><td colSpan={3} className="px-1.5 py-1">{taxable ? '課税 小計（税込）' : '非課税 小計'}</td><td className="px-1.5 py-1 text-right tabular-nums">{yen(subtotal)}</td><td colSpan={2} /></tr></tfoot>
        </table>
        <button type="button" onClick={() => addRow(shigyo, taxable)} className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3 h-3" /> 行を追加</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 名目の候補（datalist） */}
      <datalist id="exp-tax">{EXPENSE_TAX_ITEMS.map(o => <option key={o} value={o} />)}</datalist>
      <datalist id="exp-non">{EXPENSE_NONTAX_ITEMS.map(o => <option key={o} value={o} />)}</datalist>
      {SHIGYO.map(s => (
        <div key={s} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 text-[12.5px] font-semibold text-gray-800">立替実費（{s}）</div>
          <div className="px-3 pb-3">
            {renderBlock(s, false)}
            {renderBlock(s, true)}
          </div>
        </div>
      ))}
    </div>
  )
}
