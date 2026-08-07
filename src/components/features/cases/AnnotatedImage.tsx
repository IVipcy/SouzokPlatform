'use client'

// 画像＋書き込み（マーカー・メモ）を1枚の canvas に描く。
// サムネイル・拡大表示・相続関係説明図の脇 など、見るところ全部でこれを使う。
// 元画像は変えず、書き込みは毎回上から描き直す。

import { useEffect, useRef } from 'react'
import { drawAnnotations, type Anno } from '@/lib/imageAnnotations'

export default function AnnotatedImage({ url, annos, className }: {
  url?: string
  annos: Anno[]
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
      const w = cv.parentElement?.clientWidth ?? 400
      const h = Math.round((img.naturalHeight / img.naturalWidth) * w)
      const dpr = window.devicePixelRatio || 1
      cv.width = w * dpr; cv.height = h * dpr
      cv.style.width = `${w}px`; cv.style.height = `${h}px`
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.drawImage(img, 0, 0, w, h)
      drawAnnotations(ctx, annos, w, h)
    }
    img.src = url
    return () => { alive = false }
  }, [url, annos])
  return <canvas ref={ref} className={`block max-w-full ${className ?? ''}`} />
}
