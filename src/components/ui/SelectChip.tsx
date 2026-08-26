'use client'

// 選択チップの統一スタイル（受注内容・実施業務・依頼者特徴・難しい理由など、全選択UIで共通）。
// 未選択＝薄グレー面（枠なし）／選択＝ブランド青塗り＋✓／選択不可＝淡色。
// 単一選択でも複数選択でも同じ見た目にして、画面ごとのばらつきをなくす。
import { Check } from 'lucide-react'

export default function SelectChip({ on, disabled, onClick, title, children }: {
  on: boolean
  disabled?: boolean
  onClick?: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 px-4 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition select-none ${
        disabled
          ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
          : on
            ? 'bg-brand-600 text-white'
            : 'bg-[#F3F5F8] text-gray-500 hover:bg-gray-200'
      }`}
    >
      {on && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
      {children}
    </button>
  )
}
