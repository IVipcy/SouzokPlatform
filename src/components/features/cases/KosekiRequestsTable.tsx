'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { KosekiRequestRow } from '@/types'

type Props = {
  caseId: string
  requests: KosekiRequestRow[]
  onRefresh?: () => void
}

/**
 * 戸籍請求を「請求単位」でインライン編集・行追加する表。
 * どこに(request_to)・誰の(target_person)・何を(doc_types)・何のために(purpose)
 * いつ請求したか(request_date)・いつ届いたか(arrival_date) を管理する。
 */
export default function KosekiRequestsTable({ caseId, requests, onRefresh }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<KosekiRequestRow[]>(requests)
  const [busy, setBusy] = useState(false)

  const setLocal = (id: string, field: keyof KosekiRequestRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as KosekiRequestRow : r)))

  const commit = async (id: string, field: keyof KosekiRequestRow, value: string) => {
    const { error } = await supabase.from('koseki_requests').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addRow = async () => {
    setBusy(true)
    const { data, error } = await supabase
      .from('koseki_requests')
      .insert({ case_id: caseId, sort_order: rows.length })
      .select('*')
      .single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as KosekiRequestRow])
    onRefresh?.()
  }

  const delRow = async (row: KosekiRequestRow) => {
    if (!confirm(`「${row.request_to || '未入力の戸籍請求'}」を削除しますか？`)) return
    const { error } = await supabase.from('koseki_requests').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 1000 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-2.5 py-2 text-left font-semibold w-44">請求先</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">対象者</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">種別</th>
              <th className="px-2.5 py-2 text-left font-semibold">取得目的</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">請求日</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">到着日</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[13px] text-gray-400">戸籍請求が登録されていません</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <Cell value={r.request_to} onChange={v => setLocal(r.id, 'request_to', v)} onCommit={v => commit(r.id, 'request_to', v)} placeholder="例: 名古屋市中区役所" />
                  <Cell value={r.target_person} onChange={v => setLocal(r.id, 'target_person', v)} onCommit={v => commit(r.id, 'target_person', v)} placeholder="誰の戸籍か" />
                  <Cell value={r.doc_types} onChange={v => setLocal(r.id, 'doc_types', v)} onCommit={v => commit(r.id, 'doc_types', v)} placeholder="戸籍/除籍/原戸籍 等" />
                  <Cell value={r.purpose} onChange={v => setLocal(r.id, 'purpose', v)} onCommit={v => commit(r.id, 'purpose', v)} placeholder="相続登記/遺産分割 等" />
                  <DateCell value={r.request_date} onCommit={v => commit(r.id, 'request_date', v)} />
                  <DateCell value={r.arrival_date} onCommit={v => commit(r.id, 'arrival_date', v)} />
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
        <Plus className="w-3.5 h-3.5" /> 戸籍請求を追加
      </button>
      <p className="mt-2 text-[11px] text-gray-400">
        書類が届いたら「書類受信簿」から各行に紐づけて登録すると、到着日が自動反映されます。
      </p>
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

function DateCell({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="date"
        defaultValue={value ?? ''}
        onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
      />
    </td>
  )
}
