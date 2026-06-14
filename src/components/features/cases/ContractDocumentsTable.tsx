'use client'

import { useState, useEffect } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { ContractDocumentRow } from '@/types'

const DOC_STATUS = ['その場で受領', '後日郵送', '依頼者が取得', '不要']

// 既定の契約関連書類（行追加・削除・編集可）
const DEFAULT_DOCS = [
  '契約書', '委任状（戸籍用・認印）', '委任状（財産調査用・実印）',
  '戸籍（依頼者持参分）', '通帳・証書', '印鑑証明書', '本人確認書類',
]

type Props = {
  caseId: string
  documents: ContractDocumentRow[]
  onRefresh?: () => void
}

/**
 * 契約手続きの「契約関連書類の受け取り」表（行＝1書類）。
 * 受領状況・到着予定日を管理し、書類受信簿で受信すると到着日が入り「受信済」になる。
 * （JSONBではなくテーブルなので、受信簿から linked_kind='contract_doc' で各行に紐づく）
 */
export default function ContractDocumentsTable({ caseId, documents, onRefresh }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<ContractDocumentRow[]>(documents)
  const [busy, setBusy] = useState(false)
  // 受信簿で受領→到着日が入った等、props 更新を反映（常時マウントされる画面対策）
  useEffect(() => { setRows(documents) }, [documents])

  const setLocal = (id: string, field: keyof ContractDocumentRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as ContractDocumentRow : r)))

  const commit = async (id: string, field: keyof ContractDocumentRow, value: string) => {
    const { error } = await supabase.from('contract_documents').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }
  const saveNow = (id: string, field: keyof ContractDocumentRow, value: string) => { setLocal(id, field, value); commit(id, field, value) }

  const addRow = async (name = '') => {
    setBusy(true)
    const { data, error } = await supabase
      .from('contract_documents')
      .insert({ case_id: caseId, name: name || null, sort_order: rows.length })
      .select('*')
      .single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as ContractDocumentRow])
    onRefresh?.()
  }

  const addDefaults = async () => {
    setBusy(true)
    const payload = DEFAULT_DOCS.map((name, i) => ({ case_id: caseId, name, sort_order: rows.length + i }))
    const { data, error } = await supabase.from('contract_documents').insert(payload).select('*')
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, ...(data as ContractDocumentRow[])])
    onRefresh?.()
  }

  const delRow = async (row: ContractDocumentRow) => {
    const { error } = await supabase.from('contract_documents').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 880 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-2.5 py-2 text-left font-semibold w-56">書類</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">受領状況</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">到着予定日</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">到着日</th>
              <th className="px-2.5 py-2 text-left font-semibold w-20">受信</th>
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[13px] text-gray-400">契約関連書類が登録されていません</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <Cell value={r.name} onCommit={v => saveNow(r.id, 'name', v)} placeholder="書類名" />
                  <td className="px-2.5 py-1.5">
                    <select value={r.status ?? ''} onChange={e => saveNow(r.id, 'status', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {DOC_STATUS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <DateCell value={r.expected_arrival_date} onCommit={v => commit(r.id, 'expected_arrival_date', v)} />
                  <DateCell value={r.arrival_date} onCommit={v => commit(r.id, 'arrival_date', v)} />
                  <td className="px-2.5 py-1.5">
                    {r.arrival_date
                      ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">受信済</span>
                      : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">未受信</span>}
                  </td>
                  <Cell value={r.notes} onCommit={v => saveNow(r.id, 'notes', v)} placeholder="例：実印分は後日、料金 等" />
                  <td className="px-2.5 py-1.5 text-center">
                    <button type="button" onClick={() => delRow(r)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => addRow()} disabled={busy} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" /> 書類を追加
        </button>
        {rows.length === 0 && (
          <button type="button" onClick={addDefaults} disabled={busy} className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-brand-700 disabled:opacity-50">
            既定の書類をまとめて追加
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        受領状況「後日郵送 / 依頼者が取得」は案件進捗の「契約処理の残」に表示。書類が届いたら「書類受信簿」から各行に紐づけて登録すると到着日が入り受信済になります。
      </p>
    </div>
  )
}

function Cell({ value, onCommit, placeholder }: { value: string | null; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="text"
        defaultValue={value ?? ''}
        onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }}
        placeholder={placeholder}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
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
