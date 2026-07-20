'use client'

// 見出し等の横に置く「?」ヘルプ。常時表示のヘルプ文をホバー／クリックに畳んで画面のごちゃつきを防ぐ。
// ホバー（PC）でもクリック／タップ（タブレット）でも開く。押したくなるよう色付き＋ホバーで拡大。
// 使い方: <HintTip text="…説明…" />  ／ 見出しに寄せる場合は <SectionHeading hint="…" /> 経由でも可。
import { useState, useRef, useEffect } from 'react'

export default function HintTip({ text, className = '', width = 244 }: { text: string; className?: string; width?: number }) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const open = hover || pinned

  // クリックで開いた（pinned）ときは、外側クリックで閉じる。
  useEffect(() => {
    if (!pinned) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setPinned(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [pinned])

  return (
    <span ref={ref} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setPinned(p => !p) }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={text}
        className={`inline-flex items-center justify-center w-[16px] h-[16px] rounded-full text-[10px] font-bold leading-none select-none cursor-pointer transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300
          ${open ? 'bg-brand-600 text-white border border-brand-600 scale-110' : 'bg-brand-50 text-brand-600 border border-brand-200 hover:bg-brand-600 hover:text-white hover:scale-110'}`}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          style={{ width }}
          className="absolute top-[150%] left-1/2 -translate-x-1/2 z-50 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          <span className="block text-[10px] font-bold text-brand-600 mb-1 tracking-[0.08em]">ヒント</span>
          <span className="block text-[12px] text-gray-700 leading-relaxed font-normal">{text}</span>
        </span>
      )}
    </span>
  )
}
