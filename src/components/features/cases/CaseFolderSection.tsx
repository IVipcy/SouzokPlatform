'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UploadCloud, FileText, Sheet, Image as ImageIcon, File as FileIcon, Trash2, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { Section } from '@/components/ui/InlineFields'
import Modal from '@/components/ui/Modal'
import type { CaseFileRow } from '@/types'

type PendingItem = { id: string; name: string; receivedDate: string | null }

type Props = {
  caseId: string
  files: CaseFileRow[]
  /** 受信済（受領日あり）かつ未アップの受信簿アイテム。アップ後のポップアップ候補に使う */
  pendingItems: PendingItem[]
  currentMemberId: string | null
  onRefresh?: () => void
}

const fmtSize = (n: number | null) => {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

function FileTypeIcon({ name }: { name: string }) {
  const e = extOf(name)
  if (e === 'pdf') return <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
  if (['xls', 'xlsx', 'csv'].includes(e)) return <Sheet className="w-5 h-5 text-emerald-600 flex-shrink-0" />
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(e)) return <ImageIcon className="w-5 h-5 text-brand-500 flex-shrink-0" />
  return <FileIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
}

export default function CaseFolderSection({ caseId, files, pendingItems, currentMemberId, onRefresh }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [popupOpen, setPopupOpen] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const refresh = () => { if (onRefresh) onRefresh(); else router.refresh() }

  const uploadFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList)
    if (arr.length === 0) return
    setBusy(true)
    const supabase = createClient()
    let ok = 0
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i]
      const ext = extOf(f.name) || 'bin'
      const safe = f.name.replace(/[^\w.\-]+/g, '_')
      const path = `${caseId}/folder/${Date.now()}-${i}-${safe}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: true })
      if (upErr) { showToast(`${f.name} のアップロードに失敗: ${upErr.message}`, 'error'); continue }
      const { error: dbErr } = await supabase.from('case_files').insert({
        case_id: caseId,
        file_path: path,
        file_bucket: 'documents',
        file_name: f.name,
        file_type: f.type || ext.toUpperCase() || null,
        file_size: f.size,
        uploaded_by: currentMemberId,
      })
      if (dbErr) { showToast(`${f.name} の保存に失敗: ${dbErr.message}`, 'error'); continue }
      ok++
    }
    setBusy(false)
    if (ok > 0) {
      showToast(`${ok}件アップロードしました`, 'success')
      refresh()
      // 受信済かつ未アップの受領物があれば、突合ポップアップを開く
      if (pendingItems.length > 0) { setChecked(new Set()); setPopupOpen(true) }
    }
  }

  const openFile = async (f: CaseFileRow) => {
    const supabase = createClient()
    const { data, error } = await supabase.storage.from(f.file_bucket).createSignedUrl(f.file_path, 3600)
    if (error || !data?.signedUrl) { showToast(`ファイルを開けませんでした: ${error?.message ?? ''}`, 'error'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const deleteFile = async (f: CaseFileRow) => {
    if (!confirm(`「${f.file_name}」を削除しますか？`)) return
    const supabase = createClient()
    await supabase.storage.from(f.file_bucket).remove([f.file_path])
    const { error } = await supabase.from('case_files').delete().eq('id', f.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    showToast('削除しました', 'success')
    refresh()
  }

  const markUploaded = async () => {
    if (checked.size === 0) { setPopupOpen(false); return }
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('document_receipt_items')
      .update({ uploaded_at: new Date().toISOString() })
      .in('id', Array.from(checked))
    setBusy(false)
    setPopupOpen(false)
    if (error) { showToast(`更新に失敗: ${error.message}`, 'error'); return }
    showToast(`${checked.size}件をアップ済にしました`, 'success')
    refresh()
  }

  const totalSize = files.reduce((s, f) => s + (f.file_size ?? 0), 0)

  return (
    <Section title="案件フォルダ（書類一式）">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-gray-400">スキャンしたPDFやExcel等をまとめてアップロード。到着物ごとの紐づけは不要です。</p>
        <span className="text-[11px] text-gray-400 flex-shrink-0">{files.length} ファイル ・ {fmtSize(totalSize)}</span>
      </div>

      <input ref={inputRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = '' }} />
      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files) }}
        className={`mb-3 rounded-lg border-[1.5px] border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${dragOver ? 'border-brand-400 bg-brand-50/60' : 'border-gray-300 bg-gray-50 hover:bg-gray-100/70'}`}
      >
        {busy
          ? <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
          : <UploadCloud className="w-6 h-6 text-gray-400 mx-auto" />}
        <p className="text-[13px] text-gray-700 mt-1.5">ここにドラッグ＆ドロップ</p>
        <p className="text-[11.5px] text-gray-400 mt-0.5">または <span className="text-brand-600 font-semibold">ファイルを選択</span>（複数まとめてOK）</p>
      </div>

      {files.length > 0 && (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {files.map(f => (
            <div key={f.id} className="group border border-gray-200 rounded-md p-2.5 flex gap-2.5 items-start hover:border-brand-200">
              <FileTypeIcon name={f.file_name} />
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => openFile(f)} className="block w-full text-left text-[12px] text-gray-800 truncate hover:text-brand-700" title={f.file_name}>{f.file_name}</button>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10.5px] text-gray-400">{fmtSize(f.file_size)}</span>
                  <button type="button" onClick={() => openFile(f)} className="text-[10.5px] text-brand-600 inline-flex items-center gap-0.5 hover:text-brand-700"><ExternalLink className="w-3 h-3" />開く</button>
                  <button type="button" onClick={() => deleteFile(f)} className="text-gray-300 hover:text-red-500 ml-auto opacity-0 group-hover:opacity-100" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={popupOpen}
        onClose={() => setPopupOpen(false)}
        title="アップロードした書類を受領物に紐づけ"
        maxWidth="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPopupOpen(false)} className="px-4 py-2 text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50">スキップ</button>
            <button type="button" onClick={markUploaded} disabled={busy || checked.size === 0} className="px-4 py-2 text-[13px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50">選んだ{checked.size > 0 ? `${checked.size}件` : ''}をアップ済にする</button>
          </div>
        }
      >
        <p className="text-[12.5px] text-gray-600 mb-3 leading-relaxed">今回スキャンしてアップしたのはどの受領物？（受信済だが未アップのもの）チェックすると<span className="text-emerald-600 font-semibold">アップ済</span>になります。受信予定に無いものをアップしたときはスキップでOK。</p>
        <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
          {pendingItems.map(it => {
            const on = checked.has(it.id)
            return (
              <label key={it.id} className={`flex items-center gap-2.5 px-3 py-2 border rounded-md text-[13px] cursor-pointer ${on ? 'border-brand-300 bg-brand-50/70' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="checkbox" checked={on} onChange={() => setChecked(prev => { const n = new Set(prev); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n })} className="accent-brand-600" />
                <span className="flex-1">{it.name}</span>
                {it.receivedDate && <span className="text-[11px] text-gray-400 flex-shrink-0">受領 {it.receivedDate}</span>}
              </label>
            )
          })}
        </div>
      </Modal>
    </Section>
  )
}
