'use client'

// 少しスクロールしたら右下に出現し、押すと最上部へスムーズスクロールするボタン。
// 縦長の入力画面（オーダーシート等）で「一気に上へ」戻るための共通部品。PC・スマホ共通。

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

export default function BackToTopButton() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    const id = requestAnimationFrame(onScroll)  // 初期判定は次フレームで（同期setState回避）
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(id) }
  }, [])

  if (!show) return null

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="上に戻る"
      title="上に戻る"
      className="fixed bottom-24 right-5 z-40 w-11 h-11 rounded-full bg-white border border-gray-300 shadow-lg flex items-center justify-center text-gray-600 hover:text-brand-700 hover:border-brand-300 transition"
    >
      <ArrowUp className="w-5 h-5" strokeWidth={2} />
    </button>
  )
}
