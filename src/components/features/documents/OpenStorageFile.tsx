'use client'

import { useState } from 'react'
import { Paperclip, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'

/** Storage上のファイルを署名URLで開く小さなボタン（受領ファイルを各表・受信簿から開く用）。 */
export default function OpenStorageFile({ bucket, path, name, label }: { bucket: string; path: string; name?: string | null; label?: string }) {
  const [busy, setBusy] = useState(false)
  const open = async () => {
    if (busy) return
    setBusy(true)
    const supabase = createClient()
    // PDF・画像はブラウザでプレビュー。それ以外(Excel等)は分かりやすいファイル名でダウンロードさせる
    // （署名URLにdownload名を渡さないと、保存名がストレージのキー＝意味不明な文字列になる）
    const ext = (path.split('.').pop() ?? '').toLowerCase()
    const previewable = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg'].includes(ext)
    const base = (name?.trim()) || path.split('/').pop() || 'file'
    const downloadName = base.includes('.') ? base : (ext ? `${base}.${ext}` : base)
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600, previewable ? undefined : { download: downloadName })
    setBusy(false)
    if (error || !data?.signedUrl) { showToast(`ファイルを開けませんでした: ${error?.message ?? ''}`, 'error'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      title={name ?? 'ファイルを開く'}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
      {label ?? '開く'}
    </button>
  )
}
