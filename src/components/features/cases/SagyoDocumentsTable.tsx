'use client'

import { useState, useEffect } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { SagyoDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

const STATUS = ['未請求', '請求済', '受領', '不要']

type Props = {
  caseId: string
  gyomu: string
  sagyou: string
  /** この作業に紐づく書類（親で (gyomu, sagyou) に絞って渡す）。 */
  documents: SagyoDocumentRow[]
  /** 受信簿（受領連動の選択肢）。 */
  receipts: TimelineReceipt[]
  onRefresh?: () => void
}

/**
 * 作業（業務×作業名）に紐づく「必要書類・請求・受領」表（行＝1書類）。
 * 受領は受信簿(document_receipts)を選ぶと receipt_id でFK連動し受領日が入る（手入力も可）。
 * データは sagyo_documents テーブル（migration 091）。作業は自然キー (case_id, gyomu, sagyou)。
 */
export default function SagyoDocumentsTable({ caseId, gyomu, sagyou, documents, receipts, onRefresh }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<SagyoDocumentRow[]>(documents)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setRows(documents) }, [documents])

  const receiptLabel = (r: TimelineReceipt) => {
    const d = r.received_date ? r.received_date.slice(5).replace('-', '/') : '日付未定'
    const first = r.items?.slice().sort((a, b) => a.sort_order - b.sort_order)[0]?.item_name
    return first ? `${d}・${first}` : d
  }

  const setLocal = (id: string, patch: Partial<SagyoDocumentRow>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))

  const commit = async (id: string, patch: Partial<SagyoDocumentRow>) => {
    const { error } = await supabase.from('sagyo_documents').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }
  const saveNow = (id: string, patch: Partial<SagyoDocumentRow>) => { setLocal(id, patch); commit(id, patch) }

  // 受信簿を選ぶ → receipt_id と受領日をセット（外すと両方クリア）
  const linkReceipt = (id: string, receiptId: string) => {
    if (!receiptId) { saveNow(id, { receipt_id: null, status: rows.find(r => r.id === id)?.status ?? null }); return }
    const rec = receipts.find(r => r.id === receiptId)
    saveNow(id, { receipt_id: receiptId, received_date: rec?.received_date ?? null, status: '受領' })
  }

  const addRow = async () => {
    setBusy(true)
    const { data, error } = await supabase
      .from('sagyo_documents')
      .insert({ case_id: caseId, gyomu, sagyou, sort_order: rows.length, status: '未請求' })
      .select('*')
      .single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as SagyoDocumentRow])
    onRefresh?.()
  }

  const delRow = async (row: SagyoDocumentRow) => {
    const { error } = await supabase.from('sagyo_documents').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  return (
    <div className="pl-1">
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 820 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[11.5px] text-gray-500">
              <th className="px-2.5 py-1.5 text-left font-semibold w-52">書類</th>
              <th className="px-2.5 py-1.5 text-left font-semibold w-40">請求先</th>
              <th className="px-2.5 py-1.5 text-left font-semibold w-32">請求日</th>
              <th className="px-2.5 py-1.5 text-left font-semibold w-32">受領日</th>
              <th className="px-2.5 py-1.5 text-left font-semibold w-44">受信簿</th>
              <th className="px-2.5 py-1.5 text-left font-semibold w-24">状況</th>
              <th className="px-2.5 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-3 text-center text-[12px] text-gray-400">必要書類はまだありません</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <TextCell value={r.name} onCommit={v => saveNow(r.id, { name: v || null })} placeholder="書類名" />
                  <TextCell value={r.requested_to} onCommit={v => saveNow(r.id, { requested_to: v || null })} placeholder="請求先" />
                  <DateCell value={r.requested_date} onCommit={v => saveNow(r.id, { requested_date: v || null })} />
                  <DateCell value={r.received_date} onCommit={v => saveNow(r.id, { received_date: v || null })} />
                  <td className="px-2.5 py-1.5">
                    <select
                      value={r.receipt_id ?? ''}
                      onChange={e => linkReceipt(r.id, e.target.value)}
                      className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500"
                    >
                      <option value="">未連動</option>
                      {receipts.map(rec => <option key={rec.id} value={rec.id}>{receiptLabel(rec)}</option>)}
                    </select>
                  </td>
                  <td className="px-2.5 py-1.5">
                    <select value={r.status ?? ''} onChange={e => saveNow(r.id, { status: e.target.value || null })} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {STATUS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-2.5 py-1.5 text-center">
                    <button type="button" onClick={() => delRow(r)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow} disabled={busy} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
        <Plus className="w-3.5 h-3.5" /> 書類を追加
      </button>
    </div>
  )
}

function TextCell({ value, onCommit, placeholder }: { value: string | null; onCommit: (v: string) => void; placeholder?: string }) {
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
