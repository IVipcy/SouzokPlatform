'use client'

import { useState, useRef, useEffect, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Upload, FileText, ExternalLink, Loader2, X,
  Mail, MailOpen, FileCheck, StickyNote,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { DISPATCH_DOCUMENT_NAMES } from '@/lib/constants'
import type { CaseDocumentRow } from '@/types'

const ACCEPTED_TYPES = 'application/pdf,image/jpeg,image/png,image/jpg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const ACCEPTED_EXT_LABEL = 'PDF / JPG / PNG / Word / Excel'

/** 状態フィルタのキー */
type StatusFilter = 'all' | 'memo' | 'sent' | 'waiting' | 'received' | 'completed'

/** 状態の判定 */
function statusOf(r: CaseDocumentRow): Exclude<StatusFilter, 'all'> {
  const hasSent = !!r.sent_date
  const hasReceived = !!r.received_date
  if (hasSent && hasReceived) return 'completed'
  if (hasSent && !hasReceived) return 'waiting'
  if (!hasSent && hasReceived) return 'received'
  // 両方空: 自社控えファイルがあれば memo、それ以外も memo として扱う
  return 'memo'
}

const STATUS_LABEL: Record<Exclude<StatusFilter, 'all'>, { label: string; cls: string; Icon: typeof Mail }> = {
  memo:      { label: 'メモ',     cls: 'bg-gray-50 text-gray-600 border-gray-200',     Icon: StickyNote },
  sent:      { label: '発送のみ', cls: 'bg-brand-50 text-brand-600 border-brand-200',  Icon: Mail },
  waiting:   { label: '返送待ち', cls: 'bg-amber-50 text-amber-700 border-amber-200',  Icon: Mail },
  received:  { label: '受領のみ', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200',     Icon: MailOpen },
  completed: { label: '完了',     cls: 'bg-green-50 text-green-700 border-green-200',  Icon: FileCheck },
}

type Props = {
  caseId: string
  rows: CaseDocumentRow[]
  /** セクションタイトル（指定するとカード上部に | アクセント付きヘッダー） */
  title?: string
  subtitle?: string
  /** 状態フィルタを表示するか */
  showStatusFilter?: boolean
}

export default function CaseDocumentTable({ caseId, rows, title, subtitle, showStatusFilter = true }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const supabase = createClient()

  const refresh = () => startTransition(() => router.refresh())

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter(r => statusOf(r) === filter)
  }, [rows, filter])

  const counts = useMemo(() => {
    const c: Record<Exclude<StatusFilter, 'all'>, number> = { memo: 0, sent: 0, waiting: 0, received: 0, completed: 0 }
    for (const r of rows) c[statusOf(r)]++
    return c
  }, [rows])

  const handleAdd = async () => {
    setAdding(true)
    try {
      const { error } = await supabase.from('case_documents').insert({
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
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
          <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
          {subtitle && <span className="text-[12px] font-normal text-gray-400">{subtitle}</span>}
        </div>
      )}

      {showStatusFilter && (
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/40 flex items-center gap-1.5 flex-wrap text-[12px]">
          <FilterChip label="全て" count={rows.length} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterChip label="メモ" count={counts.memo} active={filter === 'memo'} onClick={() => setFilter('memo')} icon={StickyNote} />
          <FilterChip label="発送のみ" count={counts.sent} active={filter === 'sent'} onClick={() => setFilter('sent')} icon={Mail} />
          <FilterChip label="返送待ち" count={counts.waiting} active={filter === 'waiting'} onClick={() => setFilter('waiting')} icon={Mail} tone="amber" />
          <FilterChip label="受領のみ" count={counts.received} active={filter === 'received'} onClick={() => setFilter('received')} icon={MailOpen} />
          <FilterChip label="完了" count={counts.completed} active={filter === 'completed'} onClick={() => setFilter('completed')} icon={FileCheck} tone="green" />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <colgroup>
            <col style={{ width: 190 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 50 }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-[12px]">
              <th className="px-3 py-2 text-left font-semibold">書類名</th>
              <th className="px-3 py-2 text-left font-semibold">状態</th>
              <th className="px-3 py-2 text-left font-semibold">発送日</th>
              <th className="px-3 py-2 text-left font-semibold">発送先</th>
              <th className="px-3 py-2 text-right font-semibold">通数</th>
              <th className="px-3 py-2 text-left font-semibold">自社控え</th>
              <th className="px-3 py-2 text-left font-semibold">受領日</th>
              <th className="px-3 py-2 text-left font-semibold">受領書類</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400 text-[13px]">
                  {rows.length === 0
                    ? 'まだ書類はありません。下の「+ 書類を追加」から登録してください。'
                    : '該当する書類がありません（フィルタを変えてください）'}
                </td>
              </tr>
            )}
            {filtered.map(r => (
              <DocRow key={r.id} row={r} onChanged={refresh} supabase={supabase} />
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
          書類を追加
        </button>
        <span className="ml-3 text-[12px] text-gray-400">
          各セルをクリックして編集・ファイルは {ACCEPTED_EXT_LABEL} をアップロード可
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// フィルタチップ
// ─────────────────────────────────────
function FilterChip({
  label, count, active, onClick, icon: Icon, tone = 'brand',
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  icon?: typeof Mail
  tone?: 'brand' | 'amber' | 'green'
}) {
  const baseTone = tone === 'amber' ? 'amber' : tone === 'green' ? 'green' : 'brand'
  const activeCls =
    baseTone === 'amber' ? 'bg-amber-100 text-amber-800 border-amber-300'
    : baseTone === 'green' ? 'bg-green-100 text-green-800 border-green-300'
    : 'bg-brand-100 text-brand-800 border-brand-300'
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border transition ${
        active ? activeCls : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
      }`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      <span>{label}</span>
      <span className="font-mono font-semibold">{count}</span>
    </button>
  )
}

// ─────────────────────────────────────
// 行コンポーネント
// ─────────────────────────────────────
function DocRow({
  row,
  onChanged,
  supabase,
}: {
  row: CaseDocumentRow
  onChanged: () => void
  supabase: ReturnType<typeof createClient>
}) {
  const [busy, setBusy] = useState(false)
  const status = statusOf(row)
  const statusDef = STATUS_LABEL[status]
  const StatusIcon = statusDef.Icon

  const updateField = async (patch: Partial<CaseDocumentRow>) => {
    const { error } = await supabase.from('case_documents').update(patch).eq('id', row.id)
    if (error) throw error
    onChanged()
  }

  const handleDelete = async () => {
    if (!confirm('この書類を削除しますか？添付ファイルも一緒に削除されます。')) return
    setBusy(true)
    try {
      const toRemove: Array<{ bucket: string; path: string }> = []
      if (row.received_file_path && row.received_file_bucket) toRemove.push({ bucket: row.received_file_bucket, path: row.received_file_path })
      if (row.outbound_file_path && row.outbound_file_bucket) toRemove.push({ bucket: row.outbound_file_bucket, path: row.outbound_file_path })
      await Promise.all(toRemove.map(f => supabase.storage.from(f.bucket).remove([f.path])))
      const { error } = await supabase.from('case_documents').delete().eq('id', row.id)
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
    <tr className="border-b border-gray-100 hover:bg-gray-50/40 group align-top">
      <td className="px-3 py-1.5">
        <DocumentNameCell value={row.document_name} onSave={v => updateField({ document_name: v })} />
      </td>
      <td className="px-3 py-1.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusDef.cls}`}>
          <StatusIcon className="w-3 h-3" />
          {statusDef.label}
        </span>
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
        <FileCell
          row={row}
          kind="outbound"
          onChanged={onChanged}
          supabase={supabase}
        />
      </td>
      <td className="px-3 py-1.5">
        <DateCell value={row.received_date} onSave={v => updateField({ received_date: v })} />
      </td>
      <td className="px-3 py-1.5">
        <FileCell
          row={row}
          kind="received"
          onChanged={onChanged}
          supabase={supabase}
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          onClick={handleDelete}
          disabled={busy}
          className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:bg-red-50 hover:text-red-500 transition opacity-0 group-hover:opacity-100 disabled:opacity-30"
          title="削除"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────
// 書類名（datalist 固定候補 + 自由入力）
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
          list="case-document-names"
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
        <datalist id="case-document-names">
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
// 日付セル
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
// 数値セル
// ─────────────────────────────────────
function NumberCell({ value, onSave }: { value: number; onSave: (v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? 0))
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
      onClick={() => { setDraft(String(value ?? 0)); setEditing(true) }}
      className="text-right w-full px-1.5 py-0.5 -mr-1.5 rounded hover:bg-brand-50 text-[13px] font-mono text-gray-700"
    >
      {value ?? 0}
    </button>
  )
}

// ─────────────────────────────────────
// ファイルセル（outbound / received 共通）
// ─────────────────────────────────────
function FileCell({
  row,
  kind,
  onChanged,
  supabase,
}: {
  row: CaseDocumentRow
  kind: 'outbound' | 'received'
  onChanged: () => void
  supabase: ReturnType<typeof createClient>
}) {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const path   = kind === 'outbound' ? row.outbound_file_path   : row.received_file_path
  const name   = kind === 'outbound' ? row.outbound_file_name   : row.received_file_name
  const bucket = kind === 'outbound' ? row.outbound_file_bucket : row.received_file_bucket

  const handlePick = () => { if (!busy) fileRef.current?.click() }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      // 既存ファイルがあれば置換
      if (path && bucket) {
        await supabase.storage.from(bucket).remove([path])
      }
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const newPath = `${row.case_id}/${row.id}/${kind}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(newPath, file, { contentType: file.type || 'application/octet-stream', upsert: true })
      if (upErr) throw upErr
      const patch =
        kind === 'outbound'
          ? {
              outbound_file_path: newPath,
              outbound_file_name: file.name,
              outbound_file_type: file.type || file.name.split('.').pop()?.toUpperCase() || null,
              outbound_file_bucket: 'documents',
            }
          : {
              received_file_path: newPath,
              received_file_name: file.name,
              received_file_type: file.type || file.name.split('.').pop()?.toUpperCase() || null,
              received_file_bucket: 'documents',
            }
      const { error: dbErr } = await supabase
        .from('case_documents')
        .update(patch)
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
    if (!path || !bucket) return
    setBusy(true)
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600)
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
    if (!path || !bucket) return
    if (!confirm('このファイルを削除しますか？')) return
    setBusy(true)
    try {
      await supabase.storage.from(bucket).remove([path])
      const patch =
        kind === 'outbound'
          ? { outbound_file_path: null, outbound_file_name: null, outbound_file_type: null, outbound_file_bucket: null }
          : { received_file_path: null, received_file_name: null, received_file_type: null, received_file_bucket: null }
      const { error } = await supabase
        .from('case_documents')
        .update(patch)
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

  if (path) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleOpen}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded transition truncate max-w-[140px]"
          title={name ?? ''}
        >
          <FileText className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{name ?? 'ファイル'}</span>
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
