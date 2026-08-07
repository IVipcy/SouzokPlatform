'use client'

// 財産目録（財産調査タブのサブタブ）。
// 預金/証券/信託(financial_assets.balance_amount)・不動産(real_estate.appraisal_value)・
// その他財産/相続債務/その他費用(case_other_assets)から取込み、手動で行を足して編集できる。
// 分類ごとに小計を出し、プラス財産合計・控除・正味財産をまとめて表示する。
// 合計は協議書「分割内容」・精算書「収入」へ反映する（精算書の収入はプラス財産のみ）。

import { useState } from 'react'
import { Trash2, Plus, DownloadCloud } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { MoneyInput } from './FinancialAssetsTable'
import {
  INVENTORY_CLASSES, INVENTORY_LEGACY_CLASSES, isNegativeClass,
  inventoryClassOfAsset, inventoryClassOfProperty,
} from '@/lib/constants'
import type { AssetInventoryRow, FinancialAssetRow, RealEstatePropertyRow, CaseOtherAssetRow } from '@/types'

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()

export default function InventoryTab({ caseId, rows: initial, financialAssets, properties, otherAssets = [], onRefresh }: {
  caseId: string
  rows: AssetInventoryRow[]
  financialAssets: FinancialAssetRow[]
  properties: RealEstatePropertyRow[]
  otherAssets?: CaseOtherAssetRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<AssetInventoryRow[]>(initial)
  const [busy, setBusy] = useState(false)

  // 分類ごとにまとめる。未知の区分（旧データ・手入力）は最後にその区分のまま並べる。
  const classOrder = [...INVENTORY_CLASSES, ...INVENTORY_LEGACY_CLASSES] as readonly string[]
  const usedClasses = Array.from(new Set(rows.map(r => r.asset_class ?? '（未分類）')))
    .sort((a, b) => {
      const ia = classOrder.indexOf(a), ib = classOrder.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
  const sumOf = (cls: string) => rows.filter(r => (r.asset_class ?? '（未分類）') === cls).reduce((s, r) => s + (r.amount ?? 0), 0)
  const positive = rows.filter(r => !isNegativeClass(r.asset_class)).reduce((s, r) => s + (r.amount ?? 0), 0)
  const negative = rows.filter(r => isNegativeClass(r.asset_class)).reduce((s, r) => s + (r.amount ?? 0), 0)

  const setLocal = (id: string, field: keyof AssetInventoryRow, value: unknown) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } as AssetInventoryRow : r))
  const commit = async (id: string, field: keyof AssetInventoryRow, value: unknown) => {
    const { error } = await supabase.from('asset_inventory').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addRow = async (cls?: string) => {
    setBusy(true)
    const { data, error } = await supabase.from('asset_inventory').insert({ case_id: caseId, asset_class: cls ?? '預金', sort_order: rows.length }).select('*').single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as AssetInventoryRow])
  }

  const delRow = async (id: string) => {
    const { error } = await supabase.from('asset_inventory').delete().eq('id', id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  // 財産表（金融資産・不動産・その他）の金額を取り込む。既存の同名行は作らず、未登録分だけ追加。
  const importFromAssets = async () => {
    setBusy(true)
    // 旧区分（金融/不動産）で取り込み済みの行があるため、詳細だけでも重複判定する。
    const existingKeys = new Set(rows.map(r => `${r.asset_class}|${r.detail}`))
    const existingDetails = new Set(rows.map(r => (r.detail ?? '').trim()).filter(Boolean))
    const newRows: Array<{ case_id: string; asset_class: string; detail: string; amount: number | null; sort_order: number }> = []
    let order = rows.length
    const push = (asset_class: string, detail: string, amount: number | null) => {
      if (existingKeys.has(`${asset_class}|${detail}`) || existingDetails.has(detail.trim())) return
      existingKeys.add(`${asset_class}|${detail}`); existingDetails.add(detail.trim())
      newRows.push({ case_id: caseId, asset_class, detail, amount, sort_order: order++ })
    }
    // 財産目録へ反映するのは「確定済」（管理担当が残高・評価額を確定したもの）のみ。
    for (const a of financialAssets) {
      if (!a.balance_confirmed || a.balance_amount == null) continue
      const detail = [a.institution_name, a.branch_name].filter(Boolean).join(' ') || a.asset_type || '金融資産'
      push(inventoryClassOfAsset(a.asset_type), detail, a.balance_amount)
    }
    for (const p of properties) {
      if (!p.confirmed || p.appraisal_value == null) continue
      const detail = p.address || p.property_type || '不動産'
      push(inventoryClassOfProperty(p.property_type), detail, p.appraisal_value)
    }
    // その他財産・相続債務・その他費用は「確定済」の概念が無いので、金額が入っていれば取り込む。
    for (const o of otherAssets) {
      if (o.amount == null) continue
      push(o.kind, o.label || o.kind, o.amount)
    }
    if (newRows.length === 0) { setBusy(false); showToast('取り込む金額がありません（各タブで残高・評価額を入力し「確定済」にしてください）', 'info'); return }
    const { data, error } = await supabase.from('asset_inventory').insert(newRows).select('*')
    setBusy(false)
    if (error) { showToast(`取込に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => [...prev, ...((data ?? []) as AssetInventoryRow[])])
    showToast(`${newRows.length}件を取り込みました`, 'success')
    onRefresh?.()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={importFromAssets} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50 disabled:opacity-50">
          <DownloadCloud className="w-3.5 h-3.5" /> 財産表から取込
        </button>
        <span className="text-[11px] text-gray-400">各タブで「確定済」にした預金・証券・信託の残高、不動産の評価額、その他財産／相続債務／その他費用を取り込みます</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 640 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-2.5 py-2 text-left font-semibold w-40">財産区分</th>
              <th className="px-2.5 py-2 text-left font-semibold">詳細</th>
              <th className="px-2.5 py-2 text-right font-semibold w-40">金額</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr><td colSpan={4} className="px-3 py-6 text-center text-[13px] text-gray-400">目録がありません。「財産表から取込」または手動で追加してください。</td></tr>
            </tbody>
          ) : usedClasses.map(cls => {
            const neg = isNegativeClass(cls)
            const groupRows = rows.filter(r => (r.asset_class ?? '（未分類）') === cls)
            return (
              <tbody key={cls}>
                <tr className={neg ? 'bg-red-50/60' : 'bg-gray-50'}>
                  <td colSpan={4} className={`px-2.5 py-1.5 text-[11.5px] font-semibold ${neg ? 'text-red-800' : 'text-gray-600'}`}>
                    {cls}
                    <span className="ml-2 font-normal text-gray-400">{groupRows.length}件</span>
                  </td>
                </tr>
                {groupRows.map(r => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="px-2.5 py-1.5">
                      <select value={r.asset_class ?? ''} onChange={e => { setLocal(r.id, 'asset_class', e.target.value); commit(r.id, 'asset_class', e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                        <option value="">—</option>
                        {INVENTORY_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                        <optgroup label="旧区分">
                          {INVENTORY_LEGACY_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                        </optgroup>
                      </select>
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input type="text" defaultValue={r.detail ?? ''} onBlur={e => commit(r.id, 'detail', e.target.value)} placeholder="詳細（金融機関名・所在地・品目 など）" className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
                    </td>
                    <td className="px-2.5 py-1.5"><MoneyInput value={r.amount} onCommit={v => { setLocal(r.id, 'amount', v === '' ? null : Number(v)); commit(r.id, 'amount', v) }} /></td>
                    <td className="px-2.5 py-1.5 text-center"><button type="button" onClick={() => delRow(r.id)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
                <tr className="border-b border-gray-200">
                  <td className="px-2.5 py-1.5 text-[11.5px] text-gray-500" colSpan={2}>{cls} 小計</td>
                  <td className={`px-2.5 py-1.5 text-right tabular-nums text-[12.5px] font-semibold ${neg ? 'text-red-700' : 'text-gray-700'}`}>
                    {neg ? `− ${yen(sumOf(cls))}` : yen(sumOf(cls))}
                  </td>
                  <td />
                </tr>
              </tbody>
            )
          })}
          <tfoot>
            <tr className="border-t border-brand-200 bg-brand-50/40 font-semibold text-brand-800">
              <td className="px-2.5 py-2" colSpan={2}>プラス財産 合計</td>
              <td className="px-2.5 py-2 text-right tabular-nums">{yen(positive)}</td>
              <td />
            </tr>
            {negative > 0 && (
              <>
                <tr className="bg-red-50/40 font-semibold text-red-800">
                  <td className="px-2.5 py-2" colSpan={2}>控除（相続債務・その他費用）</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">− {yen(negative)}</td>
                  <td />
                </tr>
                <tr className="border-t border-brand-300 bg-brand-50/70 font-bold text-brand-900">
                  <td className="px-2.5 py-2" colSpan={2}>正味財産</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{yen(positive - negative)}</td>
                  <td />
                </tr>
              </>
            )}
          </tfoot>
        </table>
      </div>
      <button type="button" onClick={() => addRow()} disabled={busy} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
        <Plus className="w-3.5 h-3.5" /> 行を追加
      </button>
      <p className="text-[11px] text-gray-400">※ 精算書の「収入」に取り込まれるのはプラス財産だけです（相続債務・その他費用は遺産分割時の精算で扱います）。</p>
    </div>
  )
}
