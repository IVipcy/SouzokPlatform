'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { FinancialAssetRow } from '@/types'

const ASSET_TYPES: { value: string; label: string }[] = [
  { value: '預貯金', label: '預金' },
  { value: '証券', label: '証券' },
  { value: '信託銀行', label: '信託' },
]
const SAFE_BOX = ['有', '無']

type Props = {
  caseId: string
  assets: FinancialAssetRow[]
  onRefresh?: () => void
}

/** 金融機関（預金・証券・信託）を表形式でインライン編集・行追加する（財産調査） */
export default function FinancialAssetsTable({ caseId, assets, onRefresh }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<FinancialAssetRow[]>(assets)
  const [busy, setBusy] = useState(false)

  const setLocal = (id: string, field: keyof FinancialAssetRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as FinancialAssetRow : r)))

  const commit = async (id: string, field: keyof FinancialAssetRow, value: string) => {
    const { error } = await supabase.from('financial_assets').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addRow = async () => {
    setBusy(true)
    const { data, error } = await supabase
      .from('financial_assets')
      .insert({ case_id: caseId, asset_type: '預貯金', institution_name: '' })
      .select('*')
      .single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as FinancialAssetRow])
    onRefresh?.()
  }

  const delRow = async (row: FinancialAssetRow) => {
    if (!confirm(`「${row.institution_name || '未入力'}」を削除しますか？`)) return
    const { error } = await supabase.from('financial_assets').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 780 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-2.5 py-2 text-left font-semibold w-24">カテゴリ</th>
              <th className="px-2.5 py-2 text-left font-semibold">金融機関名</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">支店</th>
              <th className="px-2.5 py-2 text-left font-semibold w-20">貸金庫</th>
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-[13px] text-gray-400">金融機関が登録されていません</td></tr>
            ) : (
              rows.map(r => (
                <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-2.5 py-1.5">
                    <select value={r.asset_type} onChange={e => { setLocal(r.id, 'asset_type', e.target.value); commit(r.id, 'asset_type', e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </td>
                  <CellInput value={r.institution_name} onChange={v => setLocal(r.id, 'institution_name', v)} onCommit={v => commit(r.id, 'institution_name', v)} placeholder="〇〇銀行" />
                  <CellInput value={r.branch_name} onChange={v => setLocal(r.id, 'branch_name', v)} onCommit={v => commit(r.id, 'branch_name', v)} placeholder="〇〇支店" />
                  <td className="px-2.5 py-1.5">
                    <select value={r.safe_deposit_box ?? ''} onChange={e => { setLocal(r.id, 'safe_deposit_box', e.target.value); commit(r.id, 'safe_deposit_box', e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {SAFE_BOX.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <CellInput value={r.notes} onChange={v => setLocal(r.id, 'notes', v)} onCommit={v => commit(r.id, 'notes', v)} placeholder="特記事項" />
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
        <Plus className="w-3.5 h-3.5" /> 金融機関を追加
      </button>
    </div>
  )
}

function CellInput({ value, onChange, onCommit, placeholder }: { value: string | null; onChange: (v: string) => void; onCommit: (v: string) => void; placeholder?: string }) {
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
