'use client'

import { useState } from 'react'
import { Trash2, Plus, DownloadCloud } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { DIVISION_METHODS } from '@/lib/constants'
import { MoneyInput } from './FinancialAssetsTable'
import type { DivisionDetailRow, HeirRow, AssetInventoryRow } from '@/types'

type Props = {
  caseId: string
  details: DivisionDetailRow[]
  heirs: HeirRow[]
  assetInventory?: AssetInventoryRow[]
  onRefresh?: () => void
}

/** 分割内容を表形式でインライン編集・行追加する。取得者は相続人の選択リスト。 */
export default function DivisionDetailsTable({ caseId, details, heirs, assetInventory = [], onRefresh }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<DivisionDetailRow[]>(details)
  const [busy, setBusy] = useState(false)
  const heirNames = heirs.map(h => h.name).filter(Boolean)

  // 財産目録から「財産区分・金額」をコピー反映（未登録分のみ）
  const importInventory = async () => {
    const existing = new Set(rows.map(r => `${r.asset_category}|${r.amount ?? ''}`))
    const news = assetInventory
      .filter(a => !existing.has(`${a.detail}|${a.amount ?? ''}`))
      .map(a => ({ case_id: caseId, asset_category: a.detail ?? a.asset_class ?? '', amount: a.amount }))
    if (news.length === 0) { showToast('取り込む目録がありません（財産目録を作成してください）', 'info'); return }
    const { data, error } = await supabase.from('division_details').insert(news).select('*')
    if (error) { showToast(`取込に失敗: ${error.message}`, 'error'); return }
    setRows(prev => [...prev, ...((data ?? []) as DivisionDetailRow[])])
    onRefresh?.()
  }

  const setLocal = (id: string, field: keyof DivisionDetailRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as DivisionDetailRow : r)))

  const commit = async (id: string, field: keyof DivisionDetailRow, value: string) => {
    const { error } = await supabase.from('division_details').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addRow = async () => {
    setBusy(true)
    const { data, error } = await supabase.from('division_details').insert({ case_id: caseId, asset_category: '' }).select('*').single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as DivisionDetailRow])
    onRefresh?.()
  }

  const delRow = async (row: DivisionDetailRow) => {
    if (!confirm(`「${row.asset_category || '未入力'}」を削除しますか？`)) return
    const { error } = await supabase.from('division_details').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  return (
    <div>
      <div className="mb-2">
        <button type="button" onClick={importInventory} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50"><DownloadCloud className="w-3.5 h-3.5" /> 財産目録から取込</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 940 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-2.5 py-2 text-left font-semibold">財産区分</th>
              <th className="px-2.5 py-2 text-right font-semibold w-32">金額</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">分割方法</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">取得者</th>
              <th className="px-2.5 py-2 text-left font-semibold w-28">取得割合</th>
              <th className="px-2.5 py-2 text-left font-semibold">確定内容</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[13px] text-gray-400">分割内容が登録されていません</td></tr>
            ) : (
              rows.map(r => (
                <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                  <Cell value={r.asset_category} onChange={v => setLocal(r.id, 'asset_category', v)} onCommit={v => commit(r.id, 'asset_category', v)} placeholder="不動産, 預貯金 等" />
                  <td className="px-2.5 py-1.5"><MoneyInput value={r.amount} onCommit={v => { setLocal(r.id, 'amount', (v === '' ? null : Number(v)) as unknown as string); commit(r.id, 'amount', v) }} /></td>
                  <td className="px-2.5 py-1.5">
                    <select value={r.division_method ?? ''} onChange={e => { setLocal(r.id, 'division_method', e.target.value); commit(r.id, 'division_method', e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {DIVISION_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td className="px-2.5 py-1.5">
                    <select value={r.recipient ?? ''} onChange={e => { setLocal(r.id, 'recipient', e.target.value); commit(r.id, 'recipient', e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {/* 既存の取得者が相続人一覧に無い場合も選べるように残す */}
                      {r.recipient && !heirNames.includes(r.recipient) && <option value={r.recipient}>{r.recipient}</option>}
                      {heirNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                  <Cell value={r.share_ratio} onChange={v => setLocal(r.id, 'share_ratio', v)} onCommit={v => commit(r.id, 'share_ratio', v)} placeholder="1/2, 100% 等" />
                  <Cell value={r.description} onChange={v => setLocal(r.id, 'description', v)} onCommit={v => commit(r.id, 'description', v)} placeholder="確定内容" />
                  <td className="px-2.5 py-1.5 text-center">
                    <button type="button" onClick={() => delRow(r)} className="text-gray-300 hover:text-red-500 transition-colors" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow} disabled={busy} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
        <Plus className="w-3.5 h-3.5" /> 分割内容を追加
      </button>
    </div>
  )
}

function Cell({ value, onChange, onCommit, placeholder }: { value: string | null; onChange: (v: string) => void; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="text"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onCommit(e.target.value)}
        placeholder={placeholder}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
      />
    </td>
  )
}
