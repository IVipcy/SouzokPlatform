'use client'

// 画像＋書き込み（マーカー・メモ・枠）を1枚の canvas に描く。
// サムネイル・拡大表示・相続関係説明図の脇 など、見るところ全部でこれを使う。
// 元画像は変えず、書き込みは毎回上から描き直す。回転（rotation）も表示のときに掛ける。

import { useEffect, useRef } from 'react'
import { drawAnnotations, drawImageRotated, rotatedSize, type Anno } from '@/lib/imageAnnotations'

export default function AnnotatedImage({ url, annos, rotation = 0, className }: {
  url?: string
  annos: Anno[]
  /** 表示の回転（0/90/180/270。時計回り）。書き込みは回した後の向きの座標 */
  rotation?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const cv = ref.current
      if (!alive || !cv) return
      const nat = rotatedSize(img.naturalWidth, img.naturalHeight, rotation)
      const w = cv.parentElement?.clientWidth ?? 400
      const h = Math.round((nat.h / nat.w) * w)
      const dpr = window.devicePixelRatio || 1
      cv.width = w * dpr; cv.height = h * dpr
      cv.style.width = `${w}px`; cv.style.height = `${h}px`
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawImageRotated(ctx, img, rotation, w, h)
      drawAnnotations(ctx, annos, w, h)
    }
    img.src = url
    return () => { alive = false }
  }, [url, annos, rotation])
  return <canvas ref={ref} className={`block max-w-full ${className ?? ''}`} />
}
