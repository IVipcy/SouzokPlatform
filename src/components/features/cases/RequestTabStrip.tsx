'use client'

// 請求タブの列（1タブ＝1請求）。戸籍・不動産で共用。
//
// 1行に固定して横スクロール。折り返して2段・3段になると、何個目の請求かも
// どれが開いているかも読めなくなるため。右端は薄いフェードで「まだ続きがある」と見せ、
// 開いているタブが隠れていれば自動でそこまで寄せる。最後に「＋」タブ（請求を追加）。

import { useEffect, useRef, type ReactNode } from 'react'
import { Plus, ChevronRight } from 'lucide-react'

export type RequestTab = {
  id: string
  /** タブ名（宛先の種類バッジなどを含めてよい） */
  label: ReactNode
  /** ホバーの全文 */
  title?: string
  /** 状態バッジ（未請求／請求中／確認待ち／一部不足／完了） */
  status?: { label: string; cls: string }
  /** 完了した請求は薄く沈める */
  finished?: boolean
}

export function RequestTabStrip({ tabs, activeId, onSelect, onAdd, addTitle = '請求を追加' }: {
  tabs: RequestTab[]
  activeId: string | null
  onSelect: (id: string) => void
  onAdd?: () => void
  addTitle?: string
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  // 開いているタブが見えるところまで寄せる（横スクロールの外に隠れないように）
  useEffect(() => {
    const el = rowRef.current?.querySelector<HTMLElement>('[data-on="1"]')
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, tabs.length])

  return (
    <div className="relative border-b border-gray-200 mb-3 shadow-[0_2px_3px_-1px_rgba(15,23,42,0.10)]">
      <div ref={rowRef} className="flex items-end gap-1 overflow-x-auto whitespace-nowrap pr-10" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(t => {
          const on = t.id === activeId
          return (
            <button key={t.id} type="button" onClick={() => onSelect(t.id)} title={t.title} data-on={on ? '1' : undefined}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-[13px] rounded-t-lg border border-b-0 -mb-px transition-colors flex-none ${
                on ? 'relative z-10 bg-white border-gray-200 text-gray-800 font-semibold shadow-[0_-2px_6px_rgba(15,23,42,0.06),0_3px_0_0_#fff]'
                  : `bg-gray-50 border-transparent hover:text-gray-800 ${t.finished ? 'text-gray-400' : 'text-gray-500'}`}`}>
              {t.label}
              {t.status && <span className={`text-[12px] tracking-wider px-2 py-[1px] rounded-full flex-none ${t.status.cls}`}>{t.status.label}</span>}
            </button>
          )
        })}
        {onAdd && (
          <button type="button" onClick={onAdd} title={addTitle}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[13px] font-semibold text-brand-700 rounded-t-lg border border-b-0 border-dashed border-gray-300 bg-white hover:bg-brand-50 -mb-px flex-none">
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {/* 右端のフェード。続きがあることだけ言う（押すものではない） */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-r from-transparent to-white flex items-center justify-end pr-1 text-gray-300">
        <ChevronRight className="w-4 h-4" />
      </div>
    </div>
  )
}
