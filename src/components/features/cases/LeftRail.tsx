'use client'

// 左レール（縦リスト）共通部品。TOP＋各項目＋追加ボタンを縦に並べ、横並びの深いタブを置き換える。
import { Table2 } from 'lucide-react'
import { summaryStatusClass } from './ProgressSummary'
import type { ReactNode } from 'react'

export type RailItem = { key: string; label: string; status?: string | null; locked?: boolean }

export function LeftRail({ items, active, onChange, extra }: {
  items: RailItem[]
  active: string
  onChange: (key: string) => void
  extra?: ReactNode
}) {
  return (
    <div className="flex-none w-40 flex flex-col gap-0.5 border-r border-gray-200 pr-2">
      {items.map(it => (
        <button key={it.key} type="button" onClick={() => onChange(it.key)}
          className={`text-left text-[12px] px-2.5 py-1.5 rounded-md flex items-center gap-1.5 ${active === it.key ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>
          {it.key === 'top'
            ? <Table2 className="w-3.5 h-3.5 flex-none" />
            : <span className={`w-1.5 h-1.5 rounded-full flex-none border ${summaryStatusClass(it.status)}`} />}
          <span className="truncate">{it.label}</span>
        </button>
      ))}
      {extra}
    </div>
  )
}
