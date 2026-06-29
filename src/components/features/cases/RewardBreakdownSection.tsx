'use client'

// 報酬内訳（司法/行政それぞれ）。項目・金額・割引額・割引後・備考の表。
// 割引後（金額−割引）の合計＝その士業の確定報酬。合計を cases.fee_judicial / fee_administrative に
// 書き戻し、既存の請求書発行（前受金/確定）とつなげる。

import { useEffect, useMemo, useState } from 'react'
import { Trash2, Plus, Scale, Stamp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { MoneyInput } from './FinancialAssetsTable'
import { GYOMU_ALL } from '@/lib/serviceMaster'
import type { RewardItemRow } from '@/types'

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()
const ITEM_OPTIONS = ['基本料金', ...GYOMU_ALL]

const SHIGYO = [
  { key: '司法', label: '司法（司法書士）', Icon: Scale, color: '#185FA5', feeField: 'fee_judicial' as const },
  { key: '行政', label: '行政（行政書士）', Icon: Stamp, color: '#0F6E56', feeField: 'fee_administrative' as const },
]

export default function RewardBreakdownSection({ caseId, onTotals }: {
  caseId: string
  /** 司法/行政の確定報酬合計が変わったら通知（cases.fee_* へ書き戻し用） */
  onTotals?: (shihou: number, gyousei: number) => void
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<RewardItemRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('reward_items').select('*').eq('case_id', caseId).order('sort_order')
      if (alive) { setRows((data ?? []) as RewardItemRow[]); setLoading(false) }
    })()
    return () => { alive = false }
  }, [caseId, supabase])

  const totals = useMemo(() => {
    const t: Record<string, number> = { 司法: 0, 行政: 0 }
    for (const r of rows) t[r.shigyo] = (t[r.shigyo] ?? 0) + ((r.amount ?? 0) - (r.discount ?? 0))
    return t
  }, [rows])

  // 合計が変わったら cases.fee_* へ反映
  useEffect(() => {
    if (loading) return
    onTotals?.(totals['司法'] ?? 0, totals['行政'] ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals['司法'], totals['行政'], loading])

  const setLocal = (id: string, field: keyof RewardItemRow, value: unknown) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } as RewardItemRow : r))
  const commit = async (id: string, field: keyof RewardItemRow, value: unknown) => {
    const { error } = await supabase.from('reward_items').update({ [field]: value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }
  const addRow = async (shigyo: string) => {
    const { data, error } = await supabase.from('reward_items')
      .insert({ case_id: caseId, shigyo, label: '基本料金', amount: 0, discount: 0, sort_order: rows.length })
      .select('*').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as RewardItemRow])
  }
  const delRow = async (id: string) => {
    const { error } = await supabase.from('reward_items').delete().eq('id', id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  if (loading) return <div className="text-[12px] text-gray-400 py-3">読み込み中…</div>

  return (
    <div className="space-y-4">
      {SHIGYO.map(s => {
        const items = rows.filter(r => r.shigyo === s.key)
        const sum = totals[s.key] ?? 0
        const amountSum = items.reduce((n, r) => n + (r.amount ?? 0), 0)
        const discSum = items.reduce((n, r) => n + (r.discount ?? 0), 0)
        return (
          <div key={s.key} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
              <s.Icon className="w-3.5 h-3.5" style={{ color: s.color }} strokeWidth={2} />
              <span className="text-[12.5px] font-semibold text-gray-800">{s.label} 報酬の内訳</span>
              <span className="ml-auto text-[12.5px] font-semibold" style={{ color: s.color }}>確定報酬 {yen(sum)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse" style={{ minWidth: 620 }}>
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-100">
                    <th className="px-2 py-1.5 text-left font-medium w-32">項目</th>
                    <th className="px-2 py-1.5 text-right font-medium w-28">金額</th>
                    <th className="px-2 py-1.5 text-right font-medium w-28">割引額</th>
                    <th className="px-2 py-1.5 text-right font-medium w-28">割引後</th>
                    <th className="px-2 py-1.5 text-left font-medium">備考（割引理由等）</th>
                    <th className="px-2 py-1.5 w-7" />
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={6} className="px-2 py-4 text-center text-gray-400">行を追加してください</td></tr>
                  ) : items.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-2 py-1.5">
                        <select value={r.label ?? ''} onChange={e => { setLocal(r.id, 'label', e.target.value); commit(r.id, 'label', e.target.value) }} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                          {!ITEM_OPTIONS.includes(r.label ?? '') && r.label && <option value={r.label}>{r.label}</option>}
                          {ITEM_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><MoneyInput value={r.amount} onCommit={v => { setLocal(r.id, 'amount', v === '' ? 0 : Number(v)); commit(r.id, 'amount', v === '' ? 0 : Number(v)) }} /></td>
                      <td className="px-2 py-1.5"><MoneyInput value={r.discount} onCommit={v => { setLocal(r.id, 'discount', v === '' ? 0 : Number(v)); commit(r.id, 'discount', v === '' ? 0 : Number(v)) }} /></td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">{yen((r.amount ?? 0) - (r.discount ?? 0))}</td>
                      <td className="px-2 py-1.5">
                        <input type="text" defaultValue={r.note ?? ''} onBlur={e => commit(r.id, 'note', e.target.value)} placeholder="割引理由など" className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
                      </td>
                      <td className="px-2 py-1.5 text-center"><button type="button" onClick={() => delRow(r.id)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
                {items.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50/60 font-semibold text-gray-700">
                      <td className="px-2 py-1.5">合計</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{yen(amountSum)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-amber-700">{yen(discSum)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: s.color }}>{yen(sum)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="px-2 py-1.5">
              <button type="button" onClick={() => addRow(s.key)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" /> 行を追加</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
