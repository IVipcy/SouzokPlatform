'use client'

// 一覧フィルタ用の軽量な複数選択ドロップダウン。
// ボタン（ラベル＋選択件数バッジ）をクリックで開き、チェックボックスで複数選択する。
// 選択は OR 条件（どれか該当すれば表示）として呼び出し側で使う。

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'

type Props = {
  label: string
  icon?: LucideIcon
  /** 選択肢（表示順そのまま）。データに存在しないものは呼び出し側で除外して渡す。 */
  options: string[]
  /** 現在の選択値 */
  selected: Set<string>
  /** 選択が変わったとき */
  onChange: (next: Set<string>) => void
  /** ドロップダウンの最小幅(px) */
  width?: number
}

export default function MultiSelectFilter({ label, icon: Icon, options, selected, onChange, width = 200 }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const toggle = (v: string) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v); else next.add(v)
    onChange(next)
  }

  const count = selected.size

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border transition-colors ${
          count > 0
            ? 'bg-white text-brand-700 border-brand-300'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
        }`}
      >
        {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={2} />}
        {label}
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold bg-brand-100 text-brand-700">
            {count}
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-60" strokeWidth={2} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden"
          style={{ minWidth: width }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-[12px] font-semibold text-gray-500">{label}</span>
            <span className="text-[11px] text-brand-600">{count > 0 ? `${count}件選択` : '未選択'}</span>
          </div>
          <div className="max-h-[260px] overflow-y-auto p-1">
            {options.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-gray-400 text-center">選択肢がありません</div>
            ) : options.map(opt => {
              const on = selected.has(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors ${on ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-brand-600 border-brand-600' : 'bg-white border-gray-300'}`}>
                    {on && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                  </span>
                  <span className="text-[13px] text-gray-800 truncate">{opt}</span>
                </button>
              )
            })}
          </div>
          {count > 0 && (
            <div className="px-3 py-2 border-t border-gray-100">
              <button type="button" onClick={() => onChange(new Set())} className="text-[12px] text-gray-500 hover:text-brand-600">
                クリア
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
