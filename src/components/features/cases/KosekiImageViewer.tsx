'use client'

// 戸籍画像のビューア。
//
// 今までは1枚ずつモーダルを開いて閉じる作りだったが、戸籍は人をまたいで見比べるもの
// （被相続人の戸籍で相続人を確かめ、その相続人の戸籍を見る）なので、
// 閉じずに全員ぶんを横送りできるようにしている。
//
// 並びは相続人一覧表と同じ（対象者ごとにまとまった順）。下の帯で人の区切りが分かる。

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react'
import AnnotatedImage from './AnnotatedImage'
import type { Anno } from '@/lib/imageAnnotations'

export type ViewerImage = {
  id: string
  /** 対象者（帯の区切りに使う） */
  person: string
  url?: string
  annos: Anno[]
  fileName: string | null
}

export default function KosekiImageViewer({ images, startId, onClose, onEdit }: {
  images: ViewerImage[]
  startId: string
  onClose: () => void
  onEdit?: (id: string) => void
}) {
  const [idx, setIdx] = useState(() => {
    const i = images.findIndex(v => v.id === startId)
    return i >= 0 ? i : 0
  })
  const stripRef = useRef<HTMLDivElement>(null)

  const go = useCallback((d: -1 | 1) => {
    setIdx(i => Math.max(0, Math.min(images.length - 1, i + d)))
  }, [images.length])

  // ← → で送る／Esc で閉じる。画像を見ながらキーだけで進めるように。
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [go, onClose])

  // 選んでいるサムネイルが帯からはみ出さないよう追いかける
  useEffect(() => {
    stripRef.current?.querySelector('[data-on="1"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [idx])

  const cur = images[idx]
  if (!cur) return null

  // 同じ対象者が続く間は名前を出さない（帯の区切りだけ出す）
  const isPersonHead = (i: number) => i === 0 || images[i - 1].person !== images[i].person
  const sameCount = images.filter(v => v.person === cur.person).length
  const noInPerson = images.slice(0, idx + 1).filter(v => v.person === cur.person).length

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col" onClick={onClose}>
      <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-6" onClick={e => e.stopPropagation()}>
        {/* 見出し */}
        <div className="flex items-center gap-2 text-white mb-2.5 flex-wrap">
          <span className="text-[15px] font-semibold">{cur.person || '対象者 未設定'}</span>
          <span className="text-[12px] text-white/60">{noInPerson}／{sameCount}枚</span>
          <span className="text-[12px] text-white/40 truncate max-w-[280px]">{cur.fileName ?? ''}</span>
          <span className="text-[11.5px] text-white/40 ml-2 hidden sm:inline">← → で送る</span>
          <div className="ml-auto flex items-center gap-1.5">
            {onEdit && (
              <button type="button" onClick={() => onEdit(cur.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-semibold bg-white/10 text-white hover:bg-white/20">
                <Pencil className="w-3.5 h-3.5" />書き込みを編集
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="閉じる"
              className="p-1.5 rounded-md text-white/80 hover:bg-white/15"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* 画像 */}
        <div className="flex-1 min-h-0 flex items-center gap-2 sm:gap-3">
          <NavBtn dir="prev" disabled={idx === 0} onClick={() => go(-1)} />
          <div className="flex-1 min-w-0 h-full bg-white/5 rounded-lg overflow-auto flex items-start justify-center p-2">
            {cur.url
              ? <AnnotatedImage url={cur.url} annos={cur.annos} className="max-w-full" />
              : <span className="text-white/50 text-[13px] self-center">読み込み中…</span>}
          </div>
          <NavBtn dir="next" disabled={idx === images.length - 1} onClick={() => go(1)} />
        </div>

        {/* 全員ぶんの帯。対象者ごとに区切って並べる */}
        <div ref={stripRef} className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1">
          {images.map((v, i) => (
            <div key={v.id} className="flex items-center gap-1.5 flex-none">
              {isPersonHead(i) && (
                <>
                  {i > 0 && <span className="w-px h-7 bg-white/25 mx-1" />}
                  <span className="text-[11px] text-white/60 whitespace-nowrap pr-0.5">{v.person || '未設定'}</span>
                </>
              )}
              <button type="button" data-on={i === idx ? '1' : '0'} onClick={() => setIdx(i)}
                title={`${v.person}：${v.fileName ?? '画像'}`}
                className={`w-11 h-9 rounded overflow-hidden border bg-white/10 ${
                  i === idx ? 'border-white ring-2 ring-white/70' : 'border-white/25 hover:border-white/60'}`}>
                {v.url
                  ? <AnnotatedImage url={v.url} annos={v.annos} className="w-full h-full object-cover" />
                  : <span className="block w-full h-full" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function NavBtn({ dir, disabled, onClick }: { dir: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      aria-label={dir === 'prev' ? '前の画像' : '次の画像'}
      className="flex-none p-2 sm:p-3 rounded-lg text-white bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:hover:bg-white/10">
      <Icon className="w-6 h-6" strokeWidth={2} />
    </button>
  )
}
