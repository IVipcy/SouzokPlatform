'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UploadCloud, FileText, Sheet, Image as ImageIcon, File as FileIcon, Trash2, ExternalLink, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadFilesToCaseFolder } from '@/lib/caseFolder'
import { showToast } from '@/components/ui/Toast'
import { Section } from '@/components/ui/InlineFields'
import Modal from '@/components/ui/Modal'
import type { CaseFileRow, DocumentRow } from '@/types'

type PendingItem = { id: string; name: string; receivedDate: string | null }

type Props = {
  caseId: string
  files: CaseFileRow[]
  /** AI書類作成で生成した書類（documents テーブル。bucket='documents'）。AI作成タブに表示。 */
  aiDocs?: DocumentRow[]
  /** 受信済（受領日あり）かつ未アップの受信簿アイテム。アップ後のポップアップ候補に使う */
  pendingItems: PendingItem[]
  currentMemberId: string | null
  onRefresh?: () => void
}

const fmtDate = (s: string | null) => (s ? s.slice(0, 10) : '—')

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

export default function CaseFolderSection({ caseId, files, aiDocs = [], pendingItems, currentMemberId, onRefresh }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [popupOpen, setPopupOpen] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'upload' | 'ai'>('upload')
  const refresh = () => { if (onRefresh) onRefresh(); else router.refresh() }

  // AI作成書類（documents テーブル・bucket='documents'）を開く
  const openDoc = async (d: DocumentRow) => {
    if (!d.file_path) { showToast('ファイルがありません', 'error'); return }
    const ext = (d.file_path.split('.').pop() ?? '').toLowerCase()
    const previewable = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg'].includes(ext)
    const base = (d.name?.trim()) || d.file_path.split('/').pop() || 'file'
    const downloadName = base.includes('.') ? base : (ext ? `${base}.${ext}` : base)
    const { data, error } = await createClient().storage.from('documents').createSignedUrl(d.file_path, 3600, previewable ? undefined : { download: downloadName })
    if (error || !data?.signedUrl) { showToast(`ファイルを開けませんでした: ${error?.message ?? ''}`, 'error'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const uploadFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList)
    if (arr.length === 0) return
    setBusy(true)
    const { ok, failed } = await uploadFilesToCaseFolder(caseId, arr, currentMemberId)
    setBusy(false)
    if (failed > 0) showToast(`${failed}件のアップロードに失敗しました`, 'error')
    if (ok > 0) {
      showToast(`${ok}件アップロードしました`, 'success')
      refresh()
      // 受信済かつ未アップの受領物があれば、突合ポップアップを開く
      if (pendingItems.length > 0) { setChecked(new Set()); setPopupOpen(true) }
    }
  }

  const openFile = async (f: CaseFileRow) => {
    const supabase = createClient()
    // PDF・画像はプレビュー、それ以外は元のファイル名でダウンロード（保存名がストレージキーになるのを防ぐ）
    const ext = (f.file_path.split('.').pop() ?? '').toLowerCase()
    const previewable = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg'].includes(ext)
    const { data, error } = await supabase.storage.from(f.file_bucket).createSignedUrl(f.file_path, 3600, previewable ? undefined : { download: f.file_name })
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
      {/* タブ：アップロード / AI作成 */}
      <div className="flex items-center gap-1.5 mb-3">
        <button type="button" onClick={() => setTab('upload')} className={`inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg border transition-colors ${tab === 'upload' ? 'bg-brand-600 text-white border-brand-600 font-medium' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          <UploadCloud className="w-3.5 h-3.5" />アップロード<span className={`text-[11px] px-1.5 rounded-full ${tab === 'upload' ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{files.length}</span>
        </button>
        <button type="button" onClick={() => setTab('ai')} className={`inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg border transition-colors ${tab === 'ai' ? 'bg-brand-600 text-white border-brand-600 font-medium' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          <Sparkles className="w-3.5 h-3.5" />AI作成<span className={`text-[11px] px-1.5 rounded-full ${tab === 'ai' ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{aiDocs.length}</span>
        </button>
        <span className="ml-auto text-[11px] text-gray-400">{tab === 'upload' ? `${files.length} ファイル・${fmtSize(totalSize)}` : `${aiDocs.length} ファイル`}</span>
      </div>

      {tab === 'upload' ? (
        <>
          {/* コンパクトなドロップ欄（横長バー） */}
          <input ref={inputRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = '' }} />
          <div
            onClick={() => !busy && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files) }}
            className={`mb-3 flex items-center gap-3 rounded-lg border-[1.5px] border-dashed px-4 py-3 cursor-pointer transition-colors ${dragOver ? 'border-brand-400 bg-brand-50/60' : 'border-gray-300 bg-gray-50 hover:bg-gray-100/70'}`}
          >
            <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            </span>
            <span className="text-[12.5px] text-gray-600">ここにドラッグ＆ドロップ、または <span className="text-brand-600 font-semibold">ファイルを選択</span>（複数まとめてOK）</span>
          </div>

          {files.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-[12px] text-gray-400">アップロードされたファイルはありません。</div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[36px_1fr_130px_72px_44px] items-center gap-2 px-3 py-2 bg-gray-50 text-[10.5px] font-medium text-gray-400">
                <span /><span>ファイル名</span><span>アップロード日</span><span className="text-right">サイズ</span><span />
              </div>
              {files.map(f => (
                <div key={f.id} className="group grid grid-cols-[36px_1fr_130px_72px_44px] items-center gap-2 px-3 py-2 border-t border-gray-100 text-[12.5px] hover:bg-gray-50/60">
                  <FileTypeIcon name={f.file_name} />
                  <button type="button" onClick={() => openFile(f)} className="text-left font-medium text-gray-800 truncate hover:text-brand-700" title={f.file_name}>{f.file_name}</button>
                  <span className="text-[11.5px] text-gray-500 tabular-nums">{fmtDate(f.created_at)}</span>
                  <span className="text-[11px] text-gray-400 text-right tabular-nums">{fmtSize(f.file_size)}</span>
                  <span className="flex items-center justify-end gap-1.5">
                    <button type="button" onClick={() => openFile(f)} className="text-brand-600 hover:text-brand-700" title="開く"><ExternalLink className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => deleteFile(f)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        aiDocs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-[12px] text-gray-400">AI書類作成で作成したファイルはまだありません。右上の「書類作成」から作成できます。</div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[36px_1fr_130px_44px] items-center gap-2 px-3 py-2 bg-gray-50 text-[10.5px] font-medium text-gray-400">
              <span /><span>ファイル名</span><span>作成日</span><span />
            </div>
            {aiDocs.map(d => (
              <div key={d.id} className="grid grid-cols-[36px_1fr_130px_44px] items-center gap-2 px-3 py-2 border-t border-gray-100 text-[12.5px] hover:bg-gray-50/60">
                <FileTypeIcon name={d.file_path ?? d.name} />
                <button type="button" onClick={() => openDoc(d)} className="text-left font-medium text-gray-800 truncate hover:text-brand-700" title={d.name}>{d.name}</button>
                <span className="text-[11.5px] text-gray-500 tabular-nums">{fmtDate(d.created_at)}</span>
                <span className="flex items-center justify-end">
                  <button type="button" onClick={() => openDoc(d)} className="text-brand-600 hover:text-brand-700" title="開く"><ExternalLink className="w-3.5 h-3.5" /></button>
                </span>
              </div>
            ))}
          </div>
        )
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
