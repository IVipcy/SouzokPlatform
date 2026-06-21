'use client'

import { useRef, useState } from 'react'
import { Paperclip, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import OpenStorageFile from '@/components/features/documents/OpenStorageFile'

/**
 * 契約時受領の書類(contract_documents)にスキャンファイル等を添付/開くセル。
 * 既にあれば「開く」、無ければ「添付」。原本のみでスキャン無しのこともあるので任意。
 */
export default function ContractDocFileCell({
  caseId,
  docId,
  filePath,
  fileBucket,
  fileName,
  onChanged,
}: {
  caseId: string
  docId: string
  filePath: string | null
  fileBucket: string | null
  fileName: string | null
  onChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (f: File) => {
    setBusy(true)
    const supabase = createClient()
    const ext = f.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const path = `${caseId}/contract/${docId}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('documents').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: true })
    if (upErr) { setBusy(false); showToast(`アップロードに失敗しました: ${upErr.message}`, 'error'); return }
    const { error: dbErr } = await supabase.from('contract_documents').update({
      file_path: path,
      file_name: f.name,
      file_type: f.type || ext.toUpperCase() || null,
      file_bucket: 'documents',
    }).eq('id', docId)
    setBusy(false)
    if (dbErr) { showToast(`保存に失敗しました: ${dbErr.message}`, 'error'); return }
    showToast('ファイルを添付しました', 'success')
    onChanged?.()
  }

  if (filePath && fileBucket) {
    return <OpenStorageFile bucket={fileBucket} path={filePath} name={fileName} label="ファイル" />
  }
  return (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
        title="スキャンしたPDF等を添付（任意）"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}添付
      </button>
    </>
  )
}
