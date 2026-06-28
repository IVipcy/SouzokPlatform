'use client'

import { useState, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, ExternalLink, Trash2, Upload, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { CaseDocumentRow } from '@/types'

type CaseLite = { id: string; case_number: string; deal_name: string }

type Props = {
  rows: CaseDocumentRow[]
  caseLookup: Map<string, CaseLite>
}

const ACCEPTED_TYPES = 'application/pdf,image/jpeg,image/png,image/jpg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// 1レコードあたりの「代表ファイル」を取得（受領 > 自社控え の優先順）
function pickPrimaryFile(r: CaseDocumentRow): {
  path: string | null
  name: string | null
  bucket: string | null
  kind: 'received' | 'outbound' | null
} {
  if (r.received_file_path && r.received_file_bucket) {
    return { path: r.received_file_path, name: r.received_file_name, bucket: r.received_file_bucket, kind: 'received' }
  }
  if (r.outbound_file_path && r.outbound_file_bucket) {
    return { path: r.outbound_file_path, name: r.outbound_file_name, bucket: r.outbound_file_bucket, kind: 'outbound' }
  }
  return { path: null, name: null, bucket: null, kind: null }
}

// ISO datetime → 'YYYY-MM-DD' 表示
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return iso.slice(0, 10)
}

export default function DocumentManagementList({ rows, caseLookup }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())
  const supabase = createClient()

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <colgroup>
            <col style={{ width: 130 }} />
            <col style={{ width: 220 }} />
            <col />
            <col style={{ width: 130 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 50 }} />
          </colgroup>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-brand-700 text-[12px]">
              <th className="px-3 py-2 text-left font-semibold">案件管理番号</th>
              <th className="px-3 py-2 text-left font-semibold">案件名</th>
              <th className="px-3 py-2 text-left font-semibold">書類名</th>
              <th className="px-3 py-2 text-left font-semibold">ファイル更新日</th>
              <th className="px-3 py-2 text-left font-semibold">ファイル</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-[13px]">
                  該当する書類がありません
                </td>
              </tr>
            )}
            {rows.map(r => (
              <DocRow
                key={r.id}
                row={r}
                caseInfo={caseLookup.get(r.case_id) ?? null}
                onChanged={refresh}
                supabase={supabase}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DocRow({
  row,
  caseInfo,
  onChanged,
  supabase,
}: {
  row: CaseDocumentRow
  caseInfo: CaseLite | null
  onChanged: () => void
  supabase: ReturnType<typeof createClient>
}) {
  const [busy, setBusy] = useState(false)

  const updateName = async (next: string) => {
    if (next === row.document_name) return
    setBusy(true)
    const { error } = await supabase.from('case_documents').update({ document_name: next }).eq('id', row.id)
    setBusy(false)
    if (error) {
      showToast(`保存に失敗しました: ${error.message}`, 'error')
      return
    }
    onChanged()
  }

  const handleDelete = async () => {
    if (!confirm('このレコードを削除しますか？添付ファイルも削除されます。')) return
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
    <tr className="border-b border-gray-100 hover:bg-gray-50/40 align-middle">
      <td className="px-3 py-1.5 text-[12px] font-mono text-gray-500">
        {caseInfo ? (
          <Link href={`/cases/${caseInfo.id}?tab=docs`} className="text-brand-700 hover:underline font-semibold">
            {caseInfo.case_number}
          </Link>
        ) : '—'}
      </td>
      <td className="px-3 py-1.5 text-[13px] text-gray-800 truncate">
        {caseInfo ? (
          <Link
            href={`/cases/${caseInfo.id}?tab=docs`}
            className="hover:text-brand-700 hover:underline inline-flex items-center gap-1"
          >
            {caseInfo.deal_name}
            <ExternalLink className="w-2.5 h-2.5 opacity-50 flex-shrink-0" />
          </Link>
        ) : '—'}
      </td>
      <td className="px-3 py-1.5">
        <DocumentNameCell value={row.document_name} onSave={updateName} disabled={busy} />
      </td>
      <td className="px-3 py-1.5 font-mono text-[12px] text-gray-600">
        {fmtDate(row.updated_at)}
      </td>
      <td className="px-3 py-1.5">
        <FilePreviewCell row={row} onChanged={onChanged} supabase={supabase} />
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          onClick={handleDelete}
          disabled={busy}
          className="text-gray-300 hover:text-red-500 transition-colors p-1"
          title="このレコードを削除"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )
}

// 書類名のインライン編集
function DocumentNameCell({ value, onSave, disabled }: {
  value: string
  onSave: (next: string) => Promise<void> | void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  if (!editing && draft !== value) setDraft(value)

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={async () => { setEditing(false); await onSave(draft.trim()) }}
        onKeyDown={async e => {
          if (e.key === 'Enter') { setEditing(false); await onSave(draft.trim()) }
          if (e.key === 'Escape') { setEditing(false); setDraft(value) }
        }}
        disabled={disabled}
        className="w-full px-2 py-1 text-[13px] border border-brand-400 rounded outline-none focus:ring-1 focus:ring-brand-300"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={disabled}
      className="text-left w-full px-2 py-1 rounded text-[13px] text-gray-800 hover:bg-brand-50/40 transition-colors disabled:opacity-60"
      title="クリックして編集"
    >
      {value || <span className="text-gray-300 italic">書類名未設定</span>}
    </button>
  )
}

// ファイルプレビュー/ダウンロード/アップロードセル
function FilePreviewCell({
  row,
  onChanged,
  supabase,
}: {
  row: CaseDocumentRow
  onChanged: () => void
  supabase: ReturnType<typeof createClient>
}) {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const file = pickPrimaryFile(row)

  const handleOpen = async () => {
    if (!file.path || !file.bucket) return
    setBusy(true)
    try {
      // PDF・画像はプレビュー、それ以外は分かりやすい名前でDL（保存名がストレージキーになるのを防ぐ）
      const ext = (file.path.split('.').pop() ?? '').toLowerCase()
      const previewable = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg'].includes(ext)
      const base = (file.name?.trim()) || file.path.split('/').pop() || 'file'
      const downloadName = base.includes('.') ? base : (ext ? `${base}.${ext}` : base)
      const { data, error } = await supabase.storage.from(file.bucket).createSignedUrl(file.path, 3600, previewable ? undefined : { download: downloadName })
      if (error || !data?.signedUrl) throw error ?? new Error('signed url empty')
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      console.error(e)
      showToast('ファイルを開けませんでした', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    try {
      // 既存ファイルがあれば削除
      if (file.path && file.bucket) {
        await supabase.storage.from(file.bucket).remove([file.path])
      }
      const ext = f.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const kind = file.kind ?? 'outbound'  // 既存があればその枠に、なければ outbound（自社控え）に保存
      const newPath = `${row.case_id}/${row.id}/${kind}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(newPath, f, { contentType: f.type || 'application/octet-stream', upsert: true })
      if (upErr) throw upErr
      const patch = kind === 'outbound'
        ? {
            outbound_file_path: newPath,
            outbound_file_name: f.name,
            outbound_file_type: f.type || f.name.split('.').pop()?.toUpperCase() || null,
            outbound_file_bucket: 'documents',
          }
        : {
            received_file_path: newPath,
            received_file_name: f.name,
            received_file_type: f.type || f.name.split('.').pop()?.toUpperCase() || null,
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

  const handleRemove = async () => {
    if (!file.path || !file.bucket || !file.kind) return
    if (!confirm('このファイルを削除しますか？')) return
    setBusy(true)
    try {
      await supabase.storage.from(file.bucket).remove([file.path])
      const patch = file.kind === 'outbound'
        ? { outbound_file_path: null, outbound_file_name: null, outbound_file_type: null, outbound_file_bucket: null }
        : { received_file_path: null, received_file_name: null, received_file_type: null, received_file_bucket: null }
      const { error } = await supabase.from('case_documents').update(patch).eq('id', row.id)
      if (error) throw error
      showToast('ファイルを削除しました', 'success')
      onChanged()
    } catch (e) {
      console.error(e)
      showToast('削除に失敗しました', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (file.path) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleOpen}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded transition truncate max-w-[140px] disabled:opacity-50"
          title={file.name ?? 'ファイルを開く'}
        >
          <FileText className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{file.name ?? 'プレビュー / DL'}</span>
          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-60" />
        </button>
        <button
          onClick={handleRemove}
          disabled={busy}
          className="text-gray-300 hover:text-red-500 disabled:opacity-50"
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
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] font-medium text-gray-500 hover:text-brand-700 border border-dashed border-gray-300 hover:border-brand-400 rounded disabled:opacity-50"
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
