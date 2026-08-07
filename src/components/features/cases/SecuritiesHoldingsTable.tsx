'use client'

// 有価証券の銘柄明細（securities_holdings・migration 226）。
// 1つの証券会社（financial_assets の1行）に複数銘柄がぶら下がるので、口座の下に明細表として出す。
// 財産目録の「合計評価額」はこの合計、「備考」は 株数×1株評価額（基準日）にあたる。
//
// 評価額は 株数×単価 を自動計算するが、投資信託の基準価額など計算が合わない商品もあるため
// 手入力での上書きを許す（amount が入っていればそちらを使う）。

import { useState, useEffect } from 'react'
import { Trash2, Plus, ArrowUpToLine } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { MoneyInput } from './FinancialAssetsTable'
import type { FinancialAssetRow, SecuritiesHoldingRow } from '@/types'

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()
/** 明細1行の評価額。手入力があればそれ、なければ 株数×単価 */
export const holdingAmount = (h: SecuritiesHoldingRow): number =>
  h.amount != null ? h.amount : (h.quantity ?? 0) * (h.unit_price ?? 0)

export default function SecuritiesHoldingsTable({ caseId, assets, onRefresh }: {
  caseId: string
  /** この表に出す口座（証券会社）。institution 単位で渡す */
  assets: FinancialAssetRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<SecuritiesHoldingRow[]>([])
  const assetIds = assets.map(a => a.id).join(',')

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!assetIds) { if (alive) setRows([]); return }
      const { data } = await supabase.from('securities_holdings')
        .select('*').in('financial_asset_id', assetIds.split(',')).order('sort_order')
      if (alive) setRows((data ?? []) as SecuritiesHoldingRow[])
    })()
    return () => { alive = false }
  }, [assetIds, supabase])

  const save = (id: string, patch: Partial<SecuritiesHoldingRow>) => {
    setRows(p => p.map(r => (r.id === id ? { ...r, ...patch } : r)))
    supabase.from('securities_holdings').update(patch).eq('id', id).then(({ error }) => {
      if (error) showToast(`保存に失敗: ${error.message}`, 'error')
    })
  }
  const add = async (assetId: string) => {
    const n = rows.filter(r => r.financial_asset_id === assetId).length
    const { data, error } = await supabase.from('securities_holdings')
      .insert({ case_id: caseId, financial_asset_id: assetId, sort_order: n }).select('*').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    setRows(p => [...p, data as SecuritiesHoldingRow])
  }
  const del = async (id: string) => {
    const { error } = await supabase.from('securities_holdings').delete().eq('id', id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    setRows(p => p.filter(r => r.id !== id))
  }
  // 明細の合計を口座の残高（評価額）へ書き戻す。目録に載るのは口座の残高なので、
  // 明細を入れたら1クリックで揃えられるようにする。
  const applyTotal = async (assetId: string, total: number) => {
    const { error } = await supabase.from('financial_assets').update({ balance_amount: total }).eq('id', assetId)
    if (error) { showToast(`反映に失敗: ${error.message}`, 'error'); return }
    showToast(`評価額 ${yen(total)} を口座に反映しました`, 'success')
    onRefresh?.()
  }

  if (assets.length === 0) return null

  return (
    <div className="space-y-3">
      {assets.map(a => {
        const mine = rows.filter(r => r.financial_asset_id === a.id)
        const total = mine.reduce((s, r) => s + holdingAmount(r), 0)
        const label = [a.institution_name, a.branch_name].filter(Boolean).join(' ') || '（証券会社未入力）'
        return (
          <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[12.5px] font-semibold text-brand-800">{label}</span>
              <span className="ml-auto text-[12px] text-gray-500">
                評価額合計 <span className="font-semibold tabular-nums text-gray-800">{yen(total)}</span>
              </span>
              {total > 0 && total !== (a.balance_amount ?? 0) && (
                <button type="button" onClick={() => applyTotal(a.id, total)}
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700 border border-brand-300 rounded px-2 py-1">
                  <ArrowUpToLine className="w-3 h-3" />口座の評価額に反映
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse" style={{ minWidth: 620 }}>
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                    <th className="px-2 py-1.5 text-left font-medium">銘柄名</th>
                    <th className="px-2 py-1.5 text-right font-medium w-28">株数・口数</th>
                    <th className="px-2 py-1.5 text-right font-medium w-32">1株あたり</th>
                    <th className="px-2 py-1.5 text-left font-medium w-32">基準日</th>
                    <th className="px-2 py-1.5 text-right font-medium w-36">評価額<span className="block text-[10px] font-normal text-gray-400">未入力は自動計算</span></th>
                    <th className="px-2 py-1.5 text-left font-medium">備考</th>
                    <th className="w-9" />
                  </tr>
                </thead>
                <tbody>
                  {mine.length === 0 && (
                    <tr><td colSpan={7} className="px-2 py-3 text-center text-[11.5px] text-gray-400">銘柄が未登録です</td></tr>
                  )}
                  {mine.map(h => (
                    <tr key={h.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-2 py-1.5">
                        <input type="text" value={h.brand_name ?? ''} onChange={e => setRows(p => p.map(x => x.id === h.id ? { ...x, brand_name: e.target.value } : x))}
                          onBlur={e => save(h.id, { brand_name: e.target.value || null })}
                          placeholder="例：〇〇株式会社 普通株式"
                          className="w-full px-1.5 py-1 border border-gray-200 rounded bg-white outline-none focus:border-brand-400" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={h.quantity ?? ''} onChange={e => setRows(p => p.map(x => x.id === h.id ? { ...x, quantity: e.target.value === '' ? null : Number(e.target.value) } : x))}
                          onBlur={e => save(h.id, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                          className="w-full px-1.5 py-1 text-right border border-gray-200 rounded bg-white outline-none focus:border-brand-400" />
                      </td>
                      <td className="px-2 py-1.5">
                        <MoneyInput value={h.unit_price} onCommit={v => save(h.id, { unit_price: v === '' ? null : Number(v) })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="date" value={h.base_date ?? ''} onChange={e => save(h.id, { base_date: e.target.value || null })}
                          className="w-full px-1.5 py-1 border border-gray-200 rounded bg-white outline-none focus:border-brand-400" />
                      </td>
                      <td className="px-2 py-1.5">
                        <MoneyInput value={h.amount} onCommit={v => save(h.id, { amount: v === '' ? null : Number(v) })} />
                        {h.amount == null && (h.quantity != null || h.unit_price != null) && (
                          <div className="text-right text-[10.5px] text-gray-400 tabular-nums mt-0.5">自動 {yen(holdingAmount(h))}</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="text" value={h.note ?? ''} onChange={e => setRows(p => p.map(x => x.id === h.id ? { ...x, note: e.target.value } : x))}
                          onBlur={e => save(h.id, { note: e.target.value || null })}
                          className="w-full px-1.5 py-1 border border-gray-200 rounded bg-white outline-none focus:border-brand-400" />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button type="button" onClick={() => del(h.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => add(a.id)} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
              <Plus className="w-3.5 h-3.5" />銘柄を追加
            </button>
          </div>
        )
      })}
    </div>
  )
}
