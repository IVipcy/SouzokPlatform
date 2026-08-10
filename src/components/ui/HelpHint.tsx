'use client'

// 見出しやタブの横に置く小さな「?」。押すと説明が出る。
//
// 判定の決まりごと（何件を数えているか・色が何を意味するか）は、
// 画面に常時書くと邪魔だが、書かないと毎回聞かれる。押したときだけ出す形にしている。

import { useState } from 'react'
import { HelpCircle } from 'lucide-react'

export default function HelpHint({ title, align = 'left', width = 320, children }: {
  title?: string
  /** ふきだしを左寄せ（既定）か右寄せか。画面右端に置くときは right。 */
  align?: 'left' | 'right'
  width?: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="説明を見る"
        aria-expanded={open}
        className={`inline-flex items-center justify-center rounded-full transition-colors ${
          open ? 'text-brand-600' : 'text-gray-400 hover:text-brand-600'}`}
      >
        <HelpCircle className="w-4 h-4" strokeWidth={2} />
      </button>
      {open && (
        <>
          {/* 外側をクリックしたら閉じる */}
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <span
            className={`absolute top-6 z-50 block rounded-lg border border-gray-200 bg-white shadow-lg px-3.5 py-3 text-[12px] leading-relaxed text-gray-700 text-left font-normal ${
              align === 'right' ? 'right-0' : 'left-0'}`}
            style={{ width }}
          >
            {title && <span className="block text-[12.5px] font-bold text-gray-900 mb-1.5">{title}</span>}
            {children}
          </span>
        </>
      )}
    </span>
  )
}
