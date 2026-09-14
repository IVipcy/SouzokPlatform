'use client'

// 見出し等の横に置く「?」ヘルプ。常時表示のヘルプ文をホバー／クリックに畳んで画面のごちゃつきを防ぐ。
// ホバー（PC）でもクリック／タップ（タブレット）でも開く。押したくなるよう色付き＋ホバーで拡大。
// 吹き出しは body に出す（portal・fixed）。項目名の面（overflow-hidden / truncate）や横スクロールの表の中に
// 置いても切れないようにするため。
// 使い方: <HintTip text="…説明…" />  ／ 見出しに寄せる場合は <SectionHeading hint="…" /> 経由でも可。
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function HintTip({ text, className = '', width = 244 }: { text: string; className?: string; width?: number }) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const open = hover || pinned

  // 吹き出しの位置：ボタンの下、左右は画面からはみ出さないところ
  const place = () => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 8
    const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, margin), window.innerWidth - width - margin)
    setPos({ top: r.bottom + 6, left })
  }

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
        onClick={e => { e.stopPropagation(); place(); setPinned(p => !p) }}
        onMouseEnter={() => { place(); setHover(true) }}
        onMouseLeave={() => setHover(false)}
        aria-label={text}
        className={`inline-flex items-center justify-center w-[16px] h-[16px] rounded-full text-[10px] font-bold leading-none select-none cursor-pointer transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300
          ${open ? 'bg-brand-600 text-white border border-brand-600 scale-110' : 'bg-brand-50 text-brand-600 border border-brand-200 hover:bg-brand-600 hover:text-white hover:scale-110'}`}
      >
        ?
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <span
          role="tooltip"
          style={{ width, top: pos.top, left: pos.left, position: 'fixed' }}
          className="z-[9999] bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          <span className="block text-[10px] font-bold text-brand-600 mb-1 tracking-[0.08em]">ヒント</span>
          {/* 段落で区切った説明も入るので改行をそのまま出す */}
          <span className="block text-[12px] text-gray-700 leading-relaxed font-normal whitespace-pre-wrap">{text}</span>
        </span>,
        document.body,
      )}
    </span>
  )
}
