'use client'

// 面談メモ（原本）ビューア。
// 白紙メモタブで保存した1枚画像を、あとから案件詳細／オーダーシートからいつでも開けるようにする。
// ・meta.bands（帯の境界Y座標）を持っている画像は、左のセクション名クリックでその位置へジャンプできる。
// ・面談が複数回あると白紙メモも複数枚になるため、保存日で切り替えられる。

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ZoomIn, ZoomOut, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'

export type MemoBandLite = { key: string; label: string; y0: number; y1: number }
export type MemoLite = {
  id: string
  image_path: string | null
  image_bucket: string
  section: string | null
  created_at: string | null
  meta?: { w: number; h: number; bands: MemoBandLite[] } | null
}

const fmtDate = (s: string | null) => (s ? s.slice(0, 10).replace(/-/g, '/') : '')

export default function MeetingMemoViewer({
  memos, open, onClose, onDeleted,
}: {
  memos: MemoLite[]
  open: boolean
  onClose: () => void
  /** 削除を許可する場合に渡す（渡さなければ削除ボタンは出さない） */
  onDeleted?: (id: string) => void
}) {
  // 新しいものを先頭に
  const list = useMemo(
    () => [...memos].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [memos],
  )
  const [idx, setIdx] = useState(0)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [zoom, setZoom] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const cur = list[Math.min(idx, Math.max(0, list.length - 1))]

  useEffect(() => { if (open) { setIdx(0); setZoom(1) } }, [open])

  // 署名URLを取得（1時間）
  useEffect(() => {
    if (!open) return
    const missing = list.filter(m => m.image_path && !urls[m.id])
    if (missing.length === 0) return
    const supabase = createClient()
    ;(async () => {
      const next: Record<string, string> = {}
      for (const m of missing) {
        const { data } = await supabase.storage.from(m.image_bucket || 'meeting-memos').createSignedUrl(m.image_path!, 3600)
        if (data?.signedUrl) next[m.id] = data.signedUrl
      }
      if (Object.keys(next).length) setUrls(prev => ({ ...prev, ...next }))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list])

  // Escで閉じる
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // 保存時のCSS幅(meta.w)と表示中の実幅の比から、帯のY座標を画面上の位置へ換算してスクロール
  const jumpTo = (band: MemoBandLite) => {
    const sc = scrollRef.current, img = imgRef.current, meta = cur?.meta
    if (!sc || !img || !meta?.w) return
    const ratio = img.clientWidth / meta.w
    sc.scrollTo({ top: Math.max(0, band.y0 * ratio - 12), behavior: 'smooth' })
  }

  const del = async () => {
    if (!cur || !onDeleted) return
    if (!window.confirm('この原本を削除します。よろしいですか？')) return
    const supabase = createClient()
    try {
      if (cur.image_path) await supabase.storage.from(cur.image_bucket || 'meeting-memos').remove([cur.image_path])
      const { error } = await supabase.from('meeting_memos').delete().eq('id', cur.id)
      if (error) throw new Error(error.message)
      onDeleted(cur.id)
      setIdx(0)
      showToast('削除しました', 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : '削除に失敗', 'error') }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1E3A8A]">
          <span className="text-[14px] font-bold text-white flex-1">面談メモ（原本）</span>
          {list.length > 1 && (
            <select value={idx} onChange={e => { setIdx(Number(e.target.value)); setZoom(1); scrollRef.current?.scrollTo({ top: 0 }) }}
              className="text-[12px] rounded-md border-0 px-2 py-1 bg-white/15 text-white">
              {list.map((m, i) => <option key={m.id} value={i} className="text-gray-900">{fmtDate(m.created_at) || `メモ${i + 1}`}</option>)}
            </select>
          )}
          <button type="button" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1.5 rounded text-white hover:bg-white/15" title="縮小"><ZoomOut className="w-4 h-4" /></button>
          <span className="text-[11px] text-white/80 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1.5 rounded text-white hover:bg-white/15" title="拡大"><ZoomIn className="w-4 h-4" /></button>
          {onDeleted && <button type="button" onClick={del} className="p-1.5 rounded text-white hover:bg-white/15" title="この原本を削除"><Trash2 className="w-4 h-4" /></button>}
          <button type="button" onClick={onClose} className="p-1.5 rounded text-white hover:bg-white/15" title="閉じる"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* セクションジャンプ（帯情報がある画像のみ） */}
          {cur?.meta?.bands?.length ? (
            <div className="w-40 flex-none border-r border-gray-200 bg-gray-50 overflow-y-auto py-2">
              <div className="px-3 pb-1 text-[10px] text-gray-400">セクションへ移動</div>
              {cur.meta.bands.map(b => (
                <button key={b.key} type="button" onClick={() => jumpTo(b)}
                  className="w-full text-left text-[12px] px-3 py-1.5 text-gray-600 hover:bg-white hover:text-brand-700">
                  {b.label}
                </button>
              ))}
            </div>
          ) : null}

          {/* 画像 */}
          <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-100 p-3">
            {cur && urls[cur.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img ref={imgRef} src={urls[cur.id]} alt="面談メモ原本"
                style={{ width: `${zoom * 100}%` }}
                className="mx-auto bg-white border border-gray-200 rounded shadow-sm block" />
            ) : (
              <div className="h-full flex items-center justify-center text-[12px] text-gray-400">読み込み中…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
