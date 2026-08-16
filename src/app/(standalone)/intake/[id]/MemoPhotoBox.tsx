'use client'

// 面談メモ（写真）。面談シートの先頭に置く。
//
// シートを埋めずに、紙のメモを撮って終わりにしたい人向けの入口。
// 保存先は手書き画像と同じ（meeting_memos ／ meeting-memos バケット）なので、
// 案件詳細の面談シートにもオーダーシートの引き継ぎ欄にも、そのまま同じ形で出る。

import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { MeetingMemoRow } from './IntakeCaseClient'

const BUCKET = 'meeting-memos'
/** 面談メモ（写真）のセクション名。SEC_LABEL にも同じキーを置く。 */
export const MEMO_PHOTO_SECTION = 'memoPhoto'

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export default function MemoPhotoBox({ caseId, memos, setMemos, ensureCaseId, currentMemberId, readOnly = false }: {
  caseId: string
  memos: MeetingMemoRow[]
  setMemos: (fn: (prev: MeetingMemoRow[]) => MeetingMemoRow[]) => void
  ensureCaseId?: () => Promise<string>
  currentMemberId?: string | null
  readOnly?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const photos = memos.filter(m => m.section === MEMO_PHOTO_SECTION)

  // 署名付きURLを引く（画像は非公開バケット）
  useEffect(() => {
    const supabase = createClient()
    const missing = photos.filter(m => m.image_path && !urls[m.id])
    if (missing.length === 0) return
    ;(async () => {
      const next: Record<string, string> = {}
      for (const m of missing) {
        const { data } = await supabase.storage.from(m.image_bucket || BUCKET).createSignedUrl(m.image_path!, 3600)
        if (data?.signedUrl) next[m.id] = data.signedUrl
      }
      if (Object.keys(next).length) setUrls(prev => ({ ...prev, ...next }))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memos])

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    const supabase = createClient()
    try {
      const cid = ensureCaseId ? await ensureCaseId() : caseId
      let sort = photos.length
      for (const file of Array.from(files)) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${cid}/${uid()}.${ext}`
        const { error: up } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
        if (up) throw new Error(up.message)
        const { data: row, error } = await supabase.from('meeting_memos')
          .insert({ case_id: cid, section: MEMO_PHOTO_SECTION, image_path: path, image_bucket: BUCKET, sort_order: sort++, created_by: currentMemberId ?? null })
          .select('*').single()
        if (error || !row) throw new Error(error?.message ?? '保存に失敗しました')
        setMemos(prev => [...prev, row as MeetingMemoRow])
      }
      showToast(`面談メモを${files.length}枚 保存しました`, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async (m: MeetingMemoRow) => {
    const supabase = createClient()
    if (m.image_path) await supabase.storage.from(m.image_bucket || BUCKET).remove([m.image_path])
    await supabase.from('meeting_memos').delete().eq('id', m.id)
    setMemos(prev => prev.filter(x => x.id !== m.id))
  }

  if (readOnly && photos.length === 0) return null

  return (
    <div className="bg-white border border-brand-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-brand-50 border-b border-brand-100">
        <Camera className="w-4 h-4 text-brand-700 flex-none" strokeWidth={2} />
        <span className="text-[13.5px] font-bold text-brand-800 flex-1">面談メモ（写真）</span>
        {photos.length > 0 && <span className="text-[11px] font-mono text-brand-700">{photos.length}枚</span>}
      </div>
      <div className="p-3 space-y-2.5">
        {!readOnly && (
          <>
            <p className="text-[11.5px] text-gray-500 leading-snug">
              紙のメモを撮るだけでも構いません。ここに残しておけば、シートを埋めずにそのまま面談結果登録へ進めます。
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[14px] font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" strokeWidth={2.25} />}
              {busy ? '保存中…' : '面談メモを撮る／画像を添付'}
            </button>
            {/* スマホではカメラが直接開く。複数枚まとめて選べる。 */}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
              onChange={e => pick(e.target.files)} />
          </>
        )}
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photos.map(m => (
              <div key={m.id} className="relative">
                {urls[m.id]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <a href={urls[m.id]} target="_blank" rel="noreferrer"><img src={urls[m.id]} alt="面談メモ" className="h-24 rounded border border-gray-200 bg-white" /></a>
                  : <div className="h-24 w-20 rounded border border-gray-200 bg-gray-50 flex items-center justify-center text-[11px] text-gray-400">読込中</div>}
                {!readOnly && (
                  <button type="button" onClick={() => remove(m)} title="削除"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 flex items-center justify-center shadow-sm">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
