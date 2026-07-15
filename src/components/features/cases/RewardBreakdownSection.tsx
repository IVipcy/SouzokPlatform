'use client'

// 報酬内訳（司法/行政それぞれ）。項目・金額・割引額・割引後・備考の表。
// 割引後（金額−割引）の合計＝その士業の確定報酬。合計を cases.fee_judicial / fee_administrative に
// 書き戻し、既存の請求書発行（前受金/確定）とつなげる。

import { useEffect, useMemo, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { MoneyInput } from './FinancialAssetsTable'
import SelectOrTextField from './SelectOrTextField'
import { GYOMU_ALL } from '@/lib/serviceMaster'
import type { RewardItemRow } from '@/types'

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()
const ITEM_OPTIONS = ['基本料金', ...GYOMU_ALL]

// 司法=青 / 行政=緑（アイコン・ドットは付けず、文字色で区別）
const SHIGYO = [
  { key: '司法', label: '司法（司法書士）', color: '#185FA5', feeField: 'fee_judicial' as const },
  { key: '行政', label: '行政（行政書士）', color: '#0F6E56', feeField: 'fee_administrative' as const },
]

export default function RewardBreakdownSection({ caseId, onTotals, advance, onAdvanceChange, hideAdvance = false }: {
  caseId: string
  /** 司法/行政の確定報酬合計が変わったら通知（cases.fee_* へ書き戻し用） */
  onTotals?: (shihou: number, gyousei: number) => void
  /** 前受金の現在値（司法/行政）。表に組み込んで表示・編集する */
  advance?: { 司法: number | null; 行政: number | null }
  /** 前受金の変更（cases.advance_payment_* へ） */
  onAdvanceChange?: (shigyo: '司法' | '行政', value: number | null) => void
  /** 一括（②③）では前受金＝確定報酬まるごとのため、差引用の前受金欄・差引後を隠す */
  hideAdvance?: boolean
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
            <div className="px-3 py-2 bg-gray-50 flex items-center gap-2 border-l-4" style={{ borderColor: s.color }}>
              <span className="text-[12.5px] font-semibold" style={{ color: s.color }}>{s.label}</span>
              <span className="text-[12.5px] text-gray-500">報酬の内訳</span>
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
                        <SelectOrTextField value={r.label} options={ITEM_OPTIONS} onSave={v => { setLocal(r.id, 'label', v); commit(r.id, 'label', v) }} placeholder="項目名を入力" />
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
            <div className="px-2 py-1.5 flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => addRow(s.key)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" /> 行を追加</button>
              {advance && onAdvanceChange && !hideAdvance && (
                <span className="ml-auto inline-flex items-center gap-2 text-[12px] bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <span className="text-amber-700 font-bold">前受金（{s.key}）</span>
                  <MoneyInput value={advance[s.key as '司法' | '行政']} onCommit={v => onAdvanceChange(s.key as '司法' | '行政', v === '' ? null : Number(v))} />
                  <span className="text-gray-500">差引後 <span className="font-mono font-semibold text-amber-800">{yen(sum - (advance[s.key as '司法' | '行政'] ?? 0))}</span></span>
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
