'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { SELLING_INTENTIONS, OCCUPANCY_STATUSES, PROPERTY_RANKS } from '@/lib/constants'
import type { RealEstatePropertyRow } from '@/types'

const PROPERTY_TYPES = ['戸建', 'マンション', '土地', '収益物件', 'その他']
const APPRAISAL_STATUSES = ['未対応', '対応中', '完了', '不要']

type Props = {
  caseId: string
  properties: RealEstatePropertyRow[]
  onRefresh?: () => void
}

/** 不動産を表形式でインライン編集・行追加する（財産調査） */
export default function RealEstateTable({ caseId, properties, onRefresh }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<RealEstatePropertyRow[]>(properties)
  const [busy, setBusy] = useState(false)

  const setLocal = (id: string, field: keyof RealEstatePropertyRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstatePropertyRow : r)))

  const commit = async (id: string, field: keyof RealEstatePropertyRow, value: string) => {
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addRow = async () => {
    setBusy(true)
    const { data, error } = await supabase
      .from('real_estate_properties')
      .insert({ case_id: caseId })
      .select('*')
      .single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as RealEstatePropertyRow])
    onRefresh?.()
  }

  const delRow = async (row: RealEstatePropertyRow) => {
    if (!confirm(`「${row.address || '未入力の不動産'}」を削除しますか？`)) return
    const { error } = await supabase.from('real_estate_properties').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  const SelectCell = (r: RealEstatePropertyRow, field: keyof RealEstatePropertyRow, options: readonly string[]) => (
    <td className="px-2.5 py-1.5">
      <select value={(r[field] as string) ?? ''} onChange={e => { setLocal(r.id, field, e.target.value); commit(r.id, field, e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
  )

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 900 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-2.5 py-2 text-left font-semibold w-28">物件種別</th>
              <th className="px-2.5 py-2 text-left font-semibold">所在地</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">住人</th>
              <th className="px-2.5 py-2 text-left font-semibold w-28">売却意向</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">評価ランク</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">査定状況</th>
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[13px] text-gray-400">不動産が登録されていません</td></tr>
            ) : (
              rows.map(r => (
                <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                  {SelectCell(r, 'property_type', PROPERTY_TYPES)}
                  <CellInput value={r.address} onChange={v => setLocal(r.id, 'address', v)} onCommit={v => commit(r.id, 'address', v)} placeholder="所在地" />
                  {SelectCell(r, 'resident_status', OCCUPANCY_STATUSES)}
                  {SelectCell(r, 'sale_intention', SELLING_INTENTIONS)}
                  {SelectCell(r, 'rank', PROPERTY_RANKS)}
                  {SelectCell(r, 'appraisal_status', APPRAISAL_STATUSES)}
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
        <Plus className="w-3.5 h-3.5" /> 不動産を追加
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
