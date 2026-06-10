'use client'

import { useState } from 'react'
import { Trash2, Plus, ChevronRight, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { FieldGrid, InlineSelect, InlineEdit, InlineTextarea } from '@/components/ui/InlineFields'
import { KOSEKI_REQUEST_REASONS, KOSEKI_REQUEST_TYPES, KOSEKI_PURPOSES } from '@/lib/constants'
import type { KosekiRequestRow } from '@/types'

type Props = {
  caseId: string
  requests: KosekiRequestRow[]
  onRefresh?: () => void
  // オーダーシート埋め込み時は進捗列（請求日・到着日）を出さない
  orderSheetMode?: boolean
}

/**
 * 戸籍請求を「請求単位」でインライン編集・行追加する表。
 * 1行=1戸籍請求。請求先・対象者・種別・取得目的を主列に、請求理由・その他・特記は
 * 行展開で編集する。請求日・到着日は実務タブ（オーダーシート後）でのみ表示する。
 */
export default function KosekiRequestsTable({ caseId, requests, onRefresh, orderSheetMode = false }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<KosekiRequestRow[]>(requests)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const progressMode = !orderSheetMode

  const setLocal = (id: string, field: keyof KosekiRequestRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as KosekiRequestRow : r)))

  const commit = async (id: string, field: keyof KosekiRequestRow, value: string) => {
    const { error } = await supabase.from('koseki_requests').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const saveField = async (id: string, field: keyof KosekiRequestRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as KosekiRequestRow : r)))
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

  const colCount = progressMode ? 8 : 6

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: progressMode ? 1000 : 720 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-1 py-2 w-7" />
              <th className="px-2.5 py-2 text-left font-semibold w-44">請求先</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">対象者</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">種別</th>
              <th className="px-2.5 py-2 text-left font-semibold">取得目的</th>
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-32">請求日</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-32">到着日</th>}
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-[13px] text-gray-400">戸籍請求が登録されていません</td></tr>
            ) : (
              rows.map((r, i) => (
                <Row key={r.id} r={r} odd={i % 2 === 1} progressMode={progressMode}
                  open={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                  setLocal={setLocal} commit={commit} saveField={saveField}
                  onDelete={() => delRow(r)} colCount={colCount} />
              ))
            )}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow} disabled={busy} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
        <Plus className="w-3.5 h-3.5" /> 戸籍請求を追加
      </button>
      <p className="mt-2 text-[11px] text-gray-400">
        行を開くと請求理由・特記事項を編集できます。{progressMode ? '書類が届いたら「書類受信簿」から各行に紐づけて登録すると到着日が自動反映されます。' : ''}
      </p>
    </div>
  )
}

function Row({ r, odd, progressMode, open, onToggle, setLocal, commit, saveField, onDelete, colCount }: {
  r: KosekiRequestRow
  odd: boolean
  progressMode: boolean
  open: boolean
  onToggle: () => void
  setLocal: (id: string, field: keyof KosekiRequestRow, value: string) => void
  commit: (id: string, field: keyof KosekiRequestRow, value: string) => void
  saveField: (id: string, field: keyof KosekiRequestRow, value: unknown) => Promise<void>
  onDelete: () => void
  colCount: number
}) {
  return (
    <>
      <tr className={`border-b border-gray-100 ${odd ? 'bg-gray-50/40' : ''}`}>
        <td className="px-1 py-1.5 text-center">
          <button type="button" onClick={onToggle} className="text-gray-400 hover:text-brand-600" title="請求理由・特記">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <Cell value={r.request_to} onChange={v => setLocal(r.id, 'request_to', v)} onCommit={v => commit(r.id, 'request_to', v)} placeholder="例: 名古屋市中区役所" />
        <Cell value={r.target_person} onChange={v => setLocal(r.id, 'target_person', v)} onCommit={v => commit(r.id, 'target_person', v)} placeholder="誰の戸籍か" />
        <SelectCell value={r.doc_types} options={KOSEKI_REQUEST_TYPES} onSave={v => saveField(r.id, 'doc_types', v)} />
        <SelectCell value={r.purpose} options={KOSEKI_PURPOSES} onSave={v => saveField(r.id, 'purpose', v)} />
        {progressMode && <DateCell value={r.request_date} onCommit={v => commit(r.id, 'request_date', v)} />}
        {progressMode && <DateCell value={r.arrival_date} onCommit={v => commit(r.id, 'arrival_date', v)} />}
        <td className="px-2.5 py-1.5 text-center">
          <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-gray-100 bg-gray-50/40">
          <td colSpan={colCount} className="px-4 py-3">
            <FieldGrid>
              <InlineSelect label="戸籍請求理由" value={r.request_reason} options={[...KOSEKI_REQUEST_REASONS]} onSave={v => saveField(r.id, 'request_reason', v)} fullWidth />
              <InlineEdit label="戸籍請求理由（その他）" value={r.request_reason_other} onSave={v => saveField(r.id, 'request_reason_other', v)} fullWidth />
              <InlineTextarea label="戸籍特記事項" value={r.notes} onSave={v => saveField(r.id, 'notes', v)} fullWidth />
            </FieldGrid>
          </td>
        </tr>
      )}
    </>
  )
}

function SelectCell({ value, options, onSave }: { value: string | null; options: readonly string[]; onSave: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <select value={value ?? ''} onChange={e => onSave(e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
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
