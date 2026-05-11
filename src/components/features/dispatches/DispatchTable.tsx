'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Upload, FileText, ExternalLink, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { DISPATCH_DOCUMENT_NAMES } from '@/lib/constants'
import type { DocumentDispatchRow } from '@/types'

const ACCEPTED_TYPES = 'application/pdf,image/jpeg,image/png,image/jpg'
const ACCEPTED_EXT_LABEL = 'PDF / JPG / PNG'

type Props = {
  caseId: string
  rows: DocumentDispatchRow[]
  /** セクションタイトル（指定すると | アクセント付きヘッダー行を表示） */
  title?: string
  /** タイトル右の補足文 */
  subtitle?: string
}

export default function DispatchTable({ caseId, rows, title, subtitle }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const supabase = createClient()

  const refresh = () => startTransition(() => router.refresh())

  const handleAdd = async () => {
    setAdding(true)
    try {
      const { error } = await supabase.from('document_dispatches').insert({
        case_id: caseId,
        document_name: 'その他',
        quantity: 1,
      })
      if (error) throw error
      refresh()
    } catch (e) {
      console.error(e)
      showToast('追加に失敗しました', 'error')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {title && (
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
          <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
          {subtitle && <span className="text-[12px] font-normal text-gray-400">{subtitle}</span>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <colgroup>
            <col style={{ width: 200 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 50 }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-[12px]">
              <th className="px-3 py-2 text-left font-semibold">書類名</th>
              <th className="px-3 py-2 text-left font-semibold">発送日</th>
              <th className="px-3 py-2 text-left font-semibold">発送先</th>
              <th className="px-3 py-2 text-right font-semibold">通数</th>
              <th className="px-3 py-2 text-left font-semibold">届いた日付</th>
              <th className="px-3 py-2 text-left font-semibold">受領書類</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-[13px]">
                  まだ書類の発着記録はありません。下の「+ 行を追加」から登録してください。
                </td>
              </tr>
            )}
            {rows.map(r => (
              <DispatchRow key={r.id} row={r} onChanged={refresh} supabase={supabase} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50">
        <button
          onClick={handleAdd}
          disabled={adding}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-50"
        >
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          行を追加
        </button>
        <span className="ml-3 text-[12px] text-gray-400">
          各セルをクリックして編集・受領書類は {ACCEPTED_EXT_LABEL} をアップロード可
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// 行コンポーネント
// ─────────────────────────────────────
function DispatchRow({
  row,
  onChanged,
  supabase,
}: {
  row: DocumentDispatchRow
  onChanged: () => void
  supabase: ReturnType<typeof createClient>
}) {
  const [busy, setBusy] = useState(false)

  const updateField = async (patch: Partial<DocumentDispatchRow>) => {
    const { error } = await supabase.from('document_dispatches').update(patch).eq('id', row.id)
    if (error) throw error
    onChanged()
  }

  const handleDelete = async () => {
    if (!confirm('この行を削除しますか？受領書類も同時に削除されます。')) return
    setBusy(true)
    try {
      // 添付ファイルがあれば Storage からも削除
      if (row.received_file_path) {
        await supabase.storage.from('dispatch-documents').remove([row.received_file_path])
      }
      const { error } = await supabase.from('document_dispatches').delete().eq('id', row.id)
      if (error) throw error
      showToast('削除しました', 'success')
      onChanged()
    } catch (e) {
      console.error(e)
      showToast('削除に失敗しました', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/40 group">
      <td className="px-3 py-1.5">
        <DocumentNameCell value={row.document_name} onSave={v => updateField({ document_name: v })} />
      </td>
      <td className="px-3 py-1.5">
        <DateCell value={row.sent_date} onSave={v => updateField({ sent_date: v })} />
      </td>
      <td className="px-3 py-1.5">
        <TextCell value={row.sent_to} onSave={v => updateField({ sent_to: v })} placeholder="例：法務局" />
      </td>
      <td className="px-3 py-1.5 text-right">
        <NumberCell value={row.quantity} onSave={v => updateField({ quantity: v })} />
      </td>
      <td className="px-3 py-1.5">
        <DateCell value={row.received_date} onSave={v => updateField({ received_date: v })} />
      </td>
      <td className="px-3 py-1.5">
        <FileCell row={row} onChanged={onChanged} supabase={supabase} />
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          onClick={handleDelete}
          disabled={busy}
          className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:bg-red-50 hover:text-red-500 transition opacity-0 group-hover:opacity-100 disabled:opacity-30"
          title="この行を削除"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────
// 書類名（datalist で固定リスト + 自由入力）
// ─────────────────────────────────────
function DocumentNameCell({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const composingRef = useRef(false)

  const commit = async () => {
    const trimmed = draft.trim() || 'その他'
    if (trimmed === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(trimmed)
      showToast('保存しました', 'success')
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <>
        <input
          list="dispatch-document-names"
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onBlur={() => { if (!composingRef.current) commit() }}
          onKeyDown={e => {
            if (composingRef.current) return
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            else if (e.key === 'Escape') { setDraft(value); setEditing(false) }
          }}
          disabled={saving}
          className="w-full px-1.5 py-0.5 text-[13px] border border-brand-400 rounded outline-none bg-brand-50/30"
        />
        <datalist id="dispatch-document-names">
          {DISPATCH_DOCUMENT_NAMES.map(n => <option key={n} value={n} />)}
        </datalist>
      </>
    )
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true) }}
      className="text-left w-full px-1.5 py-0.5 -ml-1.5 rounded hover:bg-brand-50 text-[13px] font-medium text-gray-800"
    >
      {value}
    </button>
  )
}

// ─────────────────────────────────────
// 日付セル（YYYY-MM-DD）
// ─────────────────────────────────────
function DateCell({ value, onSave }: { value: string | null; onSave: (v: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      try { inputRef.current.showPicker?.() } catch { /* unsupported */ }
    }
  }, [editing])

  const commit = async () => {
    const next = draft || null
    if (next === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(next)
      showToast('保存しました', 'success')
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onClick={() => { try { inputRef.current?.showPicker?.() } catch { /* unsupported */ } }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
        }}
        disabled={saving}
        className="w-full px-1.5 py-0.5 text-[13px] font-mono border border-brand-400 rounded outline-none bg-brand-50/30 cursor-pointer"
      />
    )
  }

  return (
    <button
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      className={`text-left w-full px-1.5 py-0.5 -ml-1.5 rounded hover:bg-brand-50 text-[13px] font-mono ${value ? 'text-gray-700' : 'text-gray-300'}`}
    >
      {value ?? '—'}
    </button>
  )
}

// ─────────────────────────────────────
// テキストセル
// ─────────────────────────────────────
function TextCell({
  value,
  onSave,
  placeholder,
}: {
  value: string | null
  onSave: (v: string | null) => Promise<void>
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const composingRef = useRef(false)

  const commit = async () => {
    const next = draft.trim() || null
    if (next === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(next)
      showToast('保存しました', 'success')
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => { composingRef.current = false }}
        onBlur={() => { if (!composingRef.current) commit() }}
        onKeyDown={e => {
          if (composingRef.current) return
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
        }}
        disabled={saving}
        className="w-full px-1.5 py-0.5 text-[13px] border border-brand-400 rounded outline-none bg-brand-50/30"
      />
    )
  }

  return (
    <button
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      className={`text-left w-full px-1.5 py-0.5 -ml-1.5 rounded hover:bg-brand-50 text-[13px] truncate ${value ? 'text-gray-700' : 'text-gray-300 italic'}`}
    >
      {value ?? placeholder ?? '—'}
    </button>
  )
}

// ─────────────────────────────────────
// 数値セル（通数）
// ─────────────────────────────────────
function NumberCell({ value, onSave }: { value: number; onSave: (v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [saving, setSaving] = useState(false)

  const commit = async () => {
    const parsed = Math.max(0, parseInt(draft, 10) || 0)
    if (parsed === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(parsed)
      showToast('保存しました', 'success')
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        type="number"
        min={0}
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') { setDraft(String(value)); setEditing(false) }
        }}
        disabled={saving}
        className="w-full px-1.5 py-0.5 text-[13px] font-mono text-right border border-brand-400 rounded outline-none bg-brand-50/30"
      />
    )
  }

  return (
    <button
      onClick={() => { setDraft(String(value)); setEditing(true) }}
      className="text-right w-full px-1.5 py-0.5 -mr-1.5 rounded hover:bg-brand-50 text-[13px] font-mono text-gray-700"
    >
      {value}
    </button>
  )
}

// ─────────────────────────────────────
// ファイルセル（受領書類アップロード + 表示）
// ─────────────────────────────────────
function FileCell({
  row,
  onChanged,
  supabase,
}: {
  row: DocumentDispatchRow
  onChanged: () => void
  supabase: ReturnType<typeof createClient>
}) {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePick = () => {
    if (busy) return
    fileRef.current?.click()
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ACCEPTED_TYPES.split(',').includes(file.type)) {
      showToast('PDF / JPG / PNG のみアップロード可', 'error')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setBusy(true)
    try {
      // 既存ファイルがあれば置換のため先に削除
      if (row.received_file_path) {
        await supabase.storage.from('dispatch-documents').remove([row.received_file_path])
      }
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const path = `${row.case_id}/${row.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('dispatch-documents')
        .upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) throw upErr
      const { error: dbErr } = await supabase
        .from('document_dispatches')
        .update({
          received_file_path: path,
          received_file_name: file.name,
          received_file_type: file.type,
        })
        .eq('id', row.id)
      if (dbErr) throw dbErr
      showToast('アップロードしました', 'success')
      onChanged()
    } catch (err) {
      console.error(err)
      showToast('アップロードに失敗しました', 'error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleOpen = async () => {
    if (!row.received_file_path) return
    setBusy(true)
    try {
      const { data, error } = await supabase.storage
        .from('dispatch-documents')
        .createSignedUrl(row.received_file_path, 3600)
      if (error || !data?.signedUrl) throw error ?? new Error('signed url empty')
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      console.error(e)
      showToast('ファイルを開けませんでした', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    if (!row.received_file_path) return
    if (!confirm('受領書類のファイルを削除しますか？')) return
    setBusy(true)
    try {
      await supabase.storage.from('dispatch-documents').remove([row.received_file_path])
      const { error } = await supabase
        .from('document_dispatches')
        .update({ received_file_path: null, received_file_name: null, received_file_type: null })
        .eq('id', row.id)
      if (error) throw error
      showToast('削除しました', 'success')
      onChanged()
    } catch (e) {
      console.error(e)
      showToast('削除に失敗しました', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (row.received_file_path) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleOpen}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded transition truncate max-w-[160px]"
          title={row.received_file_name ?? ''}
        >
          <FileText className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{row.received_file_name ?? 'ファイル'}</span>
          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-60" />
        </button>
        <button
          onClick={handleRemove}
          disabled={busy}
          className="text-gray-300 hover:text-red-500"
          title="ファイルを削除"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={handlePick}
        disabled={busy}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] font-medium text-gray-500 hover:text-brand-700 border border-dashed border-gray-300 hover:border-brand-400 rounded"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
        アップロード
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleUpload}
        className="hidden"
      />
    </>
  )
}
