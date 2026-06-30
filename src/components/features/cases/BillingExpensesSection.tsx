'use client'

// 立替実費（請求タブ）。司法/行政それぞれ、課税/非課税に分けて入力する。
// 名目は定型リスト（課税/非課税）から選択 or 自由入力。金額＝数量×単価（空欄なら直接）。

import { useEffect, useState } from 'react'
import { Trash2, Plus, Download } from 'lucide-react'
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
  const [importing, setImporting] = useState(false)

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

  // 各実務タブで確定した立替実費を取り込む（戸籍の小為替・不動産の取得資料・登録免許税）。
  // 既存の取り込み分は入れ替え、手入力分(source_kind=null)は残す。
  const importFromTabs = async () => {
    if (rows.some(r => r.source_kind) && !confirm('実務タブから立替実費を取り込みます。前回取り込んだ分は最新の内容に入れ替わります（手入力分は残ります）。よろしいですか？')) return
    setImporting(true)
    const [{ data: kos }, { data: rea }, { data: props }] = await Promise.all([
      supabase.from('koseki_requests').select('id, target_person, request_to, acquirer, cost_budget, cost_refund, cost_confirmed').eq('case_id', caseId),
      supabase.from('real_estate_acquisitions').select('id, item_type, target_municipality, cost_confirmed').eq('case_id', caseId),
      supabase.from('real_estate_properties').select('id, address, lot_number, registration_cost').eq('case_id', caseId),
    ])
    type Imp = { shigyo: string; taxable: boolean; label: string; amount: number; source_kind: string; source_id: string }
    const items: Imp[] = []
    for (const k of (kos ?? []) as Record<string, unknown>[]) {
      if (k.acquirer === '依頼者') continue  // 依頼者負担は立替に含めない
      const b = k.cost_budget as number | null, rf = k.cost_refund as number | null, c = k.cost_confirmed as number | null
      const amt = (b != null || rf != null) ? (b ?? 0) - (rf ?? 0) : (c ?? 0)
      if (amt > 0) items.push({ shigyo: '司法', taxable: false, label: `戸籍等取得（${(k.target_person as string) || (k.request_to as string) || '戸籍'}）`, amount: amt, source_kind: 'koseki', source_id: k.id as string })
    }
    for (const a of (rea ?? []) as Record<string, unknown>[]) {
      const amt = (a.cost_confirmed as number | null) ?? 0
      if (amt > 0) items.push({ shigyo: '司法', taxable: false, label: `${(a.item_type as string) || '取得資料'}${a.target_municipality ? `（${a.target_municipality}）` : ''}`, amount: amt, source_kind: 'real_estate_acq', source_id: a.id as string })
    }
    for (const p of (props ?? []) as Record<string, unknown>[]) {
      const amt = (p.registration_cost as number | null) ?? 0
      if (amt > 0) items.push({ shigyo: '司法', taxable: false, label: `登録免許税（${(p.address as string) || (p.lot_number as string) || '物件'}）`, amount: amt, source_kind: 'registration', source_id: p.id as string })
    }
    // 既存の取り込み分を削除 → 再挿入
    await supabase.from('billing_expense_items').delete().eq('case_id', caseId).not('source_kind', 'is', null)
    const base = rows.filter(r => !r.source_kind).length
    if (items.length) {
      const { error } = await supabase.from('billing_expense_items').insert(items.map((it, i) => ({ case_id: caseId, sort_order: base + i, quantity: null, unit_price: null, note: null, ...it })))
      if (error) { showToast(`取り込みに失敗: ${error.message}`, 'error'); setImporting(false); return }
    }
    const { data } = await supabase.from('billing_expense_items').select('*').eq('case_id', caseId).order('sort_order')
    setRows((data ?? []) as BillingExpenseItemRow[])
    setImporting(false)
    showToast(items.length ? `実務タブから${items.length}件の立替実費を取り込みました（すべて司法／非課税。区分は必要に応じて調整してください）` : '取り込める確定済の立替実費がありませんでした', items.length ? 'success' : 'info')
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-gray-400">各実務タブ（戸籍の小為替・不動産の取得資料・登録免許税）で確定した立替実費を取り込めます。手入力分はそのまま残ります。</p>
        <button type="button" onClick={importFromTabs} disabled={importing}
          className="flex-none inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md border border-brand-200 text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-50">
          <Download className="w-3.5 h-3.5" />{importing ? '取り込み中…' : '実務タブから取り込み'}
        </button>
      </div>
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
