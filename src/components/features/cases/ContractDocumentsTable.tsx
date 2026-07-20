'use client'

import { useState, useEffect } from 'react'
import { Trash2, Plus, Check, CloudOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { ContractDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

const DOC_STATUS = ['その場で受領', '後日郵送', '依頼者が取得', '不要']
// 区分。戸籍/財産/登記は各調査タブに「契約時受領」として受領済/未受領で表示される。
const DOC_CATEGORIES = ['契約', '戸籍', '金融', '不動産', '登記', 'その他']

// 既定の契約関連書類（行追加・削除・編集可）
// 契約時に必ずもらう4点をデフォルトに。戸籍・財産系は自由入力で任意追加。
const DEFAULT_DOCS = ['契約書', '委任状', '本人確認書類', '印鑑証明書']

type Props = {
  caseId: string
  documents: ContractDocumentRow[]
  documentReceipts?: TimelineReceipt[]
  onRefresh?: () => void
}

/**
 * 契約手続きの「契約関連書類の受け取り」表（行＝1書類）。
 * 受領状況・到着予定日を管理し、書類受信簿で受信すると到着日が入り「受信済」になる。
 * （JSONBではなくテーブルなので、受信簿から linked_kind='contract_doc' で各行に紐づく）
 */
export default function ContractDocumentsTable({ caseId, documents, documentReceipts = [], onRefresh }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<ContractDocumentRow[]>(documents)
  // 契約書類→受信簿アイテムの「アップ済」状況。linked_kind='contract_doc' で各契約書類行に紐づく。
  const uploadedByContractDoc = new Map<string, boolean>()
  for (const r of documentReceipts) {
    for (const it of (r.items ?? [])) {
      if (it.linked_kind === 'contract_doc' && it.linked_id && it.uploaded_at) uploadedByContractDoc.set(it.linked_id, true)
    }
  }
  const [busy, setBusy] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [recvFilter, setRecvFilter] = useState<'all' | 'received' | 'pending'>('all')
  // 受信簿で受領→到着日が入った等、props 更新を反映（常時マウントされる画面対策）
  useEffect(() => { setRows(documents) }, [documents])

  // 「不要」（受け取らない書類）は既定で非表示。トグルで表示できる。
  const hiddenCount = rows.filter(r => r.status === '不要').length
  const baseRows = showHidden ? rows : rows.filter(r => r.status !== '不要')
  // 受領済(到着日あり) / 未受領 フィルタ
  const visibleRows = recvFilter === 'all' ? baseRows
    : recvFilter === 'received' ? baseRows.filter(r => r.arrival_date)
    : baseRows.filter(r => !r.arrival_date)

  const setLocal = (id: string, field: keyof ContractDocumentRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as ContractDocumentRow : r)))

  const commit = async (id: string, field: keyof ContractDocumentRow, value: string) => {
    const { error } = await supabase.from('contract_documents').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    // 受領判定（status / arrival_date）に関わる変更は、受託フロー・ナビをその場で更新させるため親に通知。
    if (field === 'status' || field === 'arrival_date') onRefresh?.()
  }
  const saveNow = (id: string, field: keyof ContractDocumentRow, value: string) => { setLocal(id, field, value); commit(id, field, value) }

  // 受領状況を「その場で受領」にしたら、到着日が未入力なら当日で埋めて受領済にする。
  const onStatusChange = async (row: ContractDocumentRow, value: string) => {
    setLocal(row.id, 'status', value)
    if (value === 'その場で受領' && !row.arrival_date) {
      const today = new Date().toISOString().slice(0, 10)
      setLocal(row.id, 'arrival_date', today)
      const { error } = await supabase.from('contract_documents').update({ status: value, arrival_date: today }).eq('id', row.id)
      if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
      onRefresh?.()
    } else {
      commit(row.id, 'status', value)
    }
  }

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
    const payload = DEFAULT_DOCS.map((name, i) => ({ case_id: caseId, name, category: '契約', sort_order: rows.length + i }))
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
      {/* 受領済 / 未受領 フィルタ */}
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[12px] font-semibold text-gray-500 mr-0.5">表示</span>
        {([['all', 'すべて'], ['pending', '未受領'], ['received', '受領済']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setRecvFilter(key)}
            className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${recvFilter === key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 960 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-2.5 py-2 text-left font-semibold w-56">到着物</th>
              <th className="px-2.5 py-2 text-left font-semibold w-28">区分</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">受領状況</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">到着日</th>
              <th className="px-2.5 py-2 text-left font-semibold w-20">受信</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">アップ状況</th>
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[13px] text-gray-400">契約関連の到着物が登録されていません</td></tr>
            ) : (
              visibleRows.map((r, i) => (
                <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <Cell value={r.name} onCommit={v => saveNow(r.id, 'name', v)} placeholder="到着物名" />
                  <td className="px-2.5 py-1.5">
                    <select value={r.category ?? ''} onChange={e => saveNow(r.id, 'category', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {DOC_CATEGORIES.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-2.5 py-1.5">
                    <select value={r.status ?? ''} onChange={e => onStatusChange(r, e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {DOC_STATUS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <DateCell value={r.arrival_date} onCommit={v => commit(r.id, 'arrival_date', v)} />
                  <td className="px-2.5 py-1.5">
                    {r.arrival_date
                      ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">受信済</span>
                      : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">未受信</span>}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {!r.arrival_date
                      ? <span className="text-[11px] text-gray-300">—</span>
                      : (uploadedByContractDoc.get(r.id) || r.file_path)
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><Check className="w-3 h-3" strokeWidth={2.5} />アップ済</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"><CloudOff className="w-3 h-3" strokeWidth={2} />未アップ</span>}
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
          <Plus className="w-3.5 h-3.5" /> 到着物を追加
        </button>
        {rows.length === 0 && (
          <button type="button" onClick={addDefaults} disabled={busy} className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-brand-700 disabled:opacity-50">
            既定の到着物をまとめて追加
          </button>
        )}
        {hiddenCount > 0 && (
          <button type="button" onClick={() => setShowHidden(v => !v)} className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-400 hover:text-gray-600">
            {showHidden ? `不要 ${hiddenCount}件を隠す` : `不要 ${hiddenCount}件を表示`}
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        受領状況「不要」にした到着物は非表示になります。「後日郵送 / 依頼者が取得」は案件進捗の「契約処理の残」に表示。届いたら「到着物受信簿」から各行に紐づけて登録すると到着日が入り受信済になります。<br />区分「戸籍 / 財産 / 登記」にすると、相続人調査・財産調査・相続登記の各タブに「契約時にお客様から受領した到着物」として受領済/未受領が表示されます。
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
