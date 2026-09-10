'use client'

// 「この画像を見てください」の浮かせ窓。
//
// 前の請求で届いた戸籍（赤枠＝次に請求する箇所）を横に置いたまま、新しい請求カードに
// 請求先・本籍を打てるようにする。暗幕なし・ドラッグ移動・右下で大きさ変更（FloatingWindow）。
// ヘッダーは琥珀色にして、どの請求の画像かを言い切る。

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import FloatingWindow from '@/components/ui/FloatingWindow'
import AnnotatedImage from './AnnotatedImage'
import type { ViewerImage } from './KosekiImageViewer'

export default function KosekiImageFloat({ images, startId, onClose, onEdit }: {
  images: ViewerImage[]
  startId?: string | null
  onClose: () => void
  onEdit?: (id: string) => void
}) {
  const [idx, setIdx] = useState(() => {
    const i = startId ? images.findIndex(v => v.id === startId) : 0
    return i >= 0 ? i : 0
  })
  const cur = images[Math.min(idx, images.length - 1)]
  if (!cur) return null
  const go = (d: -1 | 1) => setIdx(i => Math.max(0, Math.min(images.length - 1, i + d)))
  const title = `この画像を見てください：${cur.person || '対象者未設定'}${cur.requestLabel ? `（${cur.requestLabel}）` : ''}`
  return (
    <FloatingWindow isOpen onClose={onClose} title={title} width={560} height={520} resizable tone="amber"
      footer={
        <div className="flex items-center gap-2 w-full text-[11.5px] text-gray-600">
          <button type="button" onClick={() => go(-1)} disabled={idx === 0} className="inline-flex items-center gap-0.5 px-2 py-1 rounded border border-gray-300 bg-white disabled:opacity-40"><ChevronLeft className="w-3.5 h-3.5" />前</button>
          <span className="tabular-nums">{idx + 1} / {images.length}</span>
          <button type="button" onClick={() => go(1)} disabled={idx >= images.length - 1} className="inline-flex items-center gap-0.5 px-2 py-1 rounded border border-gray-300 bg-white disabled:opacity-40">次<ChevronRight className="w-3.5 h-3.5" /></button>
          <span className="ml-2 text-gray-400">赤枠＝次に請求する箇所</span>
          {onEdit && (
            <button type="button" onClick={() => onEdit(cur.id)} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
              <Pencil className="w-3.5 h-3.5" />書き込む
            </button>
          )}
        </div>
      }>
      <div className="bg-gray-900 rounded-md p-2 min-h-[200px] flex items-start justify-center">
        {cur.url
          ? <AnnotatedImage url={cur.url} annos={cur.annos} className="w-full" />
          : <span className="text-[12px] text-gray-400 py-10">読み込み中…</span>}
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500 truncate">{cur.fileName ?? ''}</p>
    </FloatingWindow>
  )
}
